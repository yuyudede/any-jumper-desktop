import { spawn } from "node:child_process";
import type { ToolTraceKind, ToolTraceStatus } from "../src/types";

const SECRET_KEY_PATTERN = /(api[-_]?key|token|authorization|password|secret|x[-_]?token)/i;
const DEFAULT_OUTPUT_LIMIT = 64 * 1024;
const TRUNCATED_MARKER = "\n... 输出已截断";

type OutputStream = "stdout" | "stderr";

export interface StreamedCommandOptions {
  command: string;
  cwd: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onOutput?: (delta: string, stream: OutputStream) => void;
}

export interface StreamedFileOptions {
  file: string;
  args: string[];
  cwd?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  onOutput?: (delta: string, stream: OutputStream) => void;
}

export interface StreamedCommandResult {
  output: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function classifyToolKind(name: string): ToolTraceKind {
  if (name === "shell") return "shell";
  if (name.startsWith("git_")) return "git";
  if (["list_files", "read_file", "write_file", "edit_file", "glob"].includes(name)) return "file";
  if (["search", "grep"].includes(name)) return "search";
  if (name === "mcp_call") return "mcp";
  if (name === "task_update") return "task";
  return "other";
}

export function redactToolInput<T>(input: T): T {
  if (Array.isArray(input)) return input.map((item) => redactToolInput(item)) as T;
  if (!input || typeof input !== "object") return input;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    next[key] = SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redactToolInput(value);
  }
  return next as T;
}

export function createToolSummary(name: string, input: Record<string, unknown> = {}, phase: ToolTraceStatus = "running") {
  const prefix = phase === "running" || phase === "pending" || phase === "waiting_approval" ? "正在" : "已";
  if (name === "shell") return `${prefix}运行 ${stringValue(input.command) || "shell 命令"}`;
  if (name === "read_file") return `${prefix}读取 ${stringValue(input.path) || "文件"}`;
  if (name === "list_files") return `${prefix}列出 ${stringValue(input.path) || "文件"}`;
  if (name === "write_file") return `${prefix}写入 ${stringValue(input.path) || "文件"}`;
  if (name === "edit_file") return `${prefix}修改 ${stringValue(input.path) || "文件"}`;
  if (name === "search" || name === "grep") return `${prefix}搜索 ${JSON.stringify(stringValue(input.pattern) || "")}`;
  if (name === "glob") return `${prefix}匹配 ${stringValue(input.pattern) || "文件"}`;
  if (name === "mcp_call") {
    const server = stringValue(input.serverId ?? input.server_id) || "server";
    const tool = stringValue(input.toolName ?? input.tool_name) || "tool";
    return `${prefix}调用 MCP ${server}.${tool}`;
  }
  if (name.startsWith("git_")) return `${prefix}执行 ${name.replace("_", " ")}`;
  if (name === "task_update") return `${prefix}更新任务`;
  return `${prefix}调用 ${name}`;
}

export function truncateToolOutput(output: string, limit = DEFAULT_OUTPUT_LIMIT) {
  if (output.length <= limit) return output;
  return `${output.slice(0, limit)}${TRUNCATED_MARKER}`;
}

export function runStreamedCommand(options: StreamedCommandOptions): Promise<StreamedCommandResult> {
  return runStreamedFile({
    file: "sh",
    args: ["-lc", options.command],
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
    onOutput: options.onOutput,
  });
}

export function runStreamedFile(options: StreamedFileOptions): Promise<StreamedCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.file, options.args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timeoutMs = options.timeoutMs ?? 120_000;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    // 监听外部取消信号
    const onAbort = () => {
      clearTimeout(timer);
      child.kill("SIGTERM");
      // 给进程一点时间自行退出，然后 SIGKILL
      setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* 进程已退出 */ } }, 2000);
      reject(new Error("Command cancelled"));
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const delta = chunk.toString();
      stdout += delta;
      options.onOutput?.(delta, "stdout");
    });
    child.stderr.on("data", (chunk) => {
      const delta = chunk.toString();
      stderr += delta;
      options.onOutput?.(delta, "stderr");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      const output = [stdout.trimEnd(), stderr.trimEnd()].filter(Boolean).join("\n");
      resolve({ output, stdout, stderr, exitCode: code ?? 0 });
    });
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}
