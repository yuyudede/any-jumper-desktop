import type {
  AgentEvent,
  ToolCall,
  ToolCallEvent,
  ToolTraceKind,
  ToolTraceStatus,
} from "../types";

const PREVIEW_LIMIT = 8 * 1024;
const TRUNCATED_MARKER = "\n... 输出已截断";

export interface ToolTraceCardModel {
  id: string;
  turnId?: string;
  name: string;
  kind: ToolTraceKind;
  status: ToolTraceStatus;
  title: string;
  inputSummary?: string;
  outputPreview: string;
  progress: string[];
  startedAt?: number;
  completedAt?: number;
  defaultExpanded: boolean;
}

export type ToolTraceByTurn = Record<string, Record<string, ToolTraceCardModel>>;

export function reduceToolTraceByTurn(
  current: ToolTraceByTurn,
  event: AgentEvent,
): ToolTraceByTurn {
  if (!event.turnId) return current;
  if (!isToolTraceEvent(event.event)) return current;

  const payload = asRecord(event.payload);

  if (event.event === "turn.completed" || event.event === "turn.failed") {
    return updateTurnToolCards(current, event.turnId, event.createdAt, turnCompletionToolStatus(event.event, payload?.status));
  }

  const toolCallId = event.toolCallId || toolCallIdFromPayload(event.payload) || `event:${event.event}:${event.createdAt}`;
  const name = stringValue(payload?.name) || stringValue(payload?.toolName) || "tool";

  return updateCard(current, event.turnId, toolCallId, event.createdAt, (card) => {
    if (event.event === "tool.started") {
      const input = payload?.input;
      const kind = normalizeKind(payload?.kind, name);
      return finalizeCard({
        ...card,
        id: toolCallId,
        turnId: event.turnId,
        name,
        kind,
        status: "running",
        title: stringValue(payload?.summary) || titleForTool(name, "running", input),
        inputSummary: inputSummaryForTool(name, input),
        startedAt: card.startedAt ?? event.createdAt,
      });
    }

    if (event.event === "approval.requested") {
      const toolName = stringValue(payload?.toolName) || name;
      return finalizeCard({
        ...card,
        id: toolCallId,
        turnId: event.turnId,
        name: toolName,
        kind: normalizeKind(undefined, toolName),
        status: "waiting_approval",
        title: `等待审批：${toolName}`,
        progress: appendUnique(card.progress, stringValue(payload?.summary) || "等待用户审批"),
        startedAt: card.startedAt ?? event.createdAt,
      });
    }

    if (event.event === "tool.progress") {
      const message = stringValue(payload?.message) || stringValue(payload?.detail);
      return finalizeCard({
        ...card,
        progress: message ? appendUnique(card.progress, message) : card.progress,
      });
    }

    if (event.event === "tool.output.delta") {
      const delta = stringValue(payload?.delta);
      return finalizeCard({
        ...card,
        outputPreview: delta ? appendPreview(card.outputPreview, delta) : card.outputPreview,
      });
    }

    if (event.event === "tool.completed") {
      const status = normalizeCompletionStatus(payload?.status);
      const output = stringValue(payload?.preview) || stringValue(payload?.output);
      return finalizeCard({
        ...card,
        name,
        kind: card.kind || normalizeKind(undefined, name),
        status,
        title: titleForTool(name, status, payload?.input),
        outputPreview: output && !card.outputPreview ? appendPreview("", output) : card.outputPreview,
        completedAt: event.createdAt,
      });
    }
    return finalizeCard(card);
  });
}

export function buildToolTraceCardsForTurn({
  traceByTurn,
  turnId,
  toolCalls = [],
  toolCallEvents = [],
}: {
  traceByTurn: ToolTraceByTurn;
  turnId?: string;
  toolCalls?: ToolCall[];
  toolCallEvents?: ToolCallEvent[];
}): ToolTraceCardModel[] {
  if (!turnId) return [];
  const fromEvents = cardsFromEvents(toolCallEvents.filter((event) => event.turnId === turnId));
  const fallback = fallbackCards(toolCalls.filter((call) => call.turnId === turnId), fromEvents);
  const live = Object.values(traceByTurn[turnId] || {});
  const merged = new Map<string, ToolTraceCardModel>();

  for (const card of [...fallback, ...fromEvents, ...live]) {
    merged.set(card.id, finalizeCard({ ...(merged.get(card.id) || emptyCard(card.id, turnId, card.startedAt)), ...card }));
  }

  return [...merged.values()].sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
}

function cardsFromEvents(events: ToolCallEvent[]): ToolTraceCardModel[] {
  const cards = new Map<string, ToolTraceCardModel>();
  for (const event of events.sort((a, b) => a.createdAt - b.createdAt)) {
    const card = cards.get(event.toolCallId) || emptyCard(event.toolCallId, event.turnId, event.createdAt);
    if (event.eventType === "tool.started") {
      const metadata = asRecord(event.metadata);
      const name = stringValue(metadata?.name) || card.name;
      const input = metadata?.input;
      card.name = name;
      card.kind = normalizeKind(metadata?.kind, name);
      card.title = event.content || card.title;
      card.inputSummary = inputSummaryForTool(name, input);
      card.status = "running";
      card.startedAt = card.startedAt ?? event.createdAt;
    } else if (event.eventType === "tool.progress") {
      if (event.content) card.progress = appendUnique(card.progress, event.content);
    } else if (event.eventType === "tool.output.delta") {
      if (event.content) card.outputPreview = appendPreview(card.outputPreview, event.content);
    } else if (event.eventType === "tool.completed") {
      card.status = normalizeCompletionStatus(event.metadata?.status) === "running"
        ? "completed"
        : normalizeCompletionStatus(event.metadata?.status);
      card.completedAt = event.createdAt;
    }
    cards.set(event.toolCallId, finalizeCard(card));
  }
  return [...cards.values()];
}

function fallbackCards(toolCalls: ToolCall[], existing: ToolTraceCardModel[]) {
  const existingIds = new Set(existing.map((card) => card.id));
  return toolCalls
    .filter((call) => !existingIds.has(call.id))
    .map((call) => {
      const input = parseJson(call.inputJson);
      const status = normalizeToolCallStatus(call.status);
      return finalizeCard({
        id: call.id,
        turnId: call.turnId,
        name: call.name,
        kind: normalizeKind(undefined, call.name),
        status,
        title: titleForTool(call.name, status, input),
        inputSummary: inputSummaryForTool(call.name, input),
        outputPreview: call.output ? appendPreview("", call.output) : "",
        progress: [],
        startedAt: call.startedAt,
        completedAt: call.completedAt,
        defaultExpanded: false,
      });
    });
}

function updateCard(
  current: ToolTraceByTurn,
  turnId: string,
  toolCallId: string,
  eventAt: number,
  updater: (card: ToolTraceCardModel) => ToolTraceCardModel,
): ToolTraceByTurn {
  const section = current[turnId] || {};
  const card = section[toolCallId] || emptyCard(toolCallId, turnId, eventAt);
  return {
    ...current,
    [turnId]: {
      ...section,
      [toolCallId]: updater(card),
    },
  };
}

function updateTurnToolCards(
  current: ToolTraceByTurn,
  turnId: string,
  eventAt: number,
  status: ToolTraceStatus,
): ToolTraceByTurn {
  const section = current[turnId];
  if (!section || Object.keys(section).length === 0) return current;
  return {
    ...current,
    [turnId]: Object.fromEntries(
      Object.entries(section).map(([toolCallId, card]) => [
        toolCallId,
        finalizeCard({
          ...card,
          status: card.status === "running" || card.status === "pending" ? status : card.status,
          completedAt: card.completedAt ?? eventAt,
        }),
      ]),
    ),
  };
}

function emptyCard(id: string, turnId?: string, startedAt?: number): ToolTraceCardModel {
  return {
    id,
    turnId,
    name: "tool",
    kind: "other",
    status: "pending",
    title: "正在调用工具",
    outputPreview: "",
    progress: [],
    startedAt,
    defaultExpanded: true,
  };
}

function finalizeCard(card: ToolTraceCardModel): ToolTraceCardModel {
  return {
    ...card,
    defaultExpanded: ["running", "waiting_approval", "error", "rejected"].includes(card.status),
  };
}

function isToolTraceEvent(event: string) {
  return [
    "tool.started",
    "tool.progress",
    "tool.output.delta",
    "tool.completed",
    "approval.requested",
    "turn.completed",
    "turn.failed",
  ].includes(event);
}

function normalizeKind(value: unknown, name: string): ToolTraceKind {
  const kind = String(value || "");
  if (["shell", "git", "file", "search", "mcp", "task", "other"].includes(kind)) return kind as ToolTraceKind;
  if (name === "shell") return "shell";
  if (name.startsWith("git_")) return "git";
  if (["list_files", "read_file", "write_file", "edit_file", "glob"].includes(name)) return "file";
  if (["search", "grep"].includes(name)) return "search";
  if (name === "mcp_call") return "mcp";
  if (name === "task_update") return "task";
  return "other";
}

function normalizeCompletionStatus(status: unknown): ToolTraceStatus {
  const value = String(status || "success").toLowerCase();
  if (value.includes("error") || value.includes("fail")) return "error";
  if (value.includes("cancel")) return "cancelled";
  if (value.includes("reject")) return "rejected";
  if (value.includes("approval")) return "waiting_approval";
  if (value.includes("running")) return "running";
  return "completed";
}

function turnCompletionToolStatus(eventName: string, status: unknown): ToolTraceStatus {
  const value = stringValue(status).toLowerCase();
  if (value === "interrupted" || value === "cancelled" || value === "canceled") return "cancelled";
  return eventName === "turn.failed" ? "error" : "completed";
}

function normalizeToolCallStatus(status: string): ToolTraceStatus {
  if (status === "running") return "running";
  if (status === "waiting_approval") return "waiting_approval";
  if (status === "error") return "error";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "rejected") return "rejected";
  return "completed";
}

function titleForTool(name: string, status: ToolTraceStatus, input: unknown): string {
  const record = asRecord(input);
  const done = ["completed", "cancelled", "rejected", "error"].includes(status);
  const prefix = done ? "已" : "正在";
  if (name === "shell") return `${prefix}运行 ${stringValue(record?.command) || "shell 命令"}`;
  if (name === "read_file") return `${prefix}读取 ${stringValue(record?.path) || "文件"}`;
  if (name === "list_files") return `${prefix}列出 ${stringValue(record?.path) || "文件"}`;
  if (name === "write_file") return `${prefix}写入 ${stringValue(record?.path) || "文件"}`;
  if (name === "edit_file") return `${prefix}修改 ${stringValue(record?.path) || "文件"}`;
  if (name === "search" || name === "grep") return `${prefix}搜索 ${JSON.stringify(stringValue(record?.pattern) || "")}`;
  if (name === "glob") return `${prefix}匹配 ${stringValue(record?.pattern) || "文件"}`;
  if (name === "mcp_call") {
    const server = stringValue(record?.serverId ?? record?.server_id) || "server";
    const tool = stringValue(record?.toolName ?? record?.tool_name) || "tool";
    return `${prefix}调用 MCP ${server}.${tool}`;
  }
  if (name.startsWith("git_")) return `${prefix}执行 ${name.replace("_", " ")}`;
  if (name === "task_update") return `${prefix}更新任务`;
  return `${prefix}调用 ${name}`;
}

function inputSummaryForTool(name: string, input: unknown): string | undefined {
  const record = asRecord(input);
  if (name === "shell") return stringValue(record?.command);
  if (["read_file", "list_files", "write_file", "edit_file"].includes(name)) return stringValue(record?.path);
  if (["search", "grep", "glob"].includes(name)) return stringValue(record?.pattern);
  if (name === "mcp_call") {
    const server = stringValue(record?.serverId ?? record?.server_id);
    const tool = stringValue(record?.toolName ?? record?.tool_name);
    return [server, tool].filter(Boolean).join(".");
  }
  return undefined;
}

function appendPreview(current: string, delta: string) {
  const next = `${current}${delta}`;
  if (next.length <= PREVIEW_LIMIT) return next;
  return `${next.slice(0, PREVIEW_LIMIT)}${TRUNCATED_MARKER}`;
}

function appendUnique(values: string[], value: string) {
  if (values.includes(value)) return values;
  return [...values, value];
}

function toolCallIdFromPayload(payload: unknown) {
  const record = asRecord(payload);
  return stringValue(record?.toolCallId ?? record?.tool_call_id);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
