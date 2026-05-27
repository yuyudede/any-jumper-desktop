import type { AgentEvent, SubagentTask, SubagentTaskStatus } from "../types";

const SUMMARY_LIMIT = 200;

export type SubagentTasksByThreadId = Record<string, SubagentTask[]>;

export function reduceSubagentTasksByThreadId(
  current: SubagentTasksByThreadId,
  event: AgentEvent,
): SubagentTasksByThreadId {
  const existing = current[event.threadId];
  const previous = existing ?? [];
  const next = reduceSubagentTasks(previous, event);

  if (next === previous) return current;
  if (next.length === 0) {
    if (!existing) return current;
    const { [event.threadId]: _removed, ...rest } = current;
    return rest;
  }

  return { ...current, [event.threadId]: next };
}

export function reduceSubagentTasks(
  current: SubagentTask[],
  event: AgentEvent,
): SubagentTask[] {
  if (event.event === "turn.started") return [];

  if (event.event === "turn.failed") {
    return sortTasks(current.map((task) =>
      task.status === "running"
        ? { ...task, status: "failed", completedAt: event.createdAt }
        : task,
    ));
  }

  if (event.event === "turn.completed" && asRecord(event.payload)?.status === "interrupted") {
    return sortTasks(current.map((task) =>
      task.status === "running"
        ? { ...task, status: "failed", completedAt: event.createdAt }
        : task,
    ));
  }

  if (event.event !== "tool.delta") return current;

  const payload = asRecord(event.payload);
  if (payload?.name !== "task") return current;

  const status = normalizeStatus(payload.status);
  if (!status) return current;

  if (status === "running") {
    const id = taskIdFromEvent(event, payload) || `task:${event.turnId ?? event.threadId}:${event.createdAt}`;
    const fallbackTitle = `子代理 ${current.length + 1}`;
    const agentType = taskAgentType(payload.input);
    const nextTask: SubagentTask = {
      id,
      title: taskTitle(payload.input, fallbackTitle),
      ...(agentType ? { agentType } : {}),
      status: "running",
      createdAt: event.createdAt,
    };
    return sortTasks(upsertTask(current, nextTask));
  }

  const id = taskIdFromEvent(event, payload);
  const completedTask = completeTask(current, id, {
    status,
    summary: outputSummary(payload.output),
    completedAt: event.createdAt,
  });

  return sortTasks(completedTask);
}

function upsertTask(current: SubagentTask[], nextTask: SubagentTask): SubagentTask[] {
  const exists = current.some((task) => task.id === nextTask.id);
  if (!exists) return [nextTask, ...current];
  return current.map((task) =>
    task.id === nextTask.id
      ? { ...task, ...nextTask, createdAt: task.createdAt }
      : task,
  );
}

function completeTask(
  current: SubagentTask[],
  id: string | undefined,
  update: Pick<SubagentTask, "status" | "completedAt"> & { summary?: string },
): SubagentTask[] {
  const targetId = id || [...current].sort((a, b) => b.createdAt - a.createdAt)
    .find((task) => task.status === "running")?.id;
  if (!targetId) return current;

  return current.map((task) =>
    task.id === targetId
      ? {
        ...task,
        status: update.status,
        summary: update.summary,
        completedAt: update.completedAt,
      }
      : task,
  );
}

function normalizeStatus(value: unknown): SubagentTaskStatus | undefined {
  if (value === "started" || value === "running") return "running";
  if (value === "completed" || value === "success") return "completed";
  if (value === "failed" || value === "error") return "failed";
  return undefined;
}

function taskIdFromEvent(event: AgentEvent, payload: Record<string, unknown> | undefined) {
  return stringValue(event.toolCallId)
    || stringValue(payload?.toolCallId)
    || stringValue(payload?.tool_call_id);
}

function taskTitle(input: unknown, fallback: string) {
  return titleFromValue(input) || fallback;
}

function taskAgentType(input: unknown) {
  return agentTypeFromValue(input);
}

function agentTypeFromValue(value: unknown, depth = 0): string | undefined {
  if (depth > 4) return undefined;

  const record = recordValue(value);
  if (!record) return undefined;

  const direct = stringValue(record.subagent_type)
    || stringValue(record.subagentType)
    || stringValue(record.agent_type)
    || stringValue(record.agentType)
    || stringValue(record.type);
  if (direct) return direct;

  for (const key of ["input", "args", "kwargs", "tool_input", "request", "config"]) {
    const nested = agentTypeFromValue(record[key], depth + 1);
    if (nested) return nested;
  }

  return undefined;
}

function titleFromValue(value: unknown, depth = 0): string | undefined {
  if (depth > 4) return undefined;

  const record = recordValue(value);
  if (!record) {
    const text = stringValue(value);
    return text && text.length < 120 ? text : undefined;
  }

  const direct = stringValue(record.description)
    || stringValue(record.title)
    || stringValue(record.task)
    || firstPromptLine(record.prompt)
    || firstPromptLine(record.instructions);
  if (direct) return direct;

  for (const key of ["input", "args", "kwargs", "tool_input", "request", "config"]) {
    const nested = titleFromValue(record[key], depth + 1);
    if (nested) return nested;
  }

  return undefined;
}

function outputSummary(output: unknown) {
  const structuredSummary = structuredOutputSummary(output);
  if (structuredSummary) return structuredSummary.slice(0, SUMMARY_LIMIT);

  const text = stringValue(output) || stringifyValue(output);
  return text ? text.slice(0, SUMMARY_LIMIT) : undefined;
}

function structuredOutputSummary(output: unknown) {
  const record = recordValue(output);
  if (!record) return undefined;

  const update = recordValue(record.update);
  const files = recordValue(update?.files);
  if (files) {
    const paths = Object.keys(files);
    if (paths.length > 0) {
      const actor = stringValue(record.lg_name) || stringValue(record.name);
      const shownPaths = paths.slice(0, 2).join("、");
      const suffix = paths.length > 2 ? ` 等 ${paths.length} 个文件` : "";
      return `${actor ? `${actor} ` : ""}更新了 ${paths.length} 个文件：${shownPaths}${suffix}`;
    }
  }

  return stringValue(record.summary)
    || stringValue(record.message)
    || stringValue(record.output)
    || stringValue(record.content);
}

function sortTasks(tasks: SubagentTask[]) {
  return [...tasks].sort((a, b) => b.createdAt - a.createdAt);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  const record = asRecord(value);
  if (record) return record;
  if (typeof value !== "string") return undefined;
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function firstPromptLine(value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!firstLine) return undefined;
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

function stringifyValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
