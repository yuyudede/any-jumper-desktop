import type { AgentEvent, AgentTurn, ProgressNote, ToolCall, TurnTokenUsage } from "../types";
export type { TurnTokenUsage };

export type ThinkingTraceStatus = "pending" | "running" | "completed" | "error";
export type ThinkingTraceKind = "task" | "tool" | "note" | "reasoning";

export interface ThinkingTraceItem {
  id: string;
  kind: ThinkingTraceKind;
  title: string;
  status: ThinkingTraceStatus;
  detail?: string;
  name?: string;
  createdAt?: number;
  completedAt?: number;
}

export interface ThinkingTraceSection {
  turnId: string;
  status: ThinkingTraceStatus;
  startedAt?: number;
  completedAt?: number;
  durationLabel?: string;
  summary: string;
  items: ThinkingTraceItem[];
  tokenUsage?: TurnTokenUsage;
}

export type ThinkingTraceByTurn = Record<string, ThinkingTraceSection>;

export interface ThinkingTraceLookup {
  traceByTurn: ThinkingTraceByTurn;
  turnId?: string;
  turn?: AgentTurn;
  toolCalls?: ToolCall[];
  progressNotes?: ProgressNote[];
}

export function thinkingTraceSectionForTurn({
  traceByTurn,
  turnId,
  turn,
  toolCalls = [],
  progressNotes = [],
}: ThinkingTraceLookup): ThinkingTraceSection | undefined {
  const id = turnId || turn?.id;
  if (!id) return undefined;

  const persistedItems = [
    ...progressNotes.map(progressNoteToTraceItem),
    ...toolCalls.map(toolCallToTraceItem),
  ].sort(compareTraceItems);

  const liveSection = traceByTurn[id];
  if (liveSection) {
    return finalizeSection({
      ...liveSection,
      status: turn ? mergeSectionStatus(liveSection.status, turn.status) : liveSection.status,
      startedAt: earliestTimestamp(liveSection.startedAt, turn?.startedAt, firstStartedAt([...progressNotes, ...toolCalls])),
      completedAt: liveSection.completedAt ?? turn?.completedAt,
      items: liveSection.items.length > 0 || persistedItems.length === 0
        ? liveSection.items
        : persistedItems,
    });
  }

  if (!turn && persistedItems.length === 0) return undefined;
  return finalizeSection({
    turnId: id,
    status: turn ? turnStatusToTraceStatus(turn.status) : "completed",
    startedAt: turn?.startedAt ?? firstStartedAt([...progressNotes, ...toolCalls]),
    completedAt: turn?.completedAt ?? lastCompletedAt([...progressNotes, ...toolCalls]),
    summary: "",
    items: persistedItems,
  });
}

export function reduceThinkingTraceByTurn(
  current: ThinkingTraceByTurn,
  event: AgentEvent,
): ThinkingTraceByTurn {
  if (!event.turnId) return current;

  if (event.event === "turn.started") {
    const turn = asRecord(event.payload);
    return updateSection(current, event.turnId, event.createdAt, (section) => ({
      ...section,
      status: "running",
      startedAt: earliestTimestamp(section.startedAt, numberValue(turn?.startedAt), event.createdAt),
    }));
  }

  if (event.event === "task.updated") {
    const taskItems = extractTaskItems(event.payload, event.createdAt);
    if (taskItems.length === 0) return current;
    return updateSection(current, event.turnId, event.createdAt, (section) => ({
      ...section,
      status: section.status === "pending" ? "running" : section.status,
      items: [
        ...taskItems,
        ...section.items.filter((item) => item.kind !== "task"),
      ],
    }));
  }

  if (event.event === "tool.started") {
    const payload = asRecord(event.payload);
    const name = stringValue(payload?.name) || "tool";
    return upsertTraceItem(current, event.turnId, event.createdAt, {
      id: toolTraceId(event, name),
      kind: "tool",
      name,
      title: `调用工具：${name}`,
      status: "running",
      detail: toolInputSummary(payload?.input),
      createdAt: event.createdAt,
    });
  }

  if (event.event === "progress.note") {
    const note = progressNoteToTraceItem(event.payload, event.createdAt);
    if (!note.title) return current;
    return upsertTraceItem(current, event.turnId, event.createdAt, note);
  }

  if (event.event === "approval.requested") {
    const payload = asRecord(event.payload);
    const name = stringValue(payload?.toolName) || "tool";
    return upsertTraceItem(current, event.turnId, event.createdAt, {
      id: toolTraceId(event, name),
      kind: "tool",
      name,
      title: `调用工具：${name}`,
      status: "running",
      detail: "等待用户审批",
      createdAt: event.createdAt,
    });
  }

  if (event.event === "tool.completed") {
    const payload = asRecord(event.payload);
    const name = stringValue(payload?.name) || "tool";
    const status = normalizeToolStatus(payload?.status);
    return upsertTraceItem(current, event.turnId, event.createdAt, {
      id: toolTraceId(event, name),
      kind: "tool",
      name,
      title: `调用工具：${name}`,
      status,
      detail: status === "error" ? outputSummary(payload?.output) : "完成",
      completedAt: event.createdAt,
    });
  }

  if (event.event === "tool.delta") {
    const payload = asRecord(event.payload);
    const name = stringValue(payload?.name) || "task";
    const status = normalizeDeltaStatus(payload?.status);
    return upsertTraceItem(current, event.turnId, event.createdAt, {
      id: `tool-delta:${name}`,
      kind: "tool",
      name,
      title: name === "task" ? "子任务" : `调用工具：${name}`,
      status,
      detail: outputSummary(payload?.input ?? payload?.output),
      createdAt: status === "running" ? event.createdAt : undefined,
      completedAt: status === "completed" ? event.createdAt : undefined,
    });
  }

  if (event.event === "turn.completed" || event.event === "turn.failed") {
    const status = event.event === "turn.completed" ? "completed" : "error";
    return updateSection(current, event.turnId, event.createdAt, (section) => ({
      ...section,
      status,
      completedAt: event.createdAt,
      items: section.items.map((item) =>
        item.status === "running" || item.status === "pending"
          ? { ...item, status, completedAt: item.completedAt ?? event.createdAt }
          : item,
      ),
    }));
  }

  return current;
}

function updateSection(
  current: ThinkingTraceByTurn,
  turnId: string,
  eventAt: number,
  updater: (section: ThinkingTraceSection) => ThinkingTraceSection,
): ThinkingTraceByTurn {
  const section = current[turnId] ?? emptySection(turnId, eventAt);
  return {
    ...current,
    [turnId]: finalizeSection(updater(section)),
  };
}

function upsertTraceItem(
  current: ThinkingTraceByTurn,
  turnId: string,
  eventAt: number,
  nextItem: ThinkingTraceItem,
): ThinkingTraceByTurn {
  return updateSection(current, turnId, eventAt, (section) => {
    const existingIndex = section.items.findIndex((item) => item.id === nextItem.id);
    const nextItems = existingIndex >= 0
      ? section.items.map((item, index) => (
        index === existingIndex
          ? mergeTraceItem(item, nextItem)
          : item
      ))
      : [...section.items, nextItem];
    return {
      ...section,
      status: section.status === "pending" ? "running" : section.status,
      items: nextItems,
    };
  });
}

function mergeTraceItem(current: ThinkingTraceItem, next: ThinkingTraceItem): ThinkingTraceItem {
  return {
    ...current,
    ...next,
    detail: next.detail ?? current.detail,
    name: next.name ?? current.name,
    createdAt: current.createdAt ?? next.createdAt,
    completedAt: next.completedAt ?? current.completedAt,
  };
}

function emptySection(turnId: string, eventAt: number): ThinkingTraceSection {
  return {
    turnId,
    status: "running",
    startedAt: eventAt,
    summary: "等待模型响应",
    items: [],
  };
}

function finalizeSection(section: ThinkingTraceSection): ThinkingTraceSection {
  const durationLabel = section.startedAt !== undefined && section.completedAt !== undefined
    ? formatDuration(section.startedAt, section.completedAt)
    : undefined;
  return {
    ...section,
    durationLabel,
    summary: buildSummary(section.items, section.status),
  };
}

function extractTaskItems(payload: unknown, createdAt: number): ThinkingTraceItem[] {
  const record = asRecord(payload);
  const rawItems = Array.isArray(record?.items)
    ? record.items
    : Array.isArray(record?.todos)
      ? record.todos
      : [];
  return rawItems
    .map((item, index) => {
      const row = asRecord(item);
      const title = stringValue(row?.content ?? row?.todo ?? row?.title ?? item);
      if (!title) return undefined;
      return {
        id: `task:${stringValue(row?.id) || index + 1}`,
        kind: "task" as const,
        title,
        status: normalizeTraceStatus(row?.status),
        createdAt,
      };
    })
    .filter(Boolean) as ThinkingTraceItem[];
}

function toolCallToTraceItem(toolCall: ToolCall): ThinkingTraceItem {
  const status = normalizeToolStatus(toolCall.status);
  const input = parseJson(toolCall.inputJson);
  return {
    id: `tool:${toolCall.id}`,
    kind: "tool",
    name: toolCall.name,
    title: `调用工具：${toolCall.name}`,
    status,
    detail: toolCallDetail(status, input, toolCall.output),
    createdAt: toolCall.startedAt,
    completedAt: toolCall.completedAt,
  };
}

function progressNoteToTraceItem(note: unknown, fallbackCreatedAt?: number): ThinkingTraceItem {
  const record = asRecord(note);
  const content = stringValue(record?.content ?? record?.message ?? record?.title);
  const id = stringValue(record?.id) || stableTraceId(content || "progress", fallbackCreatedAt);
  const kind = stringValue(record?.kind) === "reasoning" ? "reasoning" : "note";
  return {
    id: `${kind}:${id}`,
    kind,
    title: content,
    status: normalizeTraceStatus(record?.status ?? "completed"),
    createdAt: numberValue(record?.createdAt) ?? fallbackCreatedAt,
    completedAt: numberValue(record?.completedAt),
  };
}

function toolCallDetail(status: ThinkingTraceStatus, input: unknown, output?: string) {
  if (status === "error") return outputSummary(output) || "失败";
  if (status === "running") return toolInputSummary(input) || "运行中";
  if (status === "pending") return "等待执行";
  return "完成";
}

function buildSummary(items: ThinkingTraceItem[], status: ThinkingTraceStatus) {
  const noteItems = items.filter((item) => item.kind === "note");
  const reasoningItems = items.filter((item) => item.kind === "reasoning");
  const toolItems = items.filter((item) => item.kind === "tool");
  if (toolItems.length > 0) {
    const explorationCount = toolItems.filter(isExplorationTool).length;
    const commandCount = toolItems.filter(isCommandTool).length;
    const parts = [
      noteItems.length > 0 ? `记录 ${noteItems.length} 条进度` : "",
      reasoningItems.length > 0 ? `捕获 ${reasoningItems.length} 条公开推理` : "",
      explorationCount > 0 ? `已探索 ${explorationCount} 个文件` : "",
      commandCount > 0 ? `已运行 ${commandCount} 条命令` : "",
      `调用 ${toolItems.length} 次工具`,
    ].filter(Boolean);
    return parts.join(" · ");
  }

  if (reasoningItems.length > 0) {
    const notePart = noteItems.length > 0 ? `记录 ${noteItems.length} 条进度` : "";
    const reasoningPart = `捕获 ${reasoningItems.length} 条公开推理`;
    return [notePart, reasoningPart].filter(Boolean).join(" · ");
  }

  if (noteItems.length > 0) {
    if (status === "running") return `正在记录 ${noteItems.length} 条进度`;
    if (status === "error") return `进度中断 · ${noteItems.length} 条`;
    return `记录 ${noteItems.length} 条进度`;
  }

  if (items.length > 0) {
    if (status === "running") return `正在处理 ${items.length} 个步骤`;
    if (status === "error") return `处理失败 · ${items.length} 个步骤`;
    return `完成 ${items.length} 个步骤`;
  }

  if (status === "running") return "等待模型响应";
  if (status === "error") return "处理失败";
  return "没有工具调用";
}

function isExplorationTool(item: ThinkingTraceItem) {
  const name = (item.name || "").toLowerCase();
  return [
    "read",
    "read_file",
    "glob",
    "search",
    "list",
    "find",
    "grep",
    "rg",
    "ls",
  ].some((keyword) => name.includes(keyword));
}

function isCommandTool(item: ThinkingTraceItem) {
  const name = (item.name || "").toLowerCase();
  return [
    "shell",
    "bash",
    "terminal",
    "exec",
    "exec_command",
    "command",
  ].some((keyword) => name.includes(keyword)) || Boolean(item.detail?.startsWith("命令："));
}

function normalizeTraceStatus(status: unknown): ThinkingTraceStatus {
  const value = String(status ?? "pending").toLowerCase();
  if (value.includes("error") || value.includes("fail") || value.includes("reject")) return "error";
  if (value.includes("done") || value.includes("complete") || value.includes("success")) return "completed";
  if (value.includes("progress") || value.includes("running") || value.includes("start")) return "running";
  return "pending";
}

function normalizeToolStatus(status: unknown): ThinkingTraceStatus {
  const value = String(status ?? "running").toLowerCase();
  if (value.includes("error") || value.includes("fail") || value.includes("reject")) return "error";
  if (value.includes("wait") || value.includes("running") || value.includes("start")) return "running";
  if (value.includes("pending")) return "pending";
  return "completed";
}

function normalizeDeltaStatus(status: unknown): ThinkingTraceStatus {
  const value = String(status ?? "running").toLowerCase();
  if (value.includes("error") || value.includes("fail")) return "error";
  if (value.includes("complete") || value.includes("success") || value.includes("done")) return "completed";
  return "running";
}

function turnStatusToTraceStatus(status: unknown): ThinkingTraceStatus {
  const value = String(status ?? "").toLowerCase();
  if (value.includes("fail") || value.includes("error")) return "error";
  if (value.includes("running") || value.includes("queued")) return "running";
  if (value.includes("pending")) return "pending";
  return "completed";
}

function mergeSectionStatus(current: ThinkingTraceStatus, turnStatus: string) {
  const status = turnStatusToTraceStatus(turnStatus);
  if (status === "completed" || status === "error") return status;
  return current === "completed" || current === "error" ? current : status;
}

function toolTraceId(event: AgentEvent, name: string) {
  return `tool:${event.toolCallId || name}`;
}

function toolInputSummary(value: unknown) {
  const record = asRecord(value);
  if (record?.command) return `命令：${String(record.command)}`;
  if (record?.path) return `路径：${String(record.path)}`;
  if (record?.query) return `查询：${String(record.query)}`;
  if (record?.pattern) return `匹配：${String(record.pattern)}`;
  return outputSummary(value);
}

function outputSummary(value: unknown) {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === "string" ? value : safeJson(value);
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > 160 ? `${normalized.slice(0, 160)}...` : normalized;
}

function formatDuration(startedAt: number, completedAt: number) {
  const seconds = Math.max(1, Math.ceil(Math.max(0, completedAt - startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

function stableTraceId(content: string, createdAt?: number) {
  return `${createdAt ?? "live"}:${content}`.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "note";
}

function compareTraceItems(a: ThinkingTraceItem, b: ThinkingTraceItem) {
  return (a.createdAt ?? 0) - (b.createdAt ?? 0);
}

function firstStartedAt(items: Array<ToolCall | ProgressNote>) {
  const values = items.map((item) => "createdAt" in item ? item.createdAt : item.startedAt).filter(Number.isFinite);
  return values.length > 0 ? Math.min(...values) : undefined;
}

function lastCompletedAt(items: Array<ToolCall | ProgressNote>) {
  const values = items
    .map((item) => item.completedAt)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length > 0 ? Math.max(...values) : undefined;
}

function earliestTimestamp(...values: Array<number | undefined>) {
  const finiteValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return finiteValues.length > 0 ? Math.min(...finiteValues) : undefined;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
