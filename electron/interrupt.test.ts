import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMainSource() {
  return readFileSync(resolve(process.cwd(), "electron/main.ts"), "utf8");
}

describe("turn interrupt wiring", () => {
  it("checks cancellation before persisting any new tool call", () => {
    const source = readMainSource();
    const invokeStart = source.indexOf("async invoke(ctx: ToolContext");
    const cancelGuard = source.indexOf("this.isTurnCancelled(ctx.turnId)", invokeStart);
    const insertToolCall = source.indexOf("storage.insertToolCall(call)", invokeStart);

    expect(invokeStart).toBeGreaterThan(-1);
    expect(cancelGuard).toBeGreaterThan(invokeStart);
    expect(insertToolCall).toBeGreaterThan(invokeStart);
    expect(cancelGuard).toBeLessThan(insertToolCall);
  });

  it("aborts the running model stream and clears queued work when the user stops", () => {
    const source = readMainSource();

    expect(source).toContain("private turnAbortControllers = new Map<string, AbortController>();");
    expect(source).toContain("abortTurn(turn.id)");
    expect(source).toContain("this.turnAbortControllers.get(turn.id)?.abort();");
    expect(source).toContain("storage.clearQueuedInputs(threadId)");
    expect(source).toContain("signal: ctx.abortSignal");
  });

  it("does not append an error answer after a user initiated stop", () => {
    const source = readMainSource();

    expect(source).toContain("if (this.isTurnCancelledError(error))");
    expect(source).toContain('storage.setItemStatus(assistantItem.id, "cancelled")');
    expect(source).toContain("return;");
  });
});
