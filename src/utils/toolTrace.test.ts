import { describe, expect, it } from "vitest";
import type { AgentEvent, ToolCall, ToolCallEvent } from "../types";
import {
  buildToolTraceCardsForTurn,
  reduceToolTraceByTurn,
} from "./toolTrace";

function event(partial: Partial<AgentEvent>): AgentEvent {
  return {
    event: "tool.started",
    threadId: "thread-1",
    turnId: "turn-1",
    toolCallId: "tool-1",
    payload: {},
    createdAt: 1_000,
    ...partial,
  };
}

function toolCall(partial: Partial<ToolCall>): ToolCall {
  return {
    id: "tool-1",
    threadId: "thread-1",
    turnId: "turn-1",
    name: "shell",
    status: "success",
    inputJson: JSON.stringify({ command: "pnpm test" }),
    output: "ok",
    requiresApproval: false,
    startedAt: 1_000,
    completedAt: 2_000,
    ...partial,
  };
}

function toolEvent(partial: Partial<ToolCallEvent>): ToolCallEvent {
  return {
    id: "event-1",
    threadId: "thread-1",
    turnId: "turn-1",
    toolCallId: "tool-1",
    eventType: "tool.started",
    content: "正在运行 pnpm test",
    createdAt: 1_000,
    ...partial,
  };
}

describe("tool trace reducer", () => {
  it("creates a running shell card and appends output deltas", () => {
    let trace = reduceToolTraceByTurn({}, event({
      payload: {
        name: "shell",
        kind: "shell",
        summary: "正在运行 pnpm test",
        input: { command: "pnpm test" },
      },
    }));
    trace = reduceToolTraceByTurn(trace, event({
      event: "tool.output.delta",
      createdAt: 1_200,
      payload: { stream: "stdout", delta: "PASS src/utils/toolTrace.test.ts\n" },
    }));

    const cards = buildToolTraceCardsForTurn({
      traceByTurn: trace,
      turnId: "turn-1",
    });

    expect(cards).toMatchObject([
      {
        id: "tool-1",
        kind: "shell",
        status: "running",
        title: "正在运行 pnpm test",
        outputPreview: "PASS src/utils/toolTrace.test.ts\n",
        defaultExpanded: true,
      },
    ]);
  });

  it("marks approval requests as waiting and expanded", () => {
    const trace = reduceToolTraceByTurn({}, event({
      event: "approval.requested",
      payload: { toolName: "git_push", summary: "运行 git push" },
    }));

    const cards = buildToolTraceCardsForTurn({ traceByTurn: trace, turnId: "turn-1" });

    expect(cards[0]).toMatchObject({
      status: "waiting_approval",
      title: "等待审批：git_push",
      defaultExpanded: true,
    });
  });

  it("marks running tools as cancelled when the turn is interrupted", () => {
    let trace = reduceToolTraceByTurn({}, event({
      payload: {
        name: "shell",
        kind: "shell",
        summary: "正在运行 pnpm test",
        input: { command: "pnpm test" },
      },
    }));
    trace = reduceToolTraceByTurn(trace, event({
      event: "turn.completed",
      createdAt: 1_500,
      payload: { status: "interrupted" },
    }));

    const cards = buildToolTraceCardsForTurn({
      traceByTurn: trace,
      turnId: "turn-1",
    });

    expect(cards[0]).toMatchObject({
      status: "cancelled",
      title: "正在运行 pnpm test",
      completedAt: 1_500,
    });
  });

  it("does not create a phantom generic tool card when a turn completes", () => {
    let trace = reduceToolTraceByTurn({}, event({
      payload: {
        name: "shell",
        kind: "shell",
        summary: "正在运行 echo $((190+100))",
        input: { command: "echo $((190+100))" },
      },
    }));
    trace = reduceToolTraceByTurn(trace, event({
      event: "tool.completed",
      createdAt: 1_300,
      payload: {
        name: "shell",
        status: "success",
        output: "290",
      },
    }));
    trace = reduceToolTraceByTurn(trace, event({
      event: "turn.completed",
      toolCallId: undefined,
      createdAt: 2_000,
      payload: { status: "completed" },
    }));

    const cards = buildToolTraceCardsForTurn({
      traceByTurn: trace,
      turnId: "turn-1",
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      id: "tool-1",
      status: "completed",
      outputPreview: "290",
    });
    expect(cards.map((card) => card.title)).not.toContain("正在调用工具");
  });

  it("rebuilds cards from persisted tool events", () => {
    const cards = buildToolTraceCardsForTurn({
      traceByTurn: {},
      turnId: "turn-1",
      toolCalls: [toolCall({ output: "done" })],
      toolCallEvents: [
        toolEvent({
          id: "event-1",
          eventType: "tool.started",
          content: "正在运行 pnpm test",
          metadata: { name: "shell", kind: "shell", input: { command: "pnpm test" } },
        }),
        toolEvent({ id: "event-2", eventType: "tool.output.delta", stream: "stdout", content: "done" }),
        toolEvent({ id: "event-3", eventType: "tool.completed", content: "成功" }),
      ],
    });

    expect(cards[0]).toMatchObject({
      id: "tool-1",
      kind: "shell",
      status: "completed",
      title: "正在运行 pnpm test",
      outputPreview: "done",
    });
  });

  it("falls back to completed cards from old tool_calls rows", () => {
    const cards = buildToolTraceCardsForTurn({
      traceByTurn: {},
      turnId: "turn-1",
      toolCalls: [
        toolCall({
          name: "read_file",
          inputJson: JSON.stringify({ path: "src/pages/AgentPage.tsx" }),
        }),
      ],
      toolCallEvents: [],
    });

    expect(cards[0]).toMatchObject({
      kind: "file",
      status: "completed",
      title: "已读取 src/pages/AgentPage.tsx",
    });
  });
});
