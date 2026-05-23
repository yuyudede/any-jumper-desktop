# Realtime Tool Trace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render all agent tool calls as realtime Codex-like cards inside the chat transcript.

**Architecture:** Add a small tool trace protocol that is emitted by the Electron runtime, persisted as lightweight events, reduced in the renderer, and displayed by focused transcript components. The existing `tool_calls` table remains the final source of truth; `tool_call_events` provides recoverable realtime detail.

**Tech Stack:** Electron main process, React 18, TypeScript, Vitest, better-sqlite3, Node `spawn`.

---

## File Structure

- Modify `src/types/index.ts`: add `ToolCallEvent`, trace event payload types, and `ThreadDetail.toolCallEvents`.
- Create `src/utils/toolTrace.ts`: pure reducer/model builder for tool trace cards.
- Create `src/utils/toolTrace.test.ts`: TDD coverage for card creation, output deltas, approvals, truncation, and historical fallback.
- Create `src/components/ToolTraceCard.tsx`: compact Codex-like card and card group.
- Create `src/components/ToolTraceCard.test.tsx`: source-level smoke tests for transcript UI structure.
- Modify `src/pages/AgentPage.tsx`: group `toolCallEvents` by turn, reduce live events, render `ToolTraceGroup` inside assistant messages.
- Modify `src/styles/theme.css`: card layout, dark/light colors, output preview.
- Create `electron/toolTrace.ts`: shared main-process helpers for classification, summaries, redaction, truncation, and async command execution.
- Create `electron/toolTrace.test.ts`: TDD coverage for redaction, summaries, truncation, and streamed command output.
- Modify `electron/main.ts`: add `tool_call_events` table, storage methods, reporter, realtime event emission, tool instrumentation, and `thread_read` hydration.
- Modify `src/pages/AgentPage.messageLayout.test.ts`: assert tool trace group appears in assistant transcript and Inspector remains available.

## Task 1: Renderer Trace Model

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/utils/toolTrace.ts`
- Test: `src/utils/toolTrace.test.ts`

- [ ] **Step 1: Write failing reducer tests**

Add `src/utils/toolTrace.test.ts`:

```ts
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

  it("rebuilds cards from persisted tool events", () => {
    const cards = buildToolTraceCardsForTurn({
      traceByTurn: {},
      turnId: "turn-1",
      toolCalls: [toolCall({ output: "done" })],
      toolCallEvents: [
        toolEvent({ id: "event-1", eventType: "tool.started", content: "正在运行 pnpm test" }),
        toolEvent({ id: "event-2", eventType: "tool.output.delta", stream: "stdout", content: "done" }),
        toolEvent({ id: "event-3", eventType: "tool.completed", content: "成功" }),
      ],
    });

    expect(cards[0]).toMatchObject({
      id: "tool-1",
      status: "completed",
      outputPreview: "done",
    });
  });

  it("falls back to completed cards from old tool_calls rows", () => {
    const cards = buildToolTraceCardsForTurn({
      traceByTurn: {},
      turnId: "turn-1",
      toolCalls: [toolCall({ name: "read_file", inputJson: JSON.stringify({ path: "src/pages/AgentPage.tsx" }) })],
      toolCallEvents: [],
    });

    expect(cards[0]).toMatchObject({
      kind: "file",
      status: "completed",
      title: "已读取 src/pages/AgentPage.tsx",
    });
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm vitest run src/utils/toolTrace.test.ts`

Expected: FAIL because `src/utils/toolTrace.ts` and new types do not exist.

- [ ] **Step 3: Implement shared types**

In `src/types/index.ts`, add:

```ts
export type ToolTraceKind = "shell" | "git" | "file" | "search" | "mcp" | "task" | "other";
export type ToolTraceStatus = "pending" | "running" | "waiting_approval" | "completed" | "error" | "cancelled" | "rejected";

export interface ToolCallEvent {
  id: string;
  threadId: string;
  turnId?: string;
  toolCallId: string;
  eventType: string;
  stream?: "stdout" | "stderr" | "result" | "preview" | string;
  content?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}
```

Extend `ThreadDetail`:

```ts
toolCallEvents: ToolCallEvent[];
```

- [ ] **Step 4: Implement reducer/model builder**

Create `src/utils/toolTrace.ts` with pure functions:

```ts
import type { AgentEvent, ToolCall, ToolCallEvent, ToolTraceKind, ToolTraceStatus } from "../types";

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

export function reduceToolTraceByTurn(current: ToolTraceByTurn, event: AgentEvent): ToolTraceByTurn {
  // Implement upsert-by-turn/toolCallId for tool.started, tool.progress,
  // tool.output.delta, approval.requested, tool.completed, turn.completed, turn.failed.
}

export function buildToolTraceCardsForTurn(input: {
  traceByTurn: ToolTraceByTurn;
  turnId?: string;
  toolCalls?: ToolCall[];
  toolCallEvents?: ToolCallEvent[];
}): ToolTraceCardModel[] {
  // Merge live cards, persisted events, and old tool_calls fallback.
}
```

Implementation details:

- `classifyTool(name)` maps `shell` to `shell`, names starting `git_` to `git`, file tools to `file`, search tools to `search`, `mcp_call` to `mcp`, `task_update` to `task`.
- `titleForTool(name, status, input)` creates Chinese titles from the spec.
- `appendPreview` keeps at most 8KB and appends `\n... 输出已截断` once.
- `defaultExpanded` is true for `running`, `waiting_approval`, `error`, `rejected`; false for completed fallback cards.

- [ ] **Step 5: Run test to verify GREEN**

Run: `pnpm vitest run src/utils/toolTrace.test.ts`

Expected: PASS.

## Task 2: Main-Process Trace Helpers

**Files:**
- Create: `electron/toolTrace.ts`
- Test: `electron/toolTrace.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `electron/toolTrace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  classifyToolKind,
  createToolSummary,
  redactToolInput,
  runStreamedCommand,
  truncateToolOutput,
} from "./toolTrace";

describe("main tool trace helpers", () => {
  it("classifies host tools into stable display kinds", () => {
    expect(classifyToolKind("shell")).toBe("shell");
    expect(classifyToolKind("git_pull")).toBe("git");
    expect(classifyToolKind("read_file")).toBe("file");
    expect(classifyToolKind("search")).toBe("search");
    expect(classifyToolKind("mcp_call")).toBe("mcp");
  });

  it("redacts secret-looking input fields", () => {
    expect(redactToolInput({
      apiKey: "sk-live",
      nested: { authorization: "Bearer 123", path: "src/main.tsx" },
    })).toEqual({
      apiKey: "[redacted]",
      nested: { authorization: "[redacted]", path: "src/main.tsx" },
    });
  });

  it("creates human summaries for common tools", () => {
    expect(createToolSummary("shell", { command: "pnpm test" }, "running")).toBe("正在运行 pnpm test");
    expect(createToolSummary("read_file", { path: "src/pages/AgentPage.tsx" }, "completed")).toBe("已读取 src/pages/AgentPage.tsx");
    expect(createToolSummary("mcp_call", { serverId: "jira", toolName: "get_issue" }, "completed")).toBe("已调用 MCP jira.get_issue");
  });

  it("truncates persisted output with an explicit marker", () => {
    const output = truncateToolOutput("a".repeat(70_000), 64 * 1024);
    expect(output.length).toBeLessThan(70_000);
    expect(output).toContain("输出已截断");
  });

  it("streams stdout while preserving final output", async () => {
    const chunks: string[] = [];
    const result = await runStreamedCommand({
      command: "node -e \"console.log('one'); console.error('two')\"",
      cwd: process.cwd(),
      onOutput: (delta) => chunks.push(delta),
    });

    expect(result.output).toContain("one");
    expect(result.output).toContain("two");
    expect(chunks.join("")).toContain("one");
    expect(chunks.join("")).toContain("two");
    expect(result.exitCode).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm vitest run electron/toolTrace.test.ts`

Expected: FAIL because `electron/toolTrace.ts` does not exist.

- [ ] **Step 3: Implement helper module**

Create `electron/toolTrace.ts` exporting:

- `classifyToolKind(name)`
- `redactToolInput(input)`
- `createToolSummary(name, input, phase)`
- `truncateToolOutput(output, limit = 64 * 1024)`
- `runStreamedCommand({ command, cwd, timeoutMs, onOutput })`
- `runStreamedFile(command, args, options)` for git-style command arrays

Use Node `spawn`; collect stdout/stderr into final output; call `onOutput(delta, stream)` for both stdout and stderr.

- [ ] **Step 4: Run test to verify GREEN**

Run: `pnpm vitest run electron/toolTrace.test.ts`

Expected: PASS.

## Task 3: Storage And Runtime Event Pipeline

**Files:**
- Modify: `electron/main.ts`
- Test: use existing `electron/toolTrace.test.ts` plus focused TypeScript validation

- [ ] **Step 1: Add failing source assertion test**

Append to `electron/toolTrace.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

it("main process declares persistent tool call events", () => {
  const source = readFileSync(resolve(process.cwd(), "electron/main.ts"), "utf8");

  expect(source).toContain("CREATE TABLE IF NOT EXISTS tool_call_events");
  expect(source).toContain("insertToolCallEvent");
  expect(source).toContain("toolCallEvents:");
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm vitest run electron/toolTrace.test.ts`

Expected: FAIL because storage and hydration are not implemented.

- [ ] **Step 3: Add database table and mapping**

Modify `electron/main.ts`:

- Add `tool_call_events` table in `migrate()`.
- Add `insertToolCallEvent(event: ToolCallEvent)`.
- Add `listToolCallEvents(threadId: string)`.
- Add `mapToolCallEvent(row)`.
- Extend `readThread()` to include:

```ts
toolCallEvents: this.db.prepare("SELECT * FROM tool_call_events WHERE thread_id=? ORDER BY created_at ASC").all(threadId).map(mapToolCallEvent),
```

- [ ] **Step 4: Add reporter**

Inside `ToolService.invoke`, create a reporter with methods:

- `progress(message, detail?)`
- `output(delta, stream?)`
- `complete(status, output?, metadata?)`

Each method should:

1. Create a `ToolCallEvent` row.
2. Persist it through `storage.insertToolCallEvent`.
3. Emit matching `AgentEvent` through `emitAgentEvent`.

- [ ] **Step 5: Run test to verify GREEN**

Run: `pnpm vitest run electron/toolTrace.test.ts`

Expected: PASS.

## Task 4: Instrument All Tool Families

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/toolTrace.ts`
- Test: `electron/toolTrace.test.ts`

- [ ] **Step 1: Add failing source assertions for all tool families**

Add to `electron/toolTrace.test.ts`:

```ts
it("all host tool families receive trace progress", () => {
  const source = readFileSync(resolve(process.cwd(), "electron/main.ts"), "utf8");

  expect(source).toContain("execute(ctx, name, input ?? {}, reporter)");
  expect(source).toContain("listFiles(ctx.workspaceRoot, ctx.permissionMode, input, reporter)");
  expect(source).toContain("shellCommand(ctx.workspaceRoot, input.command, reporter)");
  expect(source).toContain("gitRun(ctx.workspaceRoot, [\"pull\", \"--ff-only\"], reporter)");
  expect(source).toContain("mcpCall(input.serverId ?? input.server_id, input.toolName ?? input.tool_name, input.input ?? {}, reporter)");
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm vitest run electron/toolTrace.test.ts`

Expected: FAIL because tool implementations do not accept reporter yet.

- [ ] **Step 3: Change execute signature**

Change:

```ts
private async execute(ctx: ToolContext, name: string, input: AnyRecord): Promise<string>
```

to:

```ts
private async execute(ctx: ToolContext, name: string, input: AnyRecord, reporter: ToolTraceReporter): Promise<string>
```

Pass reporter to every tool.

- [ ] **Step 4: Instrument fast file/search tools**

Add progress calls:

- `listFiles`: `reporter.progress("正在列出文件", target)`, then `reporter.progress("已列出 X 个条目")`
- `readTextFile`: `reporter.progress("正在读取文件", target)`, then `reporter.output(preview, "preview")`
- `searchFiles`: `reporter.progress("正在搜索", pattern)`, then `reporter.progress("已命中 X 条")`
- `globFiles`: `reporter.progress("正在匹配文件", pattern)`, then `reporter.progress("已匹配 X 个文件")`
- `writeTextFile`: `reporter.progress("正在写入文件", target)`
- `editTextFile`: `reporter.progress("正在编辑文件", target)`, then replacement count

- [ ] **Step 5: Instrument shell/git/mcp**

- Replace `shellCommand` internals with `runStreamedCommand`.
- Replace `gitRun` internals with `runStreamedFile`.
- Add `reporter.progress("已发送 MCP 请求")` and `reporter.progress("等待 MCP 响应")` around `mcpCall`.
- Keep returned final string compatible with existing callers.

- [ ] **Step 6: Run tests**

Run: `pnpm vitest run electron/toolTrace.test.ts`

Expected: PASS.

## Task 5: Transcript UI Cards

**Files:**
- Create: `src/components/ToolTraceCard.tsx`
- Modify: `src/pages/AgentPage.tsx`
- Modify: `src/styles/theme.css`
- Modify: `src/pages/AgentPage.messageLayout.test.ts`

- [ ] **Step 1: Write failing transcript layout tests**

Append to `src/pages/AgentPage.messageLayout.test.ts`:

```ts
it("renders realtime tool trace cards inside assistant messages", () => {
  const source = readProjectFile("src/pages/AgentPage.tsx");
  const cardSource = readProjectFile("src/components/ToolTraceCard.tsx");
  const css = readProjectFile("src/styles/theme.css");

  expect(source).toContain("<ToolTraceGroup");
  expect(source).toContain("toolCallEventsByTurn");
  expect(source).toContain("reduceToolTraceByTurn");
  expect(cardSource).toContain("tool-trace-card");
  expect(cardSource).toContain("tool-trace-output");
  expect(css).toContain(".tool-trace-card");
  expect(css).toContain(".tool-trace-output");
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm vitest run src/pages/AgentPage.messageLayout.test.ts`

Expected: FAIL because the component and integration do not exist.

- [ ] **Step 3: Create card component**

Create `src/components/ToolTraceCard.tsx`:

```tsx
import { Check, ChevronDown, Clock3, TerminalSquare, XCircle } from "lucide-react";
import { useState } from "react";
import type { ToolTraceCardModel } from "../utils/toolTrace";

export function ToolTraceGroup({ cards }: { cards: ToolTraceCardModel[] }) {
  if (cards.length === 0) return null;
  return <div className="tool-trace-group">{cards.map((card) => <ToolTraceCard key={card.id} card={card} />)}</div>;
}

function ToolTraceCard({ card }: { card: ToolTraceCardModel }) {
  const [expanded, setExpanded] = useState(card.defaultExpanded);
  return (
    <section className={`tool-trace-card is-${card.status}`}>
      <button className="tool-trace-toggle" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <TerminalSquare size={16} />
        <span className="tool-trace-title">{card.title}</span>
        <span className="tool-trace-status">{statusLabel(card.status)}</span>
        <ChevronDown size={15} />
      </button>
      {expanded ? (
        <div className="tool-trace-body">
          <div className="tool-trace-meta">{card.kind}{card.inputSummary ? ` · ${card.inputSummary}` : ""}</div>
          {card.progress.length > 0 ? <ul className="tool-trace-progress">{card.progress.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : null}
          {card.outputPreview ? <pre className="tool-trace-output">{card.outputPreview}</pre> : null}
        </div>
      ) : null}
    </section>
  );
}

function statusLabel(status: ToolTraceCardModel["status"]) {
  if (status === "running") return "运行中";
  if (status === "waiting_approval") return "等待审批";
  if (status === "error") return "失败";
  if (status === "cancelled") return "已取消";
  if (status === "rejected") return "已拒绝";
  return "成功";
}
```

- [ ] **Step 4: Integrate into AgentPage**

In `AgentPage.tsx`:

- Import `ToolTraceGroup`.
- Import reducer/model functions from `src/utils/toolTrace.ts`.
- Add `toolTraceByTurn` state.
- Add `toolCallEventsByTurn` memo.
- In `handleAgentEvent`, call `reduceToolTraceByTurn`.
- In assistant message article, compute cards with `buildToolTraceCardsForTurn`.
- Render `<ToolTraceGroup cards={toolCards} />` before markdown content.
- Update `shouldReloadThreadAfterAgentEvent` to exclude `tool.progress` and `tool.output.delta`.
- Update `applyEvent` to append `toolCallEvents`.

- [ ] **Step 5: Add CSS**

Append scoped styles for:

- `.tool-trace-group`
- `.tool-trace-card`
- `.tool-trace-toggle`
- `.tool-trace-title`
- `.tool-trace-status`
- `.tool-trace-body`
- `.tool-trace-progress`
- `.tool-trace-output`

Match the selected Codex-like compact card direction: dark neutral block, 8-12px radius, monospace output, no nested decorative cards.

- [ ] **Step 6: Run UI source test**

Run: `pnpm vitest run src/pages/AgentPage.messageLayout.test.ts`

Expected: PASS.

## Task 6: Full Validation

**Files:**
- All touched files

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm vitest run src/utils/toolTrace.test.ts electron/toolTrace.test.ts src/pages/AgentPage.messageLayout.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

Expected: PASS.

- [ ] **Step 3: Run full tests**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 4: Run build**

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 5: Commit or record no-git workspace**

Run: `git rev-parse --show-toplevel`.

Expected in this workspace: command fails with `not a git repository`. Record this in the final response instead of attempting a commit.
