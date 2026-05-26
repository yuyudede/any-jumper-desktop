import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("AgentPage subagent task tracking", () => {
  it("reduces incoming agent events into subagent task state", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const handleAgentEventBlock = source.match(/function handleAgentEvent[\s\S]*?function toggleThinkingTrace/)?.[0] ?? "";

    expect(source).toContain("reduceSubagentTasks");
    expect(handleAgentEventBlock).toContain("setSubagentTasks((current) => reduceSubagentTasks(current, event));");
  });

  it("clears live subagent task state when switching threads", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");

    expect(source).toContain("setSubagentTasks([]);");
    expect(source).toContain("setTasksBarExpanded(false);");
    expect(source).toContain("}, [threadId]);");
  });
});
