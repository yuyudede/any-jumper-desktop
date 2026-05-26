import { describe, expect, it } from "vitest";
import type { NormalizedUsageEvent } from "../types";
import {
  buildUsageTrendAxisTicks,
  buildUsageTrendPoints,
  buildUsageTrendYAxis,
  smoothUsageTrendPath,
  claudeCodeUsageEventsFromJsonl,
  codexUsageEventsFromJsonl,
  groupUsageByModel,
  groupUsageBySession,
  normalizeUsageTotals,
  parseClaudeCodeUsageLine,
  summarizeUsage,
} from "./usageStats";

describe("usageStats", () => {
  it("uses reported total tokens as the authoritative real total", () => {
    const totals = normalizeUsageTotals({
      inputTokens: 1_000,
      outputTokens: 500,
      cacheCreationTokens: 200,
      cacheReadTokens: 300,
      totalTokens: 1_500,
    });

    expect(totals.freshInputTokens).toBe(700);
    expect(totals.realTotalTokens).toBe(1_500);
    expect(totals.cacheHitRate).toBeCloseTo(0.25);
  });

  it("does not produce negative fresh input when cache read exceeds input tokens", () => {
    const totals = normalizeUsageTotals({
      inputTokens: 100,
      outputTokens: 40,
      cacheCreationTokens: 10,
      cacheReadTokens: 300,
      totalTokens: 440,
    });

    expect(totals.freshInputTokens).toBe(100);
    expect(totals.realTotalTokens).toBe(440);
    expect(totals.cacheHitRate).toBeCloseTo(300 / 410);
  });

  it("deducts cache reads for compatible providers when total tokens already include them", () => {
    const totals = normalizeUsageTotals({
      source: "any_jumper",
      providerKind: "anthropic-compatible",
      inputTokens: 100,
      outputTokens: 5,
      cacheReadTokens: 80,
      totalTokens: 105,
    });

    expect(totals.freshInputTokens).toBe(20);
    expect(totals.realTotalTokens).toBe(105);
  });

  it("normalizes mixed provider totals per event before summing", () => {
    const codex = usageEvent("codex", "codex_cli", "codex", "gpt-5.5", undefined, "codex-session", 100, 10);
    codex.providerKind = "codex";
    codex.cacheReadTokens = 80;
    codex.totalTokens = 110;
    const claude = usageEvent("claude", "claude_code", "anthropic", "claude-sonnet", undefined, "claude-session", 5, 2);
    claude.providerKind = "anthropic";
    claude.cacheReadTokens = 50;
    claude.totalTokens = 57;

    const summary = summarizeUsage([codex, claude]);

    expect(summary.inputTokens).toBe(105);
    expect(summary.outputTokens).toBe(12);
    expect(summary.cacheReadTokens).toBe(130);
    expect(summary.freshInputTokens).toBe(25);
    expect(summary.realTotalTokens).toBe(167);
    expect(summary.cacheHitRate).toBeCloseTo(130 / 155);
  });

  it("groups models by source/provider/model/workspace/session dimensions", () => {
    const events: NormalizedUsageEvent[] = [
      usageEvent("1", "any_jumper", "openai", "gpt-4.1", "ws-1", "s-1", 100, 25),
      usageEvent("2", "any_jumper", "openai", "gpt-4.1", "ws-1", "s-2", 200, 30),
      usageEvent("3", "codex_cli", "codex", "gpt-5-codex", undefined, "codex-a", 40, 20),
    ];

    const groups = groupUsageByModel(events);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      source: "any_jumper",
      providerId: "openai",
      model: "gpt-4.1",
      workspaceId: "ws-1",
      sessionCount: 2,
      inputTokens: 300,
      outputTokens: 55,
    });
    expect(groups[1]).toMatchObject({
      source: "codex_cli",
      providerId: "codex",
      model: "gpt-5-codex",
      sessionCount: 1,
    });
  });

  it("chooses the primary model in a multi-model session by largest real total tokens", () => {
    const events: NormalizedUsageEvent[] = [
      usageEvent("1", "any_jumper", "anthropic", "claude-haiku", "ws-1", "thread-1", 500, 40),
      usageEvent("2", "any_jumper", "anthropic", "claude-sonnet", "ws-1", "thread-1", 900, 120),
      usageEvent("3", "any_jumper", "anthropic", "claude-haiku", "ws-1", "thread-1", 100, 20),
    ];

    const [session] = groupUsageBySession(events);

    expect(session.sessionId).toBe("thread-1");
    expect(session.primaryModel).toBe("claude-sonnet");
    expect(session.modelBreakdown).toHaveLength(2);
    expect(session.modelBreakdown.map((model) => model.model)).toEqual(["claude-sonnet", "claude-haiku"]);
  });

  it("builds trend points as per-bucket usage instead of cumulative totals", () => {
    const events: NormalizedUsageEvent[] = [
      usageEvent("1", "any_jumper", "openai", "gpt-5.5", "ws-1", "thread-1", 100, 0),
      usageEvent("2", "any_jumper", "openai", "gpt-5.5", "ws-1", "thread-1", 0, 40),
    ];
    events[0].occurredAt = 1_000;
    events[1].occurredAt = 3_000;

    const points = buildUsageTrendPoints(events, 0, 4_000, 4);

    expect(points.map((point) => ({ input: point.input, output: point.output }))).toEqual([
      { input: 0, output: 0 },
      { input: 100, output: 0 },
      { input: 0, output: 0 },
      { input: 0, output: 40 },
    ]);
  });

  it("builds readable x-axis ticks for trend charts", () => {
    const points = Array.from({ length: 12 }, (_, index) => ({
      at: index * 1000,
      input: index,
      output: 0,
      cacheRead: 0,
      cacheCreation: 0,
    }));

    const ticks = buildUsageTrendAxisTicks(points, 5);

    expect(ticks[0]).toMatchObject({ pointIndex: 0, at: 0 });
    expect(ticks[ticks.length - 1]).toMatchObject({ pointIndex: 11, at: 11_000 });
    expect(ticks.length).toBeLessThanOrEqual(5);
    expect(new Set(ticks.map((tick) => tick.pointIndex)).size).toBe(ticks.length);
  });

  it("uses calendar day boundaries for week-range x-axis ticks", () => {
    const start = new Date("2026-05-19T00:00:00").getTime();
    const end = new Date("2026-05-25T23:59:59.999").getTime();
    const points = Array.from({ length: 36 }, (_, index) => ({
      at: start + ((end - start) * index) / 35,
      input: index,
      output: 0,
      cacheRead: 0,
      cacheCreation: 0,
    }));

    const ticks = buildUsageTrendAxisTicks(points, 8);

    expect(ticks.map((tick) => new Date(tick.at).getHours())).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(ticks.map((tick) => new Date(tick.at).getDate())).toEqual([19, 20, 21, 22, 23, 24, 25, 26]);
  });

  it("turns chart points into a smooth bezier path", () => {
    const path = smoothUsageTrendPath([
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: 20, y: 20 },
    ]);

    expect(path).toMatch(/^M 0,10 C /);
    expect(path).toContain("20,20");
  });

  it("uses one fixed y-axis unit across trend chart ticks", () => {
    const axis = buildUsageTrendYAxis(48_900_000);

    expect(axis.unitLabel).toBe("M tokens");
    expect(axis.ticks.map((tick) => tick.label)).toEqual(["0", "12.5", "25", "37.5", "50"]);
    expect(axis.ticks.every((tick) => tick.value <= axis.max)).toBe(true);
  });

  it("parses Claude Code usage with model and cache details from one JSONL line", () => {
    const parsed = parseClaudeCodeUsageLine(JSON.stringify({
      type: "assistant",
      timestamp: "2026-05-25T10:00:00.000Z",
      sessionId: "claude-session",
      message: {
        id: "msg_1",
        model: "claude-sonnet-4-5",
        stop_reason: "end_turn",
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          cache_creation_input_tokens: 30,
          cache_read_input_tokens: 40,
        },
      },
    }), { filePath: "/tmp/claude.jsonl", lineNumber: 7 });

    expect(parsed.error).toBeUndefined();
    expect(parsed.event).toMatchObject({
      eventKey: "message:msg_1",
      source: "claude_code",
      sessionId: "claude-session",
      model: "claude-sonnet-4-5",
      inputTokens: 100,
      outputTokens: 20,
      cacheCreationTokens: 30,
      cacheReadTokens: 40,
      totalTokens: 120,
    });
  });

  it("uses Claude Code message id as event key so repeated stream rows do not double count", () => {
    const line = JSON.stringify({
      type: "assistant",
      timestamp: "2026-05-25T10:00:00.000Z",
      sessionId: "claude-session",
      uuid: "row-a",
      message: {
        id: "msg_same",
        model: "deepseek-v4-pro",
        stop_reason: "end_turn",
        usage: {
          input_tokens: 100,
          output_tokens: 20,
        },
      },
    });

    const first = parseClaudeCodeUsageLine(line, { filePath: "/tmp/claude.jsonl", lineNumber: 7 });
    const repeated = parseClaudeCodeUsageLine(line.replace("row-a", "row-b"), { filePath: "/tmp/claude.jsonl", lineNumber: 8 });

    expect(first.event?.eventKey).toBe("message:msg_same");
    expect(repeated.event?.eventKey).toBe("message:msg_same");
  });

  it("keeps only final Claude Code assistant usage per message id", () => {
    const lines = [
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-05-25T10:00:00.000Z",
        sessionId: "claude-session",
        message: {
          id: "msg_streamed",
          model: "claude-sonnet-4-5",
          usage: { input_tokens: 100, output_tokens: 2 },
        },
      }),
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-05-25T10:00:01.000Z",
        sessionId: "claude-session",
        message: {
          id: "msg_streamed",
          model: "claude-sonnet-4-5",
          stop_reason: "end_turn",
          usage: {
            input_tokens: 100,
            output_tokens: 30,
            cache_creation_input_tokens: 10,
            cache_read_input_tokens: 20,
          },
        },
      }),
    ];

    const parsed = claudeCodeUsageEventsFromJsonl(lines.join("\n"), "/tmp/claude.jsonl");

    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]).toMatchObject({
      eventKey: "message:msg_streamed",
      outputTokens: 30,
      cacheCreationTokens: 10,
      cacheReadTokens: 20,
    });
  });

  it("returns a parse error for a broken Claude Code JSONL line instead of throwing", () => {
    const parsed = parseClaudeCodeUsageLine("{bad-json", { filePath: "/tmp/claude.jsonl", lineNumber: 2 });

    expect(parsed.event).toBeUndefined();
    expect(parsed.error).toContain("JSON");
  });

  it("converts Codex cumulative token_count totals to stable deltas for idempotent sync", () => {
    const lines = [
      JSON.stringify({
        timestamp: "2026-05-25T10:00:00.000Z",
        type: "event_msg",
        event_msg: {
          type: "token_count",
          model: "gpt-5-codex",
          total_token_usage: { input_tokens: 100, output_tokens: 10, cached_input_tokens: 20 },
        },
      }),
      JSON.stringify({
        timestamp: "2026-05-25T10:01:00.000Z",
        type: "event_msg",
        event_msg: {
          type: "token_count",
          model: "gpt-5-codex",
          total_token_usage: { input_tokens: 150, output_tokens: 25, cached_input_tokens: 30 },
        },
      }),
    ];

    const firstSync = codexUsageEventsFromJsonl(lines.join("\n"), "/tmp/codex.jsonl");
    const secondSync = codexUsageEventsFromJsonl(lines.join("\n"), "/tmp/codex.jsonl");

    expect(firstSync.events.map((event) => ({
      eventKey: event.eventKey,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      cacheReadTokens: event.cacheReadTokens,
    }))).toEqual([
      { eventKey: "event:1", inputTokens: 100, outputTokens: 10, cacheReadTokens: 20 },
      { eventKey: "event:2", inputTokens: 50, outputTokens: 15, cacheReadTokens: 10 },
    ]);
    expect(secondSync.events.map((event) => event.eventKey)).toEqual(["event:1", "event:2"]);
  });

  it("parses current Codex token_count events from payload.info and keeps session metadata", () => {
    const lines = [
      JSON.stringify({
        timestamp: "2026-05-25T09:59:59.000Z",
        type: "session_meta",
        payload: {
          session_id: "session-1",
        },
      }),
      JSON.stringify({
        timestamp: "2026-05-25T10:00:00.000Z",
        type: "turn_context",
        payload: {
          turn_id: "turn-1",
          cwd: "/Users/yude/Documents/workshop/any-jumper-desktop",
          model: "gpt-5.5",
        },
      }),
      JSON.stringify({
        timestamp: "2026-05-25T10:00:10.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: { input_tokens: 100, output_tokens: 10, cached_input_tokens: 20, total_tokens: 110 },
            last_token_usage: { input_tokens: 100, output_tokens: 10, cached_input_tokens: 20, total_tokens: 110 },
          },
        },
      }),
      JSON.stringify({
        timestamp: "2026-05-25T10:00:20.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: { input_tokens: 150, output_tokens: 25, cached_input_tokens: 30, total_tokens: 175 },
            last_token_usage: { input_tokens: 50, output_tokens: 15, cached_input_tokens: 10, total_tokens: 65 },
          },
        },
      }),
    ];

    const parsed = codexUsageEventsFromJsonl(lines.join("\n"), "/tmp/codex.jsonl");

    expect(parsed.errors).toEqual([]);
    expect(parsed.events.map((event) => ({
      model: event.model,
      sessionId: event.sessionId,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      cacheReadTokens: event.cacheReadTokens,
    }))).toEqual([
      { model: "gpt-5.5", sessionId: "session-1", inputTokens: 100, outputTokens: 10, cacheReadTokens: 20 },
      { model: "gpt-5.5", sessionId: "session-1", inputTokens: 50, outputTokens: 15, cacheReadTokens: 10 },
    ]);
  });

  it("does not reset Codex cumulative token totals when a new turn_context appears", () => {
    const lines = [
      JSON.stringify({
        type: "session_meta",
        payload: { session_id: "session-1" },
      }),
      JSON.stringify({
        type: "turn_context",
        payload: { turn_id: "turn-1", model: "gpt-5.5" },
      }),
      JSON.stringify({
        timestamp: "2026-05-25T10:00:10.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: { input_tokens: 100, output_tokens: 10, cached_input_tokens: 20 },
          },
        },
      }),
      JSON.stringify({
        type: "turn_context",
        payload: { turn_id: "turn-2", model: "gpt-5.5" },
      }),
      JSON.stringify({
        timestamp: "2026-05-25T10:00:20.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: { input_tokens: 150, output_tokens: 15, cached_input_tokens: 30 },
          },
        },
      }),
    ];

    const parsed = codexUsageEventsFromJsonl(lines.join("\n"), "/tmp/codex.jsonl");

    expect(parsed.events.map((event) => ({
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      cacheReadTokens: event.cacheReadTokens,
    }))).toEqual([
      { inputTokens: 100, outputTokens: 10, cacheReadTokens: 20 },
      { inputTokens: 50, outputTokens: 5, cacheReadTokens: 10 },
    ]);
  });

  it("clamps Codex cached input and skips negative cumulative deltas", () => {
    const lines = [
      JSON.stringify({
        type: "turn_context",
        payload: { model: "openai/GPT-5.4-20260305" },
      }),
      JSON.stringify({
        timestamp: "2026-05-25T10:00:10.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: { input_tokens: 100, output_tokens: 10, cached_input_tokens: 120 },
          },
        },
      }),
      JSON.stringify({
        timestamp: "2026-05-25T10:00:20.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: { input_tokens: 80, output_tokens: 5, cached_input_tokens: 60 },
          },
        },
      }),
    ];

    const parsed = codexUsageEventsFromJsonl(lines.join("\n"), "/tmp/codex.jsonl");

    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]).toMatchObject({
      model: "gpt-5.4",
      inputTokens: 100,
      cacheReadTokens: 100,
      outputTokens: 10,
    });
  });
});

function usageEvent(
  id: string,
  source: NormalizedUsageEvent["source"],
  providerId: string,
  model: string,
  workspaceId: string | undefined,
  sessionId: string,
  inputTokens: number,
  outputTokens: number,
): NormalizedUsageEvent {
  return {
    id,
    source,
    providerId,
    providerLabel: providerId,
    model,
    sessionId,
    sessionTitle: sessionId,
    workspaceId,
    workspaceName: workspaceId,
    inputTokens,
    outputTokens,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: inputTokens + outputTokens,
    occurredAt: 1,
  };
}
