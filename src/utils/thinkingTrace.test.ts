import { describe, expect, it } from "vitest";
import type { AgentEvent, AgentTurn, ProgressNote, ToolCall } from "../types";
import {
  reduceThinkingTraceByTurn,
  thinkingTraceSectionForTurn,
} from "./thinkingTrace";

function event(partial: Partial<AgentEvent>): AgentEvent {
  return {
    event: "task.updated",
    threadId: "thread-1",
    turnId: "turn-1",
    payload: {},
    createdAt: 1_000,
    ...partial,
  };
}

function turn(partial: Partial<AgentTurn> = {}): AgentTurn {
  return {
    id: "turn-1",
    threadId: "thread-1",
    status: "completed",
    runtimeId: "runtime",
    providerId: "provider",
    model: "model",
    permissionMode: "workspaceWrite",
    startedAt: 1_000,
    completedAt: 80_000,
    ...partial,
  };
}

function toolCall(partial: Partial<ToolCall>): ToolCall {
  return {
    id: "tool-1",
    threadId: "thread-1",
    turnId: "turn-1",
    name: "read_file",
    status: "success",
    inputJson: "{}",
    requiresApproval: false,
    startedAt: 2_000,
    completedAt: 3_000,
    ...partial,
  };
}

function progressNote(partial: Partial<ProgressNote>): ProgressNote {
  return {
    id: "note-1",
    threadId: "thread-1",
    turnId: "turn-1",
    content: "我先确认事件流里是否已经有公开进度。",
    status: "completed",
    createdAt: 1_500,
    ...partial,
  };
}

describe("thinking trace reducer", () => {
  it("maps task updates into a running turn section", () => {
    const trace = reduceThinkingTraceByTurn({}, event({
      payload: {
        items: [
          { id: "context", content: "整理上下文", status: "completed" },
          { id: "reply", content: "生成回复", status: "running" },
        ],
      },
    }));

    const section = thinkingTraceSectionForTurn({
      traceByTurn: trace,
      turnId: "turn-1",
    });

    expect(section).toMatchObject({
      turnId: "turn-1",
      status: "running",
      startedAt: 1_000,
    });
    expect(section?.items).toEqual([
      { id: "task:context", kind: "task", title: "整理上下文", status: "completed", createdAt: 1_000 },
      { id: "task:reply", kind: "task", title: "生成回复", status: "running", createdAt: 1_000 },
    ]);
  });

  it("keeps repeated tool calls and records failed tool details", () => {
    let trace = reduceThinkingTraceByTurn({}, event({
      event: "tool.started",
      toolCallId: "tool-1",
      createdAt: 2_000,
      payload: { name: "search", input: { query: "AgentPage" } },
    }));
    trace = reduceThinkingTraceByTurn(trace, event({
      event: "tool.completed",
      toolCallId: "tool-1",
      createdAt: 3_000,
      payload: { name: "search", status: "success", output: "ok" },
    }));
    trace = reduceThinkingTraceByTurn(trace, event({
      event: "tool.started",
      toolCallId: "tool-2",
      createdAt: 4_000,
      payload: { name: "search", input: { query: "theme.css" } },
    }));
    trace = reduceThinkingTraceByTurn(trace, event({
      event: "tool.completed",
      toolCallId: "tool-2",
      createdAt: 5_000,
      payload: { name: "search", status: "error", output: "ENOENT: not a directory" },
    }));

    const section = thinkingTraceSectionForTurn({ traceByTurn: trace, turnId: "turn-1" });

    expect(section?.items).toMatchObject([
      { id: "tool:tool-1", kind: "tool", title: "调用工具：search", status: "completed", detail: "完成" },
      { id: "tool:tool-2", kind: "tool", title: "调用工具：search", status: "error", detail: "ENOENT: not a directory" },
    ]);
  });

  it("maps progress notes into public trace items without treating them as tools", () => {
    const trace = reduceThinkingTraceByTurn({}, event({
      event: "progress.note",
      createdAt: 1_500,
      payload: progressNote({
        content: "我先确认事件流里是否已经有公开进度。",
        status: "running",
      }),
    }));

    const section = thinkingTraceSectionForTurn({
      traceByTurn: trace,
      turnId: "turn-1",
    });

    expect(section?.items).toMatchObject([
      {
        id: "note:note-1",
        kind: "note",
        title: "我先确认事件流里是否已经有公开进度。",
        status: "running",
        createdAt: 1_500,
      },
    ]);
    expect(section?.summary).toBe("正在记录 1 条进度");
  });

  it("uses the persisted turn start when the live trace starts from a later event", () => {
    const trace = reduceThinkingTraceByTurn({}, event({
      event: "progress.note",
      createdAt: 60_000,
      payload: progressNote({
        content: "模型还在处理，我先同步一下当前进度。",
        status: "running",
        createdAt: 60_000,
      }),
    }));

    const section = thinkingTraceSectionForTurn({
      traceByTurn: trace,
      turn: turn({ status: "running", startedAt: 1_000, completedAt: undefined }),
    });

    expect(section?.startedAt).toBe(1_000);
  });

  it("maps provider-exposed reasoning notes separately from progress notes", () => {
    const section = thinkingTraceSectionForTurn({
      traceByTurn: {},
      turn: turn(),
      progressNotes: [
        progressNote({
          id: "note-1",
          kind: "progress",
          content: "正在构建模型上下文。",
          createdAt: 1_500,
        }),
        progressNote({
          id: "reasoning-1",
          kind: "reasoning",
          content: "The user is saying hello, so answer briefly in Chinese.",
          createdAt: 2_000,
        }),
      ],
    });

    expect(section?.summary).toBe("记录 1 条进度 · 捕获 1 条公开推理");
    expect(section?.items).toMatchObject([
      { id: "note:note-1", kind: "note", title: "正在构建模型上下文。" },
      { id: "reasoning:reasoning-1", kind: "reasoning", title: "The user is saying hello, so answer briefly in Chinese." },
    ]);
  });

  it("adds duration and collapsed summary when a turn completes", () => {
    let trace = reduceThinkingTraceByTurn({}, event({
      event: "turn.started",
      createdAt: 1_000,
      payload: turn({ status: "running", completedAt: undefined }),
    }));
    trace = reduceThinkingTraceByTurn(trace, event({
      event: "tool.started",
      toolCallId: "tool-1",
      createdAt: 2_000,
      payload: { name: "read_file", input: { path: "src/pages/AgentPage.tsx" } },
    }));
    trace = reduceThinkingTraceByTurn(trace, event({
      event: "tool.completed",
      toolCallId: "tool-1",
      createdAt: 3_000,
      payload: { name: "read_file", status: "success", output: "ok" },
    }));
    trace = reduceThinkingTraceByTurn(trace, event({
      event: "tool.started",
      toolCallId: "tool-2",
      createdAt: 10_000,
      payload: { name: "shell", input: { command: "pnpm test" } },
    }));
    trace = reduceThinkingTraceByTurn(trace, event({
      event: "turn.completed",
      createdAt: 80_000,
      payload: { status: "completed" },
    }));

    const section = thinkingTraceSectionForTurn({ traceByTurn: trace, turnId: "turn-1" });

    expect(section).toMatchObject({
      status: "completed",
      completedAt: 80_000,
      durationLabel: "1m 19s",
    });
    expect(section?.summary).toContain("已探索 1 个文件");
    expect(section?.summary).toContain("已运行 1 条命令");
    expect(section?.summary).toContain("调用 2 次工具");
  });

  it("adds duration and error summary when a turn fails", () => {
    let trace = reduceThinkingTraceByTurn({}, event({
      event: "turn.started",
      createdAt: 1_000,
      payload: turn({ status: "running", completedAt: undefined }),
    }));
    trace = reduceThinkingTraceByTurn(trace, event({
      event: "task.updated",
      createdAt: 2_000,
      payload: {
        items: [{ id: "reply", content: "生成回复", status: "running" }],
      },
    }));
    trace = reduceThinkingTraceByTurn(trace, event({
      event: "turn.failed",
      createdAt: 5_000,
      payload: { message: "model unavailable" },
    }));

    const section = thinkingTraceSectionForTurn({ traceByTurn: trace, turnId: "turn-1" });

    expect(section).toMatchObject({
      status: "error",
      completedAt: 5_000,
      durationLabel: "4s",
      summary: "处理失败 · 1 个步骤",
    });
    expect(section?.items[0]).toMatchObject({
      status: "error",
    });
  });

  it("rebuilds a completed section from persisted turns and tool calls", () => {
    const section = thinkingTraceSectionForTurn({
      traceByTurn: {},
      turn: turn(),
      progressNotes: [
        progressNote({
          id: "note-1",
          content: "我已经定位到 reducer 只接工具事件。",
          createdAt: 1_500,
        }),
      ],
      toolCalls: [
        toolCall({
          id: "tool-1",
          name: "read_file",
          inputJson: JSON.stringify({ path: "src/pages/AgentPage.tsx" }),
        }),
        toolCall({
          id: "tool-2",
          name: "shell",
          status: "error",
          inputJson: JSON.stringify({ command: "pnpm test" }),
          output: "1 failed",
          startedAt: 4_000,
          completedAt: 5_000,
        }),
      ],
    });

    expect(section).toMatchObject({
      turnId: "turn-1",
      status: "completed",
      durationLabel: "1m 19s",
    });
    expect(section?.summary).toContain("记录 1 条进度");
    expect(section?.summary).toContain("已探索 1 个文件");
    expect(section?.summary).toContain("已运行 1 条命令");
    expect(section?.items).toMatchObject([
      { id: "note:note-1", kind: "note", title: "我已经定位到 reducer 只接工具事件。", status: "completed" },
      { id: "tool:tool-1", title: "调用工具：read_file", status: "completed", detail: "完成" },
      { id: "tool:tool-2", title: "调用工具：shell", status: "error", detail: "1 failed" },
    ]);
  });
});
