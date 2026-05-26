import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("SubagentTaskIndicator", () => {
  it("shows completed task counts instead of idle when all tasks are done", () => {
    const source = readProjectFile("src/components/SubagentTaskIndicator.tsx");

    expect(source).toContain("completedCount");
    expect(source).toContain("{completedCount} done");
  });
});
