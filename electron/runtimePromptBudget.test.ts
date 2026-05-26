import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMainSource() {
  return readFileSync(resolve(process.cwd(), "electron/main.ts"), "utf8");
}

describe("runtime prompt budget", () => {
  it("keeps MCP discovery lazy instead of expanding every MCP tool into each model prompt", () => {
    const source = readMainSource();
    const toolsBlock = source.match(/tools: \[[\s\S]*?\] as any/)?.[0] ?? "";

    expect(toolsBlock).toContain('hostTool("mcp_list_tools"');
    expect(toolsBlock).toContain('hostTool("mcp_call"');
    expect(toolsBlock).not.toContain("...await mcpToolsForAgent(toolCtx)");
  });

  it("does not preload all skill markdown files into every chat turn", () => {
    const source = readMainSource();
    const runBlock = source.match(/private async runDeepAgents[\s\S]*?return turnTokenUsage;\n  }/)?.[0] ?? "";

    expect(runBlock).not.toContain("const files = skillFiles(ctx.workspace.id)");
    expect(runBlock).not.toContain("skills: Object.keys(files).length");
    expect(runBlock).not.toContain("files,");
    expect(runBlock).toContain('hostTool("skill_list"');
    expect(runBlock).toContain('hostTool("skill_read"');
  });
});
