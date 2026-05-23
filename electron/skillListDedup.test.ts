import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMainSource() {
  return readFileSync(resolve(process.cwd(), "electron/main.ts"), "utf8");
}

describe("skill list deduplication", () => {
  it("deduplicates skills by normalized name across user, workspace, and plugin roots", () => {
    const source = readMainSource();

    expect(source).toContain("skillIdentityKey(meta.name)");
    expect(source).toContain("function skillIdentityKey(name: string)");
    expect(source).toContain("name.trim().toLowerCase()");
  });
});
