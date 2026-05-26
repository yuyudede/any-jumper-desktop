import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
    expect(classifyToolKind("mcp_list_tools")).toBe("mcp");
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
    expect(createToolSummary("mcp_list_tools", {}, "running")).toBe("正在列出 MCP 工具");
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

  it("main process declares persistent tool call events", () => {
    const source = readFileSync(resolve(process.cwd(), "electron/main.ts"), "utf8");

    expect(source).toContain("CREATE TABLE IF NOT EXISTS tool_call_events");
    expect(source).toContain("insertToolCallEvent");
    expect(source).toContain("toolCallEvents:");
  });

  it("all host tool families receive trace progress", () => {
    const source = readFileSync(resolve(process.cwd(), "electron/main.ts"), "utf8");

    expect(source).toContain("execute(ctx, name, input ?? {}, reporter, abortController.signal)");
    expect(source).toContain("listFiles(ctx.workspaceRoot, ctx.permissionMode, input, reporter)");
    expect(source).toContain("shellCommand(ctx.workspaceRoot, input.command, reporter, signal)");
    expect(source).toContain("gitRun(ctx.workspaceRoot, [\"pull\", \"--ff-only\"], reporter)");
    expect(source).toContain("mcpCall(input.serverId ?? input.server_id, input.toolName ?? input.tool_name, input.input ?? {}, reporter)");
  });

  it("returns recoverable tool failures to the model instead of failing the whole turn", () => {
    const source = readFileSync(resolve(process.cwd(), "electron/main.ts"), "utf8");

    expect(source).toContain("if (cancelled) throw error;");
    expect(source).toContain("return formatRecoverableToolError(normalized);");
    expect(source).toContain("function formatRecoverableToolError(error: NormalizedError)");
  });

  it("instructs the runtime to keep execution process out of the final answer", () => {
    const source = readFileSync(resolve(process.cwd(), "electron/main.ts"), "utf8");

    expect(source).toContain("最终回答只保留结论、关键证据和必要建议");
    expect(source).toContain("不要在最终回答中输出执行过程");
    expect(source).toContain("<details>");
  });

  it("emits stable tool call ids for subagent task delta events", () => {
    const source = readFileSync(resolve(process.cwd(), "electron/main.ts"), "utf8");
    const taskStartBlock = source.match(/event\?\.event === "on_tool_start" && event\?\.name === "task"[\s\S]*?}\);/)?.[0] ?? "";
    const taskEndBlock = source.match(/event\?\.event === "on_tool_end" && event\?\.name === "task"[\s\S]*?}\);/)?.[0] ?? "";

    expect(taskStartBlock).toContain("toolCallId: stringValue(event?.run_id)");
    expect(taskEndBlock).toContain("toolCallId: stringValue(event?.run_id)");
  });
});
