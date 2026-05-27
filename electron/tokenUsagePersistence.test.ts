import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMainSource() {
  return readFileSync(resolve(process.cwd(), "electron/main.ts"), "utf8");
}

describe("turn token usage persistence", () => {
  it("persists token usage on completed turns and maps it back from storage", () => {
    const source = readMainSource();

    expect(source).toContain("token_usage_json TEXT");
    expect(source).toContain('this.ensureColumn("turns", "token_usage_json", "TEXT")');
    expect(source).toContain("completeTurn(id: string, status: string, tokenUsage?: TurnTokenUsage)");
    expect(source).toContain("token_usage_json=?");
    expect(source).toContain('storage.completeTurn(turn.id, "completed", turnTokenUsage)');
    expect(source).toContain("tokenUsage: jsonParse(row.token_usage_json, undefined)");
  });

  it("recovers missing completed turn usage from runtime checkpoints", () => {
    const source = readMainSource();

    expect(source).toContain("backfillTurnTokenUsageFromCheckpoints()");
    expect(source).toContain("JOIN runtime_checkpoints rc ON rc.turn_id=t.id");
    expect(source).toContain("turnTokenUsageFromRuntimeCheckpoint(row.checkpoint_json)");
  });
});
