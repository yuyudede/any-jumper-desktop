import { app, BrowserWindow, dialog, globalShortcut, ipcMain, safeStorage, shell } from "electron";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import * as pty from "node-pty";

import Database from "better-sqlite3";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { createDeepAgent } from "deepagents";
import { z } from "zod";

import type {
  AgentEvent,
  AgentItem,
  AgentRuntimeConfig,
  AgentRuntimeConfigRequest,
  AgentThread,
  AgentTurn,
  AppSettings,
  Approval,
  GitStatus,
  IdeaProjectTask,
  McpServerConfig,
  McpServerRequest,
  ModelConfig,
  ModelConfigRequest,
  PluginSummary,
  ProgressNote,
  ProjectContext,
  QueuedInput,
  SkillSummary,
  ThreadCreateRequest,
  ThreadDetail,
  ToolCall,
  ToolCallEvent,
  ToolTraceKind,
  ToolTraceStatus,
  TurnTokenUsage,
  TurnStartRequest,
  Workspace,
  WorkspaceRequest,
} from "../src/types";
import { parseGitStatusEntries } from "../src/utils/gitStatus";
import { extractModelOutputParts, stripExposedThinking } from "../src/utils/modelReasoning";
import { truncateTraceThoughtText } from "../src/utils/traceThoughtText";
import { TurnOutputClassifier, type TurnOutputSegment } from "../src/utils/turnOutputClassifier";
import { AgentBridgeService } from "./agentBridge";
import { enableDeepSeekReasoningRoundTrip } from "../src/utils/deepseekReasoningRoundTrip";
import { DEFAULT_MAIN_WINDOW_SHORTCUT, DEFAULT_PORTAL_SHORTCUT } from "../src/utils/portalDefaults";
import {
  classifyToolKind,
  createToolSummary,
  redactToolInput,
  runStreamedCommand,
  truncateToolOutput,
} from "./toolTrace";


type AnyRecord = Record<string, any>;
type PermissionMode = "readOnly" | "workspaceWrite" | "fullAccess";
type ToolTraceStream = "stdout" | "stderr" | "result" | "preview";
type RuntimeTurnStartRequest = TurnStartRequest & { retryItemId?: string };

interface ToolTraceReporter {
  started(): void;
  progress(message: string, detail?: string, progressKind?: string): void;
  output(delta: string, stream?: ToolTraceStream): void;
  completed(status: ToolTraceStatus | "success", output?: string, metadata?: AnyRecord): void;
}

const mainDir = __dirname;
const DEV_URL = process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:1420";
const DEEPAGENTS_RUNTIME_ID = "deepagents";
const DEEPSEEK_OPENAI_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_ANTHROPIC_BASE_URL = "https://api.deepseek.com/anthropic";
const DEEPSEEK_MODEL_PRESETS = ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"];
const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

let storage: StorageService;
let secrets: SecretService;
let settings: SettingsService;
let appRuntime: AgentRuntimeService;
let terminalManager: TerminalManager;
let agentBridge: AgentBridgeService;
let portalWindow: BrowserWindow | undefined;
let portalWindowPinned = true;
let activatingPortalWindow = false;
let registeredMainWindowShortcut: string | undefined;
let registeredPortalShortcut: string | undefined;
const windows = new Set<BrowserWindow>();
const mainWindows = new Set<BrowserWindow>();


function detectUnixShell(): string {
  const candidates = ["/bin/zsh", "/bin/bash", "/bin/sh"];
  for (const shell of candidates) {
    if (existsSync(shell)) return shell;
  }
  return process.env.SHELL || "/bin/zsh";
}

class TerminalManager {
  private terminals = new Map<string, pty.IPty>();

  create(cwd?: string): string {
    const shell = process.platform === "win32" ? "powershell.exe" : detectUnixShell();
    const id = randomUUID();
    const resolvedCwd = cwd && existsSync(cwd) ? cwd : homedir();
    const term = pty.spawn(shell, [], {
      name: "xterm-color",
      cwd: resolvedCwd,
      env: process.env as Record<string, string>,
    });

    term.onData((data) => {
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send("terminal-data", { id, data });
        }
      }
    });

    term.onExit(() => {
      this.terminals.delete(id);
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send("terminal-exit", { id });
        }
      }
    });

    this.terminals.set(id, term);
    return id;
  }

  write(id: string, data: string) {
    const term = this.terminals.get(id);
    if (term) term.write(data);
  }

  resize(id: string, cols: number, rows: number) {
    const term = this.terminals.get(id);
    if (term) term.resize(cols, rows);
  }

  kill(id: string) {
    const term = this.terminals.get(id);
    if (term) {
      term.kill();
      this.terminals.delete(id);
    }
  }
}

class AppError extends Error {
  code: string;
  detail?: string;

  constructor(code: string, message: string, detail?: string) {
    super(message);
    this.code = code;
    this.detail = detail;
  }

  toJSON() {
    return { code: this.code, message: this.message, detail: this.detail };
  }
}

function nowMillis() {
  return Date.now();
}

function newId(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function bool(value: unknown) {
  return value ? 1 : 0;
}

function toBool(value: unknown) {
  return Number(value ?? 0) !== 0;
}

function camelRow<T>(row: AnyRecord | undefined): T {
  if (!row) throw new AppError("UNKNOWN_ERROR", "记录不存在");
  const out: AnyRecord = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase())] = value;
  }
  return out as T;
}

function jsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

type NormalizedError = { code: string; message: string; detail?: string };

function normalizeError(error: unknown): NormalizedError {
  if (error instanceof AppError) return error.toJSON();
  if (error instanceof Error) {
    return { code: "UNKNOWN_ERROR", message: error.message, detail: error.stack };
  }
  return { code: "UNKNOWN_ERROR", message: String(error) };
}

function normalizeRuntimeError(error: unknown, context: { model: string; provider?: ModelConfig }): NormalizedError {
  const normalized = normalizeError(error);
  const raw = `${normalized.message}\n${normalized.detail ?? ""}`.toLowerCase();
  if (raw.includes("model_not_found") || (raw.includes("404") && raw.includes("status code"))) {
    const provider = context.provider;
    return {
      code: "MODEL_NOT_FOUND",
      message: `模型不可用：${context.model}`,
      detail: [
        provider ? `Provider：${provider.displayName}（${provider.providerKind}）` : undefined,
        provider?.baseUrl ? `Base URL：${provider.baseUrl}` : undefined,
        `Model：${context.model}`,
        "请到 Model 页面切换为该 Provider 支持的模型，或点击「拉取模型」刷新模型列表后重试。",
      ].filter(Boolean).join("\n"),
    };
  }
  return normalized;
}

function formatAssistantError(error: NormalizedError) {
  const detail = error.detail && error.code !== "UNKNOWN_ERROR"
    ? `\n>\n${error.detail.split("\n").map((line: string) => `> ${line}`).join("\n")}`
    : "";
  return `\n\n> ${error.message}${detail}`;
}

function formatRecoverableToolError(error: NormalizedError) {
  const detail = error.detail?.trim()
    ? `\n\n错误详情：\n${truncateToolOutput(error.detail.trim(), 8 * 1024)}`
    : "";
  return `工具调用失败：${error.message}${detail}\n\n请根据错误信息调整下一步操作。`;
}

function emitAgentEvent(event: Omit<AgentEvent, "createdAt">) {
  const payload: AgentEvent = { ...event, createdAt: nowMillis() };
  for (const win of windows) {
    if (!win.isDestroyed()) win.webContents.send("agent-event", payload);
  }
}

function emitAgentBridgeEvent(payload: unknown) {
  for (const win of windows) {
    if (!win.isDestroyed()) win.webContents.send("agent-bridge-event", payload);
  }
}

function portalShortcut() {
  return settings?.get().portalShortcut?.trim() || DEFAULT_PORTAL_SHORTCUT;
}

function mainWindowShortcut() {
  return settings?.get().mainWindowShortcut?.trim() || DEFAULT_MAIN_WINDOW_SHORTCUT;
}

function registerPortalShortcut() {
  if (registeredPortalShortcut) {
    globalShortcut.unregister(registeredPortalShortcut);
    registeredPortalShortcut = undefined;
  }
  const shortcut = portalShortcut();
  if (!shortcut) return false;
  let ok = false;
  try {
    ok = globalShortcut.register(shortcut, () => {
      void showPortalWindow();
    });
  } catch {
    ok = false;
  }
  if (ok) registeredPortalShortcut = shortcut;
  return ok;
}

function registerMainWindowShortcut() {
  if (registeredMainWindowShortcut) {
    globalShortcut.unregister(registeredMainWindowShortcut);
    registeredMainWindowShortcut = undefined;
  }
  const shortcut = mainWindowShortcut();
  if (!shortcut) return true;
  let ok = false;
  try {
    ok = globalShortcut.register(shortcut, () => {
      toggleMainWindow();
    });
  } catch {
    ok = false;
  }
  if (ok) registeredMainWindowShortcut = shortcut;
  return ok;
}

function registerGlobalShortcuts() {
  const portalRegistered = registerPortalShortcut();
  const mainWindowRegistered = registerMainWindowShortcut();
  return portalRegistered && mainWindowRegistered;
}

class StorageService {
  db: Database.Database;

  constructor(private userData: string) {
    mkdirSync(userData, { recursive: true });
    const dbPath = this.prepareDatabasePath(userData);
    this.db = new Database(dbPath);
    this.db.pragma("foreign_keys = ON");
    this.migrate();
    this.ensureDefaults();
    this.recoverStaleRunningTurns();
  }

  private prepareDatabasePath(userData: string) {
    const target = path.join(userData, "agent.sqlite3");
    if (existsSync(target)) return target;
    for (const legacy of legacyDatabaseCandidates()) {
      if (existsSync(legacy)) {
        try {
          mkdirSync(path.dirname(target), { recursive: true });
          writeFileSync(target, readFileSync(legacy));
          break;
        } catch {
          // Keep booting with a fresh DB if migration copy fails.
        }
      }
    }
    return target;
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        trust_level TEXT NOT NULL,
        default_runtime_id TEXT NOT NULL DEFAULT 'deepagents',
        default_provider_id TEXT NOT NULL,
        default_model TEXT NOT NULL,
        layout_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agent_runtimes (
        id TEXT PRIMARY KEY,
        runtime_kind TEXT NOT NULL,
        display_name TEXT NOT NULL,
        endpoint_url TEXT,
        enabled INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS model_configs (
        id TEXT PRIMARY KEY,
        provider_kind TEXT NOT NULL,
        display_name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        default_model TEXT NOT NULL,
        models_json TEXT,
        enabled INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS deleted_model_configs (
        id TEXT PRIMARY KEY,
        deleted_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        runtime_id TEXT NOT NULL DEFAULT 'deepagents',
        provider_id TEXT NOT NULL,
        model TEXT NOT NULL,
        reasoning_effort TEXT,
        permission_mode TEXT NOT NULL,
        forked_from_id TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS turns (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        status TEXT NOT NULL,
        runtime_id TEXT NOT NULL DEFAULT 'deepagents',
        provider_id TEXT NOT NULL,
        model TEXT NOT NULL,
        reasoning_effort TEXT,
        permission_mode TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        token_usage_json TEXT
      );
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        turn_id TEXT,
        role TEXT NOT NULL,
        item_type TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL,
        tool_call_id TEXT,
        metadata_json TEXT,
        hidden INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS queued_inputs (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        input TEXT NOT NULL,
        runtime_id TEXT,
        provider_id TEXT,
        model TEXT,
        reasoning_effort TEXT,
        permission_mode TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        turn_id TEXT,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        input_json TEXT NOT NULL,
        output TEXT,
        requires_approval INTEGER NOT NULL DEFAULT 0,
        runtime_tool_id TEXT,
        parent_tool_call_id TEXT,
        approval_policy_snapshot TEXT,
        started_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS tool_call_events (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        turn_id TEXT,
        tool_call_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        stream TEXT,
        content TEXT,
        metadata_json TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS progress_notes (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        turn_id TEXT,
        kind TEXT NOT NULL DEFAULT 'progress',
        content TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        tool_call_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        summary TEXT NOT NULL,
        decision TEXT,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        transport TEXT NOT NULL,
        command_json TEXT,
        url TEXT,
        env_json TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'idle',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        path TEXT NOT NULL,
        scope TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS plugins (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT,
        description TEXT,
        path TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS git_snapshots (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        root_path TEXT NOT NULL,
        branch TEXT NOT NULL,
        status_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS runtime_checkpoints (
        thread_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        runtime_id TEXT NOT NULL,
        checkpoint_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(thread_id, turn_id, runtime_id)
      );
      CREATE TABLE IF NOT EXISTS runtime_memory (
        workspace_id TEXT NOT NULL,
        thread_id TEXT,
        key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        scope TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(workspace_id, thread_id, key, scope)
      );
      CREATE TABLE IF NOT EXISTS runtime_artifacts (
        thread_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        path TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY(thread_id, turn_id, path)
      );
    `);
    this.ensureColumn("workspaces", "default_runtime_id", "TEXT NOT NULL DEFAULT 'deepagents'");
    this.ensureColumn("threads", "runtime_id", "TEXT NOT NULL DEFAULT 'deepagents'");
    this.ensureColumn("turns", "runtime_id", "TEXT NOT NULL DEFAULT 'deepagents'");
    this.ensureColumn("turns", "token_usage_json", "TEXT");
    this.ensureColumn("queued_inputs", "runtime_id", "TEXT");
    this.ensureColumn("queued_inputs", "images_json", "TEXT");
    this.ensureColumn("tool_calls", "runtime_tool_id", "TEXT");
    this.ensureColumn("tool_calls", "parent_tool_call_id", "TEXT");
    this.ensureColumn("tool_calls", "approval_policy_snapshot", "TEXT");
    this.ensureColumn("model_configs", "models_json", "TEXT");
    this.ensureColumn("progress_notes", "kind", "TEXT NOT NULL DEFAULT 'progress'");
    this.ensureColumn("items", "images_json", "TEXT");
    this.ensureColumn("items", "reasoning_content", "TEXT");
  }

  private ensureColumn(table: string, column: string, definition: string) {
    const exists = this.db.prepare(`PRAGMA table_info(${table})`).all().some((row: any) => row.name === column);
    if (!exists) this.db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }

  private recoverStaleRunningTurns() {
    const now = nowMillis();
    this.db.prepare("UPDATE turns SET status='interrupted', completed_at=? WHERE status='running'").run(now);
    this.db.prepare("UPDATE items SET status='error' WHERE role='assistant' AND status='running'").run();
    this.db.prepare("UPDATE threads SET status='interrupted', updated_at=? WHERE status='running'").run(now);
  }

  private ensureDefaults() {
    const now = nowMillis();
    this.db.prepare(`
      INSERT INTO agent_runtimes (id, runtime_kind, display_name, endpoint_url, enabled, created_at, updated_at)
      VALUES (?, ?, ?, NULL, 1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET runtime_kind=excluded.runtime_kind, display_name=excluded.display_name, enabled=1, updated_at=excluded.updated_at
    `).run(DEEPAGENTS_RUNTIME_ID, "deepagents", "DeepAgents Runtime", now, now);
    this.db.prepare("UPDATE workspaces SET default_runtime_id=? WHERE default_runtime_id IS NULL OR default_runtime_id='' OR default_runtime_id='built-in'").run(DEEPAGENTS_RUNTIME_ID);
    this.db.prepare("UPDATE threads SET runtime_id=? WHERE runtime_id IS NULL OR runtime_id='' OR runtime_id='built-in'").run(DEEPAGENTS_RUNTIME_ID);
    this.db.prepare("UPDATE turns SET runtime_id=? WHERE runtime_id IS NULL OR runtime_id='' OR runtime_id='built-in'").run(DEEPAGENTS_RUNTIME_ID);
    this.db.prepare("DELETE FROM agent_runtimes WHERE id='built-in'").run();
    this.db.prepare("UPDATE model_configs SET enabled=1 WHERE enabled=0").run();
    const deletedModelIds = new Set(
      this.db.prepare("SELECT id FROM deleted_model_configs").all().map((row: any) => row.id as string),
    );
    for (const model of [
      ["mock", "mock", "Mock Agent", "mock://local", "mock-agent", JSON.stringify(["mock-agent"]), 1],
      ["deepseek", "openai-compatible", "DeepSeek", DEEPSEEK_OPENAI_BASE_URL, "deepseek-v4-flash", JSON.stringify(DEEPSEEK_MODEL_PRESETS), 1],
      ["openai", "openai-compatible", "OpenAI Compatible", "https://api.openai.com/v1", "gpt-4.1-mini", JSON.stringify(["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"]), 1],
      ["anthropic", "anthropic", "Anthropic", "https://api.anthropic.com", "claude-3-5-sonnet-latest", JSON.stringify(["claude-3-5-sonnet-latest", "claude-3-7-sonnet-latest", "claude-sonnet-4-5"]), 1],
      ["anthropic-compatible", "anthropic-compatible", "Anthropic Compatible", "https://api.anthropic.com", "claude-3-5-sonnet-latest", JSON.stringify(["claude-3-5-sonnet-latest", "claude-3-7-sonnet-latest", "claude-sonnet-4-5"]), 1],
      ["ollama", "ollama", "Ollama", "http://127.0.0.1:11434", "llama3.1", JSON.stringify(["llama3.1", "llama3.2", "qwen2.5-coder"]), 1],
    ]) {
      if (deletedModelIds.has(model[0] as string)) continue;
      this.db.prepare(`
        INSERT INTO model_configs (id, provider_kind, display_name, base_url, default_model, models_json, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).run(...model, now, now);
    }
    const deepseek = this.db.prepare("SELECT models_json FROM model_configs WHERE id='deepseek'").get() as { models_json?: string } | undefined;
    if (deepseek) {
      const models = normalizeModelNames([...jsonParse<string[]>(deepseek.models_json, []), ...DEEPSEEK_MODEL_PRESETS]);
      this.db.prepare("UPDATE model_configs SET models_json=?, updated_at=? WHERE id='deepseek'")
        .run(JSON.stringify(models), now);
      this.db.prepare("UPDATE model_configs SET base_url=?, updated_at=? WHERE id='deepseek' AND provider_kind='openai-compatible' AND base_url LIKE ?")
        .run(DEEPSEEK_OPENAI_BASE_URL, now, `${DEEPSEEK_ANTHROPIC_BASE_URL}%`);
    }
  }

  listWorkspaces(): Workspace[] {
    return this.db.prepare("SELECT * FROM workspaces ORDER BY updated_at DESC").all().map(mapWorkspace);
  }

  createWorkspace(request: WorkspaceRequest): Workspace {
    const id = newId("ws");
    const now = nowMillis();
    const name = request.name?.trim() || path.basename(request.rootPath) || "Workspace";
    this.db.prepare(`
      INSERT INTO workspaces (id, name, root_path, trust_level, default_runtime_id, default_provider_id, default_model, layout_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      request.rootPath,
      request.trustLevel ?? "trusted",
      DEEPAGENTS_RUNTIME_ID,
      request.defaultProviderId ?? "mock",
      request.defaultModel ?? "mock-agent",
      request.layoutJson ?? null,
      now,
      now,
    );
    return this.getWorkspace(id);
  }

  updateWorkspace(id: string, request: WorkspaceRequest): Workspace {
    const current = this.getWorkspace(id);
    this.db.prepare(`
      UPDATE workspaces SET name=?, root_path=?, trust_level=?, default_runtime_id=?, default_provider_id=?, default_model=?, layout_json=?, updated_at=? WHERE id=?
    `).run(
      request.name ?? current.name,
      request.rootPath,
      request.trustLevel ?? current.trustLevel,
      DEEPAGENTS_RUNTIME_ID,
      request.defaultProviderId ?? current.defaultProviderId,
      request.defaultModel ?? current.defaultModel,
      request.layoutJson ?? current.layoutJson ?? null,
      nowMillis(),
      id,
    );
    return this.getWorkspace(id);
  }

  deleteWorkspace(id: string) {
    this.db.prepare("DELETE FROM workspaces WHERE id=?").run(id);
  }

  getWorkspace(id: string): Workspace {
    return mapWorkspace(this.db.prepare("SELECT * FROM workspaces WHERE id=?").get(id));
  }

  listModelConfigs(): ModelConfig[] {
    return this.db.prepare("SELECT * FROM model_configs ORDER BY display_name ASC").all().map(mapModelConfig);
  }

  getModelConfig(id: string): ModelConfig {
    return mapModelConfig(this.db.prepare("SELECT * FROM model_configs WHERE id=?").get(id));
  }

  saveModelConfig(request: ModelConfigRequest): ModelConfig {
    const id = request.id ?? newId("model");
    const now = nowMillis();
    const modelsJson = JSON.stringify(normalizeModelNames([request.defaultModel, ...(request.models || [])]));
    validateModelProvider(request);
    this.db.prepare("DELETE FROM deleted_model_configs WHERE id=?").run(id);
    this.db.prepare(`
      INSERT INTO model_configs (id, provider_kind, display_name, base_url, default_model, models_json, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET provider_kind=excluded.provider_kind, display_name=excluded.display_name,
        base_url=excluded.base_url, default_model=excluded.default_model, models_json=excluded.models_json,
        enabled=excluded.enabled, updated_at=excluded.updated_at
    `).run(id, request.providerKind, request.displayName, request.baseUrl, request.defaultModel, modelsJson, bool(request.enabled), now, now);
    return this.getModelConfig(id);
  }

  deleteModelConfig(id: string) {
    const model = this.getModelConfig(id);
    if (model.id === "mock") {
      throw new AppError("UNSUPPORTED_DELETE", "Mock Agent 是默认兜底 Provider，不能删除");
    }
    const now = nowMillis();
    const fallbackProviderId = "mock";
    const fallbackModel = "mock-agent";
    this.db.transaction(() => {
      this.db.prepare("INSERT OR REPLACE INTO deleted_model_configs (id, deleted_at) VALUES (?, ?)").run(id, now);
      this.db.prepare("DELETE FROM model_configs WHERE id=?").run(id);
      this.db.prepare("UPDATE workspaces SET default_provider_id=?, default_model=?, updated_at=? WHERE default_provider_id=?")
        .run(fallbackProviderId, fallbackModel, now, id);
      this.db.prepare("UPDATE threads SET provider_id=?, model=?, updated_at=? WHERE provider_id=?")
        .run(fallbackProviderId, fallbackModel, now, id);
      this.db.prepare("UPDATE queued_inputs SET provider_id=NULL, model=NULL WHERE provider_id=?").run(id);
    })();
  }

  preferredModelConfig(): ModelConfig | undefined {
    return this.listModelConfigs().find((model) => model.providerKind !== "mock" && (model.providerKind === "ollama" || model.hasApiKey));
  }

  activateModelConfig(id: string) {
    const model = this.getModelConfig(id);
    if (model.providerKind === "mock") return;
    const now = nowMillis();
    this.db.prepare("UPDATE workspaces SET default_provider_id=?, default_model=?, updated_at=? WHERE default_provider_id='mock'").run(model.id, model.defaultModel, now);
    this.db.prepare("UPDATE threads SET provider_id=?, model=?, updated_at=? WHERE provider_id='mock'").run(model.id, model.defaultModel, now);
  }

  listAgentRuntimes(): AgentRuntimeConfig[] {
    return this.db.prepare("SELECT * FROM agent_runtimes ORDER BY enabled DESC, display_name ASC").all().map(mapRuntime);
  }

  getAgentRuntime(id: string): AgentRuntimeConfig {
    return mapRuntime(this.db.prepare("SELECT * FROM agent_runtimes WHERE id=?").get(id));
  }

  saveAgentRuntime(request: AgentRuntimeConfigRequest): AgentRuntimeConfig {
    const id = request.id ?? newId("runtime");
    const now = nowMillis();
    this.db.prepare(`
      INSERT INTO agent_runtimes (id, runtime_kind, display_name, endpoint_url, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET runtime_kind=excluded.runtime_kind, display_name=excluded.display_name,
        endpoint_url=excluded.endpoint_url, enabled=excluded.enabled, updated_at=excluded.updated_at
    `).run(id, request.runtimeKind, request.displayName, request.endpointUrl ?? null, bool(request.enabled), now, now);
    return this.getAgentRuntime(id);
  }

  createThread(request: ThreadCreateRequest): AgentThread {
    const workspace = this.getWorkspace(request.workspaceId);
    const id = newId("thread");
    const now = nowMillis();
    this.db.prepare(`
      INSERT INTO threads (id, workspace_id, title, status, runtime_id, provider_id, model, reasoning_effort, permission_mode, forked_from_id, archived, created_at, updated_at)
      VALUES (?, ?, ?, 'idle', ?, ?, ?, ?, ?, NULL, 0, ?, ?)
    `).run(
      id,
      request.workspaceId,
      request.title?.trim() || "New session",
      DEEPAGENTS_RUNTIME_ID,
      request.providerId ?? workspace.defaultProviderId,
      request.model ?? workspace.defaultModel,
      request.reasoningEffort ?? null,
      request.permissionMode ?? "workspaceWrite",
      now,
      now,
    );
    return this.getThread(id);
  }

  listThreads(workspaceId?: string): AgentThread[] {
    const rows = workspaceId
      ? this.db.prepare("SELECT * FROM threads WHERE workspace_id=? AND archived=0 ORDER BY updated_at DESC").all(workspaceId)
      : this.db.prepare("SELECT * FROM threads WHERE archived=0 ORDER BY updated_at DESC").all();
    return rows.map(mapThread);
  }

  getThread(id: string): AgentThread {
    return mapThread(this.db.prepare("SELECT * FROM threads WHERE id=?").get(id));
  }

  setThreadStatus(id: string, status: string) {
    this.db.prepare("UPDATE threads SET status=?, updated_at=? WHERE id=?").run(status, nowMillis(), id);
  }

  setThreadRuntime(id: string, providerId: string, model: string, permissionMode?: PermissionMode | string, reasoningEffort?: string) {
    this.db.prepare(`
      UPDATE threads SET provider_id=?, model=?, permission_mode=?, reasoning_effort=?, updated_at=? WHERE id=?
    `).run(providerId, model, permissionMode ?? "workspaceWrite", reasoningEffort ?? null, nowMillis(), id);
  }

  setThreadName(id: string, title: string): AgentThread {
    const nextTitle = title.trim();
    if (!nextTitle) throw new AppError("INVALID_THREAD_TITLE", "会话名称不能为空");
    this.db.prepare("UPDATE threads SET title=?, updated_at=? WHERE id=?").run(nextTitle, nowMillis(), id);
    return this.getThread(id);
  }

  archiveThread(id: string) {
    this.db.prepare("UPDATE threads SET archived=1, updated_at=? WHERE id=?").run(nowMillis(), id);
  }

  readThread(threadId: string): ThreadDetail {
    return {
      thread: this.getThread(threadId),
      turns: this.db.prepare("SELECT * FROM turns WHERE thread_id=? ORDER BY started_at ASC").all(threadId).map(mapTurn),
      items: this.db.prepare("SELECT * FROM items WHERE thread_id=? ORDER BY created_at ASC").all(threadId).map(mapItem),
      queue: this.db.prepare("SELECT * FROM queued_inputs WHERE thread_id=? ORDER BY created_at ASC").all(threadId).map(mapQueue),
      toolCalls: this.db.prepare("SELECT * FROM tool_calls WHERE thread_id=? ORDER BY started_at ASC").all(threadId).map(mapToolCall),
      toolCallEvents: this.db.prepare("SELECT * FROM tool_call_events WHERE thread_id=? ORDER BY created_at ASC").all(threadId).map(mapToolCallEvent),
      progressNotes: this.db.prepare("SELECT * FROM progress_notes WHERE thread_id=? ORDER BY created_at ASC").all(threadId).map(mapProgressNote),
      approvals: this.db.prepare("SELECT * FROM approvals WHERE thread_id=? ORDER BY created_at ASC").all(threadId).map(mapApproval),
    };
  }

  insertTurn(turn: AgentTurn) {
    this.db.prepare(`
      INSERT INTO turns (id, thread_id, status, runtime_id, provider_id, model, reasoning_effort, permission_mode, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(turn.id, turn.threadId, turn.status, turn.runtimeId, turn.providerId, turn.model, turn.reasoningEffort ?? null, turn.permissionMode, turn.startedAt, turn.completedAt ?? null);
  }

  completeTurn(id: string, status: string, tokenUsage?: TurnTokenUsage) {
    if (tokenUsage) {
      this.db.prepare("UPDATE turns SET status=?, completed_at=?, token_usage_json=? WHERE id=?").run(status, nowMillis(), JSON.stringify(tokenUsage), id);
      return;
    }
    this.db.prepare("UPDATE turns SET status=?, completed_at=? WHERE id=?").run(status, nowMillis(), id);
  }

  runningTurns(threadId: string): AgentTurn[] {
    return this.db.prepare("SELECT * FROM turns WHERE thread_id=? AND status='running' ORDER BY started_at ASC").all(threadId).map(mapTurn);
  }

  insertItem(item: AgentItem) {
    this.db.prepare(`
      INSERT INTO items (id, thread_id, turn_id, role, item_type, content, reasoning_content, status, tool_call_id, metadata_json, hidden, images_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(item.id, item.threadId, item.turnId ?? null, item.role, item.itemType, item.content, item.reasoningContent ?? null, item.status, item.toolCallId ?? null, item.metadata ? JSON.stringify(item.metadata) : null, bool(item.hidden), item.images ? JSON.stringify(item.images) : null, item.createdAt);
  }

  getItem(id: string): AgentItem {
    return mapItem(this.db.prepare("SELECT * FROM items WHERE id=?").get(id));
  }

  appendItemContent(id: string, delta: string) {
    this.db.prepare("UPDATE items SET content = content || ? WHERE id=?").run(delta, id);
  }

  updateItemContent(id: string, content: string): AgentItem {
    this.db.prepare("UPDATE items SET content=? WHERE id=?").run(content, id);
    return this.getItem(id);
  }

  updateItemReasoningContent(id: string, reasoningContent: string): AgentItem {
    this.db.prepare("UPDATE items SET reasoning_content=? WHERE id=?").run(reasoningContent, id);
    return this.getItem(id);
  }

  updateItemForRetry(id: string, update: { turnId: string; content: string; images?: AgentItem["images"] }): AgentItem {
    this.db.prepare("UPDATE items SET turn_id=?, content=?, status='completed', hidden=0, images_json=? WHERE id=?")
      .run(update.turnId, update.content, update.images ? JSON.stringify(update.images) : null, id);
    return this.getItem(id);
  }

  setItemStatus(id: string, status: string) {
    this.db.prepare("UPDATE items SET status=? WHERE id=?").run(status, id);
  }

  hideItemsAfter(threadId: string, createdAt: number) {
    this.db.prepare("UPDATE items SET hidden=1 WHERE thread_id=? AND created_at>?").run(threadId, createdAt);
  }

  enqueueInput(request: TurnStartRequest): QueuedInput {
    const queued: QueuedInput = {
      id: newId("queue"),
      threadId: request.threadId,
      input: request.input,
      images: request.images,
      runtimeId: request.runtimeId,
      providerId: request.providerId,
      model: request.model,
      reasoningEffort: request.reasoningEffort,
      permissionMode: request.permissionMode,
      createdAt: nowMillis(),
    };
    this.db.prepare(`
      INSERT INTO queued_inputs (id, thread_id, input, runtime_id, provider_id, model, reasoning_effort, permission_mode, images_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(queued.id, queued.threadId, queued.input, queued.runtimeId ?? null, queued.providerId ?? null, queued.model ?? null, queued.reasoningEffort ?? null, queued.permissionMode ?? null, queued.images ? JSON.stringify(queued.images) : null, queued.createdAt);
    return queued;
  }

  popNextQueued(threadId: string): QueuedInput | undefined {
    const queued = this.db.prepare("SELECT * FROM queued_inputs WHERE thread_id=? ORDER BY created_at ASC LIMIT 1").get(threadId);
    if (!queued) return undefined;
    this.db.prepare("DELETE FROM queued_inputs WHERE id=?").run((queued as any).id);
    return mapQueue(queued);
  }

  clearQueuedInputs(threadId: string) {
    this.db.prepare("DELETE FROM queued_inputs WHERE thread_id=?").run(threadId);
  }

  insertToolCall(call: ToolCall & AnyRecord) {
    this.db.prepare(`
      INSERT INTO tool_calls (id, thread_id, turn_id, name, status, input_json, output, requires_approval,
        runtime_tool_id, parent_tool_call_id, approval_policy_snapshot, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      call.id,
      call.threadId,
      call.turnId ?? null,
      call.name,
      call.status,
      call.inputJson,
      call.output ?? null,
      bool(call.requiresApproval),
      call.runtimeToolId ?? null,
      call.parentToolCallId ?? null,
      call.approvalPolicySnapshot ?? null,
      call.startedAt,
      call.completedAt ?? null,
    );
  }

  completeToolCall(id: string, status: string, output?: string) {
    this.db.prepare("UPDATE tool_calls SET status=?, output=?, completed_at=? WHERE id=?").run(status, output ?? null, nowMillis(), id);
  }

  insertToolCallEvent(event: ToolCallEvent) {
    this.db.prepare(`
      INSERT INTO tool_call_events (id, thread_id, turn_id, tool_call_id, event_type, stream, content, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.threadId,
      event.turnId ?? null,
      event.toolCallId,
      event.eventType,
      event.stream ?? null,
      event.content ?? null,
      event.metadata ? JSON.stringify(event.metadata) : null,
      event.createdAt,
    );
    return event;
  }

  insertProgressNote(note: ProgressNote) {
    this.db.prepare(`
      INSERT INTO progress_notes (id, thread_id, turn_id, kind, content, status, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(note.id, note.threadId, note.turnId ?? null, note.kind ?? "progress", note.content, note.status, note.createdAt, note.completedAt ?? null);
    return note;
  }

  insertApproval(approval: Approval) {
    this.db.prepare(`
      INSERT INTO approvals (id, thread_id, tool_call_id, tool_name, summary, decision, created_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(approval.id, approval.threadId, approval.toolCallId, approval.toolName, approval.summary, approval.decision ?? null, approval.createdAt, approval.resolvedAt ?? null);
  }

  resolveApproval(id: string, decision: string): Approval {
    this.db.prepare("UPDATE approvals SET decision=?, resolved_at=? WHERE id=?").run(decision, nowMillis(), id);
    return mapApproval(this.db.prepare("SELECT * FROM approvals WHERE id=?").get(id));
  }

  forkThread(threadId: string, itemId?: string): AgentThread {
    const source = this.getThread(threadId);
    const cutoff = itemId ? this.getItem(itemId).createdAt : undefined;
    const id = newId("thread");
    const now = nowMillis();
    this.db.prepare(`
      INSERT INTO threads (id, workspace_id, title, status, runtime_id, provider_id, model, reasoning_effort, permission_mode, forked_from_id, archived, created_at, updated_at)
      VALUES (?, ?, ?, 'idle', ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `).run(id, source.workspaceId, `${source.title} fork`, DEEPAGENTS_RUNTIME_ID, source.providerId, source.model, source.reasoningEffort ?? null, source.permissionMode, source.id, now, now);
    const items = this.db.prepare("SELECT * FROM items WHERE thread_id=? AND hidden=0 ORDER BY created_at ASC").all(threadId).map(mapItem);
    for (const item of items) {
      if (cutoff && item.createdAt > cutoff) continue;
      this.insertItem({ ...item, id: newId("item"), threadId: id, turnId: undefined, toolCallId: undefined });
    }
    return this.getThread(id);
  }

  listMcpServers(): McpServerConfig[] {
    return this.db.prepare("SELECT * FROM mcp_servers ORDER BY name ASC").all().map(mapMcp);
  }

  getMcpServer(id: string): McpServerConfig {
    return mapMcp(this.db.prepare("SELECT * FROM mcp_servers WHERE id=?").get(id));
  }

  saveMcpServer(request: McpServerRequest): McpServerConfig {
    const id = request.id ?? newId("mcp");
    const now = nowMillis();
    this.db.prepare(`
      INSERT INTO mcp_servers (id, name, transport, command_json, url, env_json, enabled, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'idle', ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, transport=excluded.transport, command_json=excluded.command_json,
        url=excluded.url, env_json=excluded.env_json, enabled=excluded.enabled, updated_at=excluded.updated_at
    `).run(id, request.name, request.transport, request.commandJson ?? null, request.url ?? null, request.envJson ?? null, bool(request.enabled), now, now);
    return this.getMcpServer(id);
  }

  upsertPlugin(plugin: PluginSummary) {
    const now = nowMillis();
    this.db.prepare(`
      INSERT INTO plugins (id, name, version, description, path, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, version=excluded.version, description=excluded.description,
        path=excluded.path, enabled=excluded.enabled, updated_at=excluded.updated_at
    `).run(plugin.id, plugin.name, plugin.version ?? null, plugin.description ?? null, plugin.path, bool(plugin.enabled), now, now);
  }

  listPluginsFromDb(): PluginSummary[] {
    return this.db.prepare("SELECT * FROM plugins ORDER BY name ASC").all().map(mapPlugin);
  }

  setPluginEnabled(id: string, enabled: boolean) {
    this.db.prepare("UPDATE plugins SET enabled=?, updated_at=? WHERE id=?").run(bool(enabled), nowMillis(), id);
  }

  saveRuntimeCheckpoint(threadId: string, turnId: string, runtimeId: string, checkpoint: unknown) {
    const now = nowMillis();
    this.db.prepare(`
      INSERT INTO runtime_checkpoints (thread_id, turn_id, runtime_id, checkpoint_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(thread_id, turn_id, runtime_id) DO UPDATE SET checkpoint_json=excluded.checkpoint_json, updated_at=excluded.updated_at
    `).run(threadId, turnId, runtimeId, JSON.stringify(checkpoint), now, now);
  }
}

class SecretService {
  private file: string;
  private data: Record<string, string>;

  constructor(userData: string) {
    this.file = path.join(userData, "secrets.json");
    this.data = jsonParse<Record<string, string>>(existsSync(this.file) ? readFileSync(this.file, "utf8") : "{}", {});
  }

  get(key: string): string | null {
    const value = this.data[key];
    if (!value) return null;
    try {
      if (value.startsWith("safe:") && safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(value.slice(5), "base64"));
      }
      if (value.startsWith("plain:")) return Buffer.from(value.slice(6), "base64").toString("utf8");
    } catch {
      return null;
    }
    return null;
  }

  set(key: string, value: string) {
    if (!value.trim()) delete this.data[key];
    else if (safeStorage.isEncryptionAvailable()) this.data[key] = `safe:${safeStorage.encryptString(value.trim()).toString("base64")}`;
    else this.data[key] = `plain:${Buffer.from(value.trim(), "utf8").toString("base64")}`;
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }
}

class SettingsService {
  private file: string;

  constructor(private userData: string) {
    this.file = path.join(userData, "settings.json");
  }

  get(): AppSettings {
    return {
      gitCommand: "git",
      defaultNewSessionModel: undefined,
      ...jsonParse<Partial<AppSettings>>(existsSync(this.file) ? readFileSync(this.file, "utf8") : "{}", {}),
    };
  }

  save(value: AppSettings) {
    writeFileSync(this.file, JSON.stringify(value, null, 2));
  }
}

class ToolService {
  private pendingApprovals = new Map<string, { turnId?: string; resolve: (decision: string) => void }>();
  cancelledTurns?: Set<string>;
  /** turnId -> AbortController，用于中断正在执行的工具 */
  private abortControllers = new Map<string, AbortController>();

  /** 中断指定 turn 正在执行的工具 */
  abortTurn(turnId: string) {
    for (const [approvalId, pending] of this.pendingApprovals) {
      if (pending.turnId !== turnId) continue;
      pending.resolve("cancelled");
      this.pendingApprovals.delete(approvalId);
    }
    const controller = this.abortControllers.get(turnId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(turnId);
    }
  }

  async invoke(ctx: ToolContext, name: string, input: AnyRecord): Promise<string> {
    if (this.isTurnCancelled(ctx.turnId)) {
      throw new AppError("CANCELLED", "会话已终止");
    }

    const call: ToolCall & AnyRecord = {
      id: newId("tool"),
      threadId: ctx.threadId,
      turnId: ctx.turnId,
      name,
      status: "running",
      inputJson: JSON.stringify(input ?? {}),
      output: undefined,
      requiresApproval: this.requiresApproval(ctx.permissionMode, name, input ?? {}),
      runtimeToolId: input?.runtimeToolId,
      parentToolCallId: input?.parentToolCallId,
      approvalPolicySnapshot: JSON.stringify({ permissionMode: ctx.permissionMode }),
      startedAt: nowMillis(),
      completedAt: undefined,
    };
    storage.insertToolCall(call);
    const reporter = createToolTraceReporter(call, name, input ?? {});
    reporter.started();

    if (call.requiresApproval) {
      const approval: Approval = {
        id: newId("approval"),
        threadId: ctx.threadId,
        toolCallId: call.id,
        toolName: name,
        summary: approvalSummary(name, input),
        createdAt: nowMillis(),
      };
      storage.insertApproval(approval);
      storage.completeToolCall(call.id, "waiting_approval", undefined);
      emitAgentEvent({
        event: "approval.requested",
        threadId: ctx.threadId,
        turnId: ctx.turnId,
        toolCallId: call.id,
        payload: approval,
      });
      reporter.progress("等待用户审批", approval.summary, "approval");
      const decision = await new Promise<string>((resolve) => this.pendingApprovals.set(approval.id, { turnId: ctx.turnId, resolve }));
      if (decision === "cancelled") {
        storage.completeToolCall(call.id, "cancelled", "会话已终止");
        reporter.completed("cancelled", "会话已终止");
        throw new AppError("CANCELLED", "会话已终止");
      }
      if (decision !== "approved" && decision !== "allow") {
        storage.completeToolCall(call.id, "rejected", "用户拒绝");
        reporter.completed("rejected", "用户拒绝");
        throw new AppError("PERMISSION_DENIED", "用户拒绝工具调用");
      }
    }

    try {
      // 检查是否已被取消
      if (this.isTurnCancelled(ctx.turnId)) {
        throw new AppError("CANCELLED", "会话已终止");
      }

      // 为此 turn 注册 AbortController
      const abortController = new AbortController();
      if (ctx.turnId) this.abortControllers.set(ctx.turnId, abortController);

      const output = await this.execute(ctx, name, input ?? {}, reporter, abortController.signal);
      const persistedOutput = truncateToolOutput(output);
      storage.completeToolCall(call.id, "success", persistedOutput);
      reporter.completed("success", persistedOutput);
      return output;
    } catch (error) {
      const normalized = normalizeError(error);
      const cancelled = this.isTurnCancelled(ctx.turnId) || normalized.code === "CANCELLED";
      storage.completeToolCall(call.id, cancelled ? "cancelled" : "error", normalized.message);
      reporter.completed(cancelled ? "cancelled" : "error", normalized.message);
      if (cancelled) throw error;
      return formatRecoverableToolError(normalized);
    } finally {
      if (ctx.turnId) this.abortControllers.delete(ctx.turnId);
    }
  }

  resolveApproval(id: string, decision: string) {
    const approval = storage.resolveApproval(id, decision);
    this.pendingApprovals.get(id)?.resolve(decision);
    this.pendingApprovals.delete(id);
    return approval;
  }

  isTurnCancelled(turnId?: string) {
    return Boolean(turnId && this.cancelledTurns?.has(turnId));
  }

  private async execute(ctx: ToolContext, name: string, input: AnyRecord, reporter: ToolTraceReporter, signal?: AbortSignal): Promise<string> {
    switch (name) {
      case "list_files":
        return listFiles(ctx.workspaceRoot, ctx.permissionMode, input, reporter);
      case "read_file":
        return readTextFile(ctx.workspaceRoot, ctx.permissionMode, input, reporter);
      case "search":
      case "grep":
        return searchFiles(ctx.workspaceRoot, ctx.permissionMode, input, reporter);
      case "glob":
        return globFiles(ctx.workspaceRoot, ctx.permissionMode, input, reporter);
      case "write_file":
        return writeTextFile(ctx.workspaceRoot, ctx.permissionMode, input, reporter);
      case "edit_file":
        return editTextFile(ctx.workspaceRoot, ctx.permissionMode, input, reporter);
      case "shell":
        return shellCommand(ctx.workspaceRoot, input.command, reporter, signal);
      case "git_status":
        return JSON.stringify(gitStatus(ctx.workspaceRoot, reporter), null, 2);
      case "git_diff":
        return gitDiff(ctx.workspaceRoot, Boolean(input.staged), reporter);
      case "git_stage":
        return gitStage(ctx.workspaceRoot, input.paths ?? [], reporter);
      case "git_commit":
        return gitCommit(ctx.workspaceRoot, input.message ?? "", reporter);
      case "git_checkout":
        return gitCheckout(ctx.workspaceRoot, input.branch ?? "", reporter);
      case "git_pull":
        return gitRun(ctx.workspaceRoot, ["pull", "--ff-only"], reporter);
      case "git_push":
        return gitRun(ctx.workspaceRoot, ["push"], reporter);
      case "mcp_call":
        return JSON.stringify(await mcpCall(input.serverId ?? input.server_id, input.toolName ?? input.tool_name, input.input ?? {}, reporter), null, 2);
      case "task_update":
        reporter.progress("已更新任务状态");
        return JSON.stringify(input);
      default:
        throw new AppError("UNKNOWN_ERROR", `未知工具：${name}`);
    }
  }

  private requiresApproval(permissionMode: string, name: string, input: AnyRecord) {
    if (permissionMode === "fullAccess") return name === "shell" && dangerousCommand(input.command ?? "");
    if (permissionMode === "workspaceWrite") {
      return ["shell", "git_commit", "git_stage", "git_checkout", "git_pull", "git_push", "mcp_call"].includes(name);
    }
    return !["list_files", "read_file", "search", "grep", "glob", "git_status", "git_diff", "task_update"].includes(name);
  }
}

function createToolTraceReporter(call: ToolCall & AnyRecord, name: string, input: AnyRecord): ToolTraceReporter {
  const kind = classifyToolKind(name);
  const redactedInput = redactToolInput(input ?? {});
  const base = {
    threadId: call.threadId,
    turnId: call.turnId,
    toolCallId: call.id,
  };

  function record(eventType: string, content: string | undefined, metadata?: AnyRecord, stream?: ToolTraceStream) {
    const createdAt = nowMillis();
    const event = storage.insertToolCallEvent({
      id: newId("tool_event"),
      threadId: call.threadId,
      turnId: call.turnId,
      toolCallId: call.id,
      eventType,
      stream,
      content,
      metadata,
      createdAt,
    });
    emitAgentEvent({
      event: eventType,
      ...base,
      payload: eventPayload(eventType, name, kind, redactedInput, call.requiresApproval, content, metadata, stream),
    });
    return event;
  }

  return {
    started() {
      const summary = createToolSummary(name, redactedInput, "running");
      record("tool.started", summary, {
        name,
        kind,
        input: redactedInput,
        summary,
        requiresApproval: call.requiresApproval,
      });
    },
    progress(message: string, detail?: string, progressKind?: string) {
      record("tool.progress", message, { message, detail, progressKind });
    },
    output(delta: string, stream: ToolTraceStream = "stdout") {
      if (!delta) return;
      record("tool.output.delta", delta, { stream }, stream);
    },
    completed(status: ToolTraceStatus | "success", output?: string, metadata?: AnyRecord) {
      const normalizedStatus = status === "success" ? "success" : status;
      record("tool.completed", createToolSummary(name, redactedInput, normalizedStatus === "success" ? "completed" : normalizedStatus), {
        name,
        status: normalizedStatus,
        output,
        preview: output ? truncateToolOutput(output, 8 * 1024) : undefined,
        ...metadata,
      });
    },
  };
}

function eventPayload(
  eventType: string,
  name: string,
  kind: ToolTraceKind,
  input: AnyRecord,
  requiresApproval: boolean,
  content?: string,
  metadata: AnyRecord = {},
  stream?: ToolTraceStream,
) {
  if (eventType === "tool.started") {
    return {
      name,
      kind,
      input,
      summary: metadata.summary ?? content ?? createToolSummary(name, input, "running"),
      requiresApproval,
    };
  }
  if (eventType === "tool.progress") {
    return {
      message: metadata.message ?? content ?? "",
      detail: metadata.detail,
      progressKind: metadata.progressKind,
    };
  }
  if (eventType === "tool.output.delta") {
    return { stream, delta: content ?? "" };
  }
  if (eventType === "tool.completed") {
    return {
      name,
      status: metadata.status ?? "success",
      output: metadata.output,
      preview: metadata.preview,
      exitCode: metadata.exitCode,
    };
  }
  return metadata;
}

type ToolContext = {
  threadId: string;
  turnId?: string;
  workspaceRoot: string;
  permissionMode: string;
};

class AgentRuntimeService {
  private cancelledTurns = new Set<string>();
  private turnAbortControllers = new Map<string, AbortController>();
  toolService = new ToolService();

  constructor() {
    this.toolService.cancelledTurns = this.cancelledTurns;
  }

  startTurn(request: RuntimeTurnStartRequest): ThreadDetail {
    const thread = storage.getThread(request.threadId);
    if (thread.status === "running") {
      const queued = storage.enqueueInput(request);
      emitAgentEvent({ event: "turn.queued", threadId: request.threadId, payload: queued });
      return storage.readThread(request.threadId);
    }
    storage.setThreadStatus(request.threadId, "running");
    void this.processTurnLoop(request).catch((error) => {
      storage.setThreadStatus(request.threadId, "error");
      emitAgentEvent({ event: "turn.failed", threadId: request.threadId, payload: normalizeError(error) });
    });
    return storage.readThread(request.threadId);
  }

  enqueueTurn(request: TurnStartRequest) {
    const queued = storage.enqueueInput(request);
    emitAgentEvent({ event: "turn.queued", threadId: request.threadId, payload: queued });
    return storage.readThread(request.threadId);
  }

  steerTurn(threadId: string, input: string) {
    const turnId = storage.runningTurns(threadId)[0]?.id;
    const item: AgentItem = {
      id: newId("item"),
      threadId,
      turnId,
      role: "user",
      itemType: "steer",
      content: input,
      status: "completed",
      metadata: { steer: true },
      hidden: false,
      createdAt: nowMillis(),
    };
    storage.insertItem(item);
    emitAgentEvent({ event: "message.completed", threadId, turnId, itemId: item.id, payload: item });
    return storage.readThread(threadId);
  }

  interruptTurn(threadId: string) {
    storage.clearQueuedInputs(threadId);
    for (const turn of storage.runningTurns(threadId)) {
      this.cancelledTurns.add(turn.id);
      this.turnAbortControllers.get(turn.id)?.abort();
      this.turnAbortControllers.delete(turn.id);
      // 中断正在执行的工具（如 shell 子进程）
      this.toolService.abortTurn(turn.id);
      storage.completeTurn(turn.id, "interrupted");
      emitAgentEvent({ event: "turn.completed", threadId, turnId: turn.id, payload: { status: "interrupted" } });
    }
    storage.setThreadStatus(threadId, "interrupted");
    return storage.readThread(threadId);
  }

  isTurnCancelled(turnId?: string) {
    return Boolean(turnId && this.cancelledTurns.has(turnId));
  }

  retryTurn(threadId: string, request: Partial<TurnStartRequest> = {}) {
    const item = [...storage.readThread(threadId).items].reverse().find((entry) => entry.role === "user" && !entry.hidden && entry.itemType !== "steer");
    if (!item) throw new AppError("UNKNOWN_ERROR", "没有可重试的用户消息");
    return this.editAndRerun(item.id, item.content, request);
  }

  editAndRerun(itemId: string, content: string, request: Partial<TurnStartRequest> = {}) {
    const item = storage.getItem(itemId);
    if (item.role !== "user") throw new AppError("UNKNOWN_ERROR", "只能编辑用户消息并重新发起");
    if (!content.trim()) throw new AppError("UNKNOWN_ERROR", "重试内容不能为空");
    if (storage.getThread(item.threadId).status === "running") throw new AppError("UNKNOWN_ERROR", "当前会话运行中，停止后再重试");
    storage.updateItemContent(item.id, content);
    storage.hideItemsAfter(item.threadId, item.createdAt);
    return this.startTurn({ ...request, threadId: item.threadId, input: content, images: item.images, retryItemId: item.id });
  }

  private async processTurnLoop(first: RuntimeTurnStartRequest) {
    let next: RuntimeTurnStartRequest | undefined = first;
    while (next) {
      await this.processSingleTurn(next);
      const queued = storage.popNextQueued(next.threadId);
      next = queued
        ? {
            threadId: queued.threadId,
            input: queued.input,
            images: queued.images,
            runtimeId: queued.runtimeId,
            providerId: queued.providerId,
            model: queued.model,
            reasoningEffort: queued.reasoningEffort,
            permissionMode: queued.permissionMode as PermissionMode | undefined,
          }
        : undefined;
      if (!next && storage.getThread(first.threadId).status !== "interrupted") {
        storage.setThreadStatus(first.threadId, "idle");
      }
    }
  }

  private async processSingleTurn(request: RuntimeTurnStartRequest) {
    const thread = storage.getThread(request.threadId);
    const workspace = storage.getWorkspace(thread.workspaceId);
    const runtimeId = DEEPAGENTS_RUNTIME_ID;
    let providerId = request.providerId ?? thread.providerId;
    let model = request.model ?? thread.model;
    if (providerId === "mock") {
      const preferred = storage.preferredModelConfig();
      if (preferred) {
        providerId = preferred.id;
        model = preferred.defaultModel;
      }
    }
    const permissionMode = request.permissionMode ?? (thread.permissionMode as PermissionMode);
    const runtime = storage.getAgentRuntime(runtimeId);
    const reasoningEffort = request.reasoningEffort ?? thread.reasoningEffort;
    storage.setThreadRuntime(request.threadId, providerId, model, permissionMode, reasoningEffort);
    const currentThread: AgentThread = {
      ...thread,
      runtimeId,
      providerId,
      model,
      reasoningEffort,
      permissionMode,
    };
    const turn: AgentTurn = {
      id: newId("turn"),
      threadId: request.threadId,
      status: "running",
      runtimeId,
      providerId,
      model,
      reasoningEffort,
      permissionMode,
      startedAt: nowMillis(),
    };
    storage.insertTurn(turn);
    emitAgentEvent({ event: "turn.started", threadId: request.threadId, turnId: turn.id, payload: turn });

    const retryItem = request.retryItemId ? storage.getItem(request.retryItemId) : undefined;
    if (retryItem && (retryItem.threadId !== request.threadId || retryItem.role !== "user")) {
      throw new AppError("UNKNOWN_ERROR", "只能基于当前会话的用户消息重试");
    }
    const userItem: AgentItem = retryItem
      ? storage.updateItemForRetry(retryItem.id, {
        turnId: turn.id,
        content: request.input,
        images: request.images ?? retryItem.images,
      })
      : {
        id: newId("item"),
        threadId: request.threadId,
        turnId: turn.id,
        role: "user",
        itemType: "message",
        content: request.input,
        status: "completed",
        images: request.images,
        hidden: false,
        createdAt: nowMillis(),
      };
    if (!retryItem) storage.insertItem(userItem);
    emitAgentEvent({ event: "message.completed", threadId: request.threadId, turnId: turn.id, itemId: userItem.id, payload: userItem });

    const assistantItem: AgentItem = {
      id: newId("item"),
      threadId: request.threadId,
      turnId: turn.id,
      role: "assistant",
      itemType: "message",
      content: "",
      status: "running",
      hidden: false,
      createdAt: nowMillis(),
    };
    storage.insertItem(assistantItem);
    const abortController = new AbortController();
    this.turnAbortControllers.set(turn.id, abortController);

    try {
      const ctx: RuntimeContext = { workspace, thread: currentThread, turn, input: request.input, assistantItemId: assistantItem.id, providerId, model, reasoningEffort, permissionMode, runtime, abortSignal: abortController.signal };
      if (runtime.runtimeKind !== "deepagents") {
        throw new AppError("UNSUPPORTED_RUNTIME", "内置 Runtime 已移除，请使用 DeepAgents。");
      }
      this.throwIfCancelled(turn.id);
      recordRuntimeProgress(ctx, "已接收用户输入，准备进入本轮模型处理。");
      recordRuntimeProgress(ctx, "正在构建模型上下文：合并最近对话、工作区和可用工具。");
      recordRuntimeProgress(ctx, "开始调用模型生成回复。");
      const turnTokenUsage = await this.runDeepAgents(ctx);
      this.throwIfCancelled(turn.id);
      recordRuntimeProgress(ctx, "模型回复生成完成，正在整理最终回答。");
      this.sanitizeAssistantContent(ctx);
      storage.setItemStatus(assistantItem.id, "completed");
      storage.completeTurn(turn.id, "completed", turnTokenUsage);
      emitAgentEvent({ event: "message.completed", threadId: request.threadId, turnId: turn.id, itemId: assistantItem.id, payload: { status: "completed" } });
      const turnCompletedPayload: Record<string, unknown> = { status: "completed" };
      if (turnTokenUsage) turnCompletedPayload.tokenUsage = turnTokenUsage;
      emitAgentEvent({ event: "turn.completed", threadId: request.threadId, turnId: turn.id, payload: turnCompletedPayload });
    } catch (error) {
      if (this.isTurnCancelledError(error)) {
        storage.setItemStatus(assistantItem.id, "cancelled");
        storage.completeTurn(turn.id, "interrupted");
        emitAgentEvent({ event: "turn.completed", threadId: request.threadId, turnId: turn.id, itemId: assistantItem.id, payload: { status: "interrupted" } });
        return;
      }
      const normalized = normalizeRuntimeError(error, { model, provider: tryCall(() => storage.getModelConfig(providerId)) });
      storage.appendItemContent(assistantItem.id, formatAssistantError(normalized));
      storage.setItemStatus(assistantItem.id, "error");
      storage.completeTurn(turn.id, "failed");
      emitAgentEvent({ event: "turn.failed", threadId: request.threadId, turnId: turn.id, itemId: assistantItem.id, payload: normalized });
    } finally {
      this.turnAbortControllers.delete(turn.id);
      this.cancelledTurns.delete(turn.id);
    }
  }

  private async runDeepAgents(ctx: RuntimeContext): Promise<{ inputTokens: number; outputTokens: number; totalTokens: number; cacheCreation?: number; cacheRead?: number } | undefined> {
    const modelConfig = storage.getModelConfig(ctx.providerId);
    if (modelConfig.providerKind === "mock") {
      recordRuntimeProgress(ctx, "模型已经开始返回内容。");
      await this.streamText(ctx, `DeepAgents Runtime 已在 Electron 主进程内启动。\n\n当前 provider 是 Mock，没有调用外部模型。配置 API Key 并切换到 OpenAI-compatible、Anthropic 或 Ollama 后，会由官方 \`createDeepAgent\` 执行完整 agent loop。`);
      return undefined;
    }
    const model = createChatModel(modelConfig, ctx.model, ctx.reasoningEffort);
    const messages = modelVisibleMessages(ctx.thread.id);
    const toolCtx: ToolContext = { threadId: ctx.thread.id, turnId: ctx.turn.id, workspaceRoot: ctx.workspace.rootPath, permissionMode: ctx.permissionMode };
    const files = skillFiles(ctx.workspace.id);
    const agent = createDeepAgent({
      model,
      tools: [
        progressNoteTool(ctx),
        hostTool("git_status", "查看当前工作区 git 状态", z.object({}), toolCtx),
        hostTool("git_diff", "查看当前工作区 git diff", z.object({ staged: z.boolean().optional() }), toolCtx),
        hostTool("git_stage", "暂存文件", z.object({ paths: z.array(z.string()) }), toolCtx),
        hostTool("git_commit", "提交 git commit", z.object({ message: z.string() }), toolCtx),
        hostTool("git_checkout", "切换 git 分支", z.object({ branch: z.string() }), toolCtx),
        hostTool("git_pull", "执行 git pull --ff-only", z.object({}), toolCtx),
        hostTool("git_push", "执行 git push", z.object({}), toolCtx),
        hostTool("shell", "在工作区执行 shell 命令，可能需要用户审批", z.object({ command: z.string() }), toolCtx),
        ...await mcpToolsForAgent(toolCtx),
      ] as any,
      backend: createHostBackend(toolCtx, files) as any,
      skills: Object.keys(files).length ? ["/skills/"] : undefined,
      systemPrompt: `你是 Any Jumper Desktop 的官方 DeepAgents Runtime。你运行在 Electron 主进程内部，所有文件、shell、git、MCP、业务操作都必须通过宿主工具桥。默认用中文回复。当前工作区：${ctx.workspace.rootPath}。当前权限：${ctx.permissionMode}。在开始关键阶段、读到重要线索、准备修改文件、开始验证或遇到阻塞时，调用 progress_note 写一句可公开展示给用户的中文进度；不要泄露隐藏推理链，只描述可公开的工作状态。最终回答只保留结论、关键证据和必要建议；不要在最终回答中输出执行过程、工具调用代码、原始日志、<details> 执行过程块或反复试错流水账。`,
      subagents: [
        {
          name: "general-purpose",
          description: "处理可独立推进的代码阅读、实现、验证或资料整理子任务。",
          prompt: "你是 Any Jumper Desktop 的子 Agent。继承主 Agent 的工作区、模型和权限，只能通过可用工具推进任务，并用中文总结结果。",
        },
      ],
    } as any);

    let finalCandidate = "";
    let exposedReasoning = "";
    let finalReasoningCandidate = "";
    let modelOutputStarted = false;
    const outputClassifier = new TurnOutputClassifier();
    let turnTokenUsage: ReturnType<typeof extractFinalOutputParts>["usage"];
    const inputState = {
      messages: messages.length ? messages : [new HumanMessage({ content: ctx.input })],
      files,
    };
    const stream = agent.streamEvents(inputState as any, { version: "v2", configurable: { thread_id: ctx.thread.id, checkpoint_ns: ctx.turn.id }, signal: ctx.abortSignal } as any);
    for await (const event of stream as any) {
      this.throwIfCancelled(ctx.turn.id);
      if (event?.event === "on_chat_model_stream") {
        const chunk = event?.data?.chunk;
        const parts = extractModelOutputParts(chunk);
        if (parts.reasoning) exposedReasoning += parts.reasoning;
        if (parts.content) {
          if (!modelOutputStarted) {
            modelOutputStarted = true;
            recordRuntimeProgress(ctx, "模型已经开始返回内容。");
          }
          outputClassifier.appendModelText(parts.content);
        }
        // Track usage_metadata from the final chunk of the model stream
        const chunkUsage = chunk?.usage_metadata;
        if (chunkUsage && typeof chunkUsage.input_tokens === "number") {
          turnTokenUsage = {
            inputTokens: chunkUsage.input_tokens,
            outputTokens: chunkUsage.output_tokens,
            totalTokens: chunkUsage.total_tokens,
            cacheCreation: chunkUsage.input_token_details?.cache_creation,
            cacheRead: chunkUsage.input_token_details?.cache_read,
          };
        }
      }
      if (event?.event === "on_tool_start") {
        flushTurnOutputSegments(ctx, outputClassifier.flushBeforeToolCall());
      }
      if (event?.event === "on_tool_start" && event?.name === "write_todos") emitTodos(ctx, event?.data?.input);
      if (event?.event === "on_tool_end" && event?.name === "write_todos") emitTodos(ctx, event?.data?.output ?? event?.data?.input);
      if (event?.event === "on_tool_start" && event?.name === "task") {
        emitAgentEvent({ event: "tool.delta", threadId: ctx.thread.id, turnId: ctx.turn.id, payload: { name: "task", status: "started", input: event?.data?.input } });
      }
      if (event?.event === "on_tool_end" && event?.name === "task") {
        emitAgentEvent({ event: "tool.delta", threadId: ctx.thread.id, turnId: ctx.turn.id, payload: { name: "task", status: "completed", output: stringify(event?.data?.output) } });
      }
      const candidateParts = extractFinalOutputParts(event?.data?.output);
      if (candidateParts.usage) turnTokenUsage = candidateParts.usage;
      if (candidateParts.reasoning) finalReasoningCandidate = candidateParts.reasoning;
      const candidate = candidateParts.content;
      if (candidate) finalCandidate = candidate;
      if (event?.event === "on_chain_end" && event?.data?.output) storage.saveRuntimeCheckpoint(ctx.thread.id, ctx.turn.id, ctx.runtime.id, event.data.output);
    }
    const reasoningToRecord = exposedReasoning.trim() ? exposedReasoning : finalReasoningCandidate;
    if (reasoningToRecord.trim()) {
      recordModelReasoning(ctx, reasoningToRecord);
      // Save reasoning_content to the assistant item for DeepSeek thinking mode
      storage.updateItemReasoningContent(ctx.assistantItemId, reasoningToRecord);
    }
    const finalFlush = flushTurnOutputSegments(ctx, outputClassifier.finish());
    if (!finalFlush.finalAnswerEmitted && finalCandidate) {
      recordRuntimeProgress(ctx, "模型已经开始返回内容。");
      await this.streamText(ctx, finalCandidate);
    }
    return turnTokenUsage;
  }

  private sanitizeAssistantContent(ctx: RuntimeContext) {
    const item = storage.getItem(ctx.assistantItemId);
    const exposedThinking = stripExposedThinking(item.content);
    if (exposedThinking.reasoning) recordModelReasoning(ctx, exposedThinking.reasoning);
    if (exposedThinking.content === item.content) return;
    storage.updateItemContent(ctx.assistantItemId, exposedThinking.content);
    emitAgentEvent({
      event: "message.replaced",
      threadId: ctx.thread.id,
      turnId: ctx.turn.id,
      itemId: ctx.assistantItemId,
      payload: { content: exposedThinking.content },
    });
  }

  private async streamText(ctx: RuntimeContext, text: string) {
    for (let i = 0; i < text.length; i += 24) {
      this.throwIfCancelled(ctx.turn.id);
      this.emitDelta(ctx, text.slice(i, i + 24));
      await new Promise((resolve) => setTimeout(resolve, 12));
    }
  }

  private emitDelta(ctx: RuntimeContext, delta: string) {
    this.throwIfCancelled(ctx.turn.id);
    storage.appendItemContent(ctx.assistantItemId, delta);
    emitAgentEvent({ event: "message.delta", threadId: ctx.thread.id, turnId: ctx.turn.id, itemId: ctx.assistantItemId, payload: { delta } });
  }

  private throwIfCancelled(turnId: string) {
    if (this.cancelledTurns.has(turnId)) throw new AppError("CANCELLED", "Turn 已停止");
  }

  private isTurnCancelledError(error: unknown) {
    return normalizeError(error).code === "CANCELLED";
  }
}

type RuntimeContext = {
  workspace: Workspace;
  thread: AgentThread;
  turn: AgentTurn;
  input: string;
  assistantItemId: string;
  providerId: string;
  model: string;
  reasoningEffort?: string;
  permissionMode: PermissionMode | string;
  runtime: AgentRuntimeConfig;
  abortSignal?: AbortSignal;
};

function mapWorkspace(row: any): Workspace {
  const item = camelRow<Workspace>(row);
  return { ...item };
}

function normalizeModelNames(models: Array<string | undefined>) {
  return Array.from(new Set(models.map((item) => item?.trim()).filter(Boolean) as string[]));
}

function mapModelConfig(row: any): ModelConfig {
  const item = camelRow<ModelConfig>(row);
  const hasApiKey = Boolean(secrets?.get(`ai-model-api-key-${item.id}`));
  const models = normalizeModelNames(jsonParse<string[]>((row as any).models_json, []));
  return { ...item, models, enabled: toBool((row as any).enabled), hasApiKey, apiKey: undefined };
}

function mapRuntime(row: any): AgentRuntimeConfig {
  const item = camelRow<AgentRuntimeConfig>(row);
  return { ...item, enabled: toBool((row as any).enabled), endpointUrl: item.endpointUrl ?? undefined };
}

function mapThread(row: any): AgentThread {
  const item = camelRow<AgentThread>(row);
  return { ...item, archived: toBool((row as any).archived), forkedFromId: item.forkedFromId ?? undefined, reasoningEffort: item.reasoningEffort ?? undefined };
}

function mapTurn(row: any): AgentTurn {
  const item = camelRow<AgentTurn>(row);
  return {
    ...item,
    completedAt: item.completedAt ?? undefined,
    reasoningEffort: item.reasoningEffort ?? undefined,
    tokenUsage: jsonParse(row.token_usage_json, undefined),
  };
}

function mapItem(row: any): AgentItem {
  const item = camelRow<AgentItem & { metadataJson?: string; imagesJson?: string }>(row);
  const { metadataJson: _metadataJson, imagesJson: _imagesJson, ...rest } = item;
  void _metadataJson;
  void _imagesJson;
  return { ...rest, hidden: toBool((row as any).hidden), turnId: item.turnId ?? undefined, toolCallId: item.toolCallId ?? undefined, metadata: jsonParse(item.metadataJson, undefined), images: jsonParse(item.imagesJson, undefined), reasoningContent: item.reasoningContent ?? undefined };
}

function mapQueue(row: any): QueuedInput {
  const item = camelRow<QueuedInput & { imagesJson?: string }>(row);
  const { imagesJson: _imagesJson, ...rest } = item;
  void _imagesJson;
  return { ...rest, runtimeId: item.runtimeId ?? undefined, providerId: item.providerId ?? undefined, model: item.model ?? undefined, reasoningEffort: item.reasoningEffort ?? undefined, permissionMode: item.permissionMode ?? undefined, images: jsonParse(item.imagesJson, undefined) };
}

function mapToolCall(row: any): ToolCall {
  const item = camelRow<ToolCall>(row);
  return { ...item, requiresApproval: toBool((row as any).requires_approval), turnId: item.turnId ?? undefined, output: item.output ?? undefined, completedAt: item.completedAt ?? undefined };
}

function mapToolCallEvent(row: any): ToolCallEvent {
  const item = camelRow<ToolCallEvent & { metadataJson?: string }>(row);
  const { metadataJson: _metadataJson, ...rest } = item;
  void _metadataJson;
  return {
    ...rest,
    turnId: item.turnId ?? undefined,
    stream: item.stream ?? undefined,
    content: item.content ?? undefined,
    metadata: jsonParse(item.metadataJson, undefined),
  };
}

function mapProgressNote(row: any): ProgressNote {
  const item = camelRow<ProgressNote>(row);
  return { ...item, turnId: item.turnId ?? undefined, completedAt: item.completedAt ?? undefined };
}

function mapApproval(row: any): Approval {
  const item = camelRow<Approval>(row);
  return { ...item, decision: item.decision ?? undefined, resolvedAt: item.resolvedAt ?? undefined };
}

function mapMcp(row: any): McpServerConfig {
  const item = camelRow<McpServerConfig>(row);
  return { ...item, enabled: toBool((row as any).enabled), commandJson: item.commandJson ?? undefined, url: item.url ?? undefined, envJson: item.envJson ?? undefined };
}

function mapPlugin(row: any): PluginSummary {
  const item = camelRow<PluginSummary>(row);
  return { ...item, enabled: toBool((row as any).enabled), version: item.version ?? undefined, description: item.description ?? undefined };
}

function legacyDatabaseCandidates() {
  return [
    path.join(homedir(), "Library/Application Support/com.kancy.Any Jumper Desktop/agent.sqlite3"),
    path.join(homedir(), "Library/Application Support/com.kancy.Any-Jumper-Desktop/agent.sqlite3"),
    path.join(homedir(), "Library/Application Support/Any Jumper Desktop/agent.sqlite3"),
  ];
}

async function discoverProviderModels(id: string): Promise<string[]> {
  const config = storage.getModelConfig(id);
  validateModelProvider(config);
  if (config.providerKind === "mock") return normalizeModelNames(config.models?.length ? config.models : ["mock-agent"]);
  if (config.providerKind === "ollama") {
    const data = await fetchProviderJson(apiUrl(config.baseUrl || "http://127.0.0.1:11434", "api/tags"));
    return normalizeModelNames((data.models || []).map((model: any) => model.name));
  }
  const apiKey = secrets.get(`ai-model-api-key-${config.id}`);
  if (!apiKey) throw new AppError("TOKEN_MISSING", `请先为 ${config.displayName} 配置 API Key`);
  if (config.providerKind === "anthropic" || config.providerKind === "anthropic-compatible") {
    const data = await fetchProviderJson(apiUrl(config.baseUrl || "https://api.anthropic.com", "v1/models"), {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    return normalizeModelNames((data.data || []).map((model: any) => model.id));
  }
  const data = await fetchProviderJson(apiUrl(config.baseUrl || "https://api.openai.com/v1", "models"), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return normalizeModelNames((data.data || []).map((model: any) => model.id));
}

function apiUrl(baseUrl: string, endpoint: string) {
  return new URL(endpoint.replace(/^\/+/, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

async function fetchProviderJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AppError("NETWORK_ERROR", `模型列表拉取失败：HTTP ${response.status}`, detail.slice(0, 500));
  }
  return response.json();
}

function createChatModel(config: ModelConfig, model: string, reasoningEffort?: string) {
  validateModelProvider(config);
  if (config.providerKind === "anthropic" || config.providerKind === "anthropic-compatible") {
    const apiKey = secrets.get(`ai-model-api-key-${config.id}`);
    if (!apiKey) throw new AppError("TOKEN_MISSING", "请先在模型设置中配置 Anthropic-compatible API Key");
    const thinking = anthropicThinkingOptions(model, reasoningEffort);
    return new ChatAnthropic({
      model,
      apiKey,
      anthropicApiUrl: config.baseUrl || undefined,
      streaming: true,
      thinking,
      maxTokens: anthropicMaxTokens(thinking),
      outputConfig: anthropicOutputConfig(thinking, reasoningEffort),
    } as any);
  }
  if (config.providerKind === "ollama") {
    return new ChatOllama({ model, baseUrl: config.baseUrl || "http://127.0.0.1:11434" });
  }
  const apiKey = secrets.get(`ai-model-api-key-${config.id}`);
  if (!apiKey) throw new AppError("TOKEN_MISSING", "请先在模型设置中配置 OpenAI-compatible API Key");
  const chatModel = new ChatOpenAI({
    model,
    apiKey,
    streaming: true,
    configuration: { baseURL: config.baseUrl },
    __includeRawResponse: true,
    reasoning: shouldUseOpenAIResponsesApi(model) ? openAIReasoningOptions(reasoningEffort) : undefined,
    useResponsesApi: shouldUseOpenAIResponsesApi(model),
  } as any);
  return isDeepSeekOpenAICompatible(config, model)
    ? enableDeepSeekReasoningRoundTrip(chatModel as any)
    : chatModel;
}

function openAIReasoningOptions(reasoningEffort?: string) {
  return {
    effort: normalizeReasoningEffort(reasoningEffort, ["minimal", "low", "medium", "high", "xhigh"], "medium"),
    summary: "auto",
  };
}

function shouldUseOpenAIResponsesApi(model: string) {
  const value = model.toLowerCase();
  return /^(o[1-9]|gpt-5|computer-use-preview|codex-)/.test(value);
}

function isDeepSeekOpenAICompatible(config: ModelConfig, model: string) {
  if (config.providerKind !== "openai-compatible") return false;
  const host = safeUrl(config.baseUrl)?.hostname.toLowerCase() || "";
  return isDeepSeekHost(host) || model.toLowerCase().includes("deepseek");
}

function anthropicThinkingOptions(model: string, reasoningEffort?: string) {
  if (!supportsAnthropicThinking(model)) return { type: "disabled" };
  if (model.toLowerCase().startsWith("claude-opus-4-7")) return { type: "adaptive" };
  return {
    type: "enabled",
    budget_tokens: anthropicThinkingBudget(reasoningEffort),
  };
}

function supportsAnthropicThinking(model: string) {
  const value = model.toLowerCase();
  return value.includes("claude-3-7")
    || value.includes("claude-sonnet-4")
    || value.includes("claude-opus-4")
    || value.includes("claude-4")
    || value.includes("thinking");
}

function anthropicThinkingBudget(reasoningEffort?: string) {
  const effort = normalizeReasoningEffort(reasoningEffort, ["minimal", "low", "medium", "high", "xhigh"], "medium");
  if (effort === "high" || effort === "xhigh") return 4096;
  if (effort === "medium") return 2048;
  return 1024;
}

function anthropicMaxTokens(thinking: AnyRecord) {
  if (thinking.type === "adaptive") return 4096;
  if (thinking.type !== "enabled") return undefined;
  return Math.max(4096, Number(thinking.budget_tokens ?? 1024) + 2048);
}

function anthropicOutputConfig(thinking: AnyRecord, reasoningEffort?: string) {
  if (thinking.type !== "adaptive") return undefined;
  return {
    effort: normalizeReasoningEffort(reasoningEffort, ["low", "medium", "high", "xhigh", "max"], "medium"),
  };
}

function normalizeReasoningEffort(value: string | undefined, allowed: string[], fallback: string) {
  const normalized = String(value ?? "").toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function validateModelProvider(config: Pick<ModelConfig, "providerKind" | "baseUrl">) {
  const url = config.baseUrl.trim();
  const parsedUrl = safeUrl(url);
  const host = parsedUrl?.hostname.toLowerCase() || "";
  const pathSegments = parsedUrl?.pathname.toLowerCase().split("/").filter(Boolean) || [];
  const isDeepSeekAnthropicUrl = pathSegments.includes("anthropic");
  if (host === "platform.deepseek.com") {
    throw new AppError(
      "NETWORK_ERROR",
      "DeepSeek 的控制台地址不能作为 API Base URL",
      `请使用内置 DeepSeek Provider，或将类型设为 OpenAI Compatible，Base URL 填 ${DEEPSEEK_OPENAI_BASE_URL}。`,
    );
  }
  if (!isDeepSeekHost(host)) return;
  if (config.providerKind === "openai-compatible" && isDeepSeekAnthropicUrl) {
    throw new AppError(
      "NETWORK_ERROR",
      "当前 Provider 类型与 DeepSeek Base URL 不匹配",
      `OpenAI Compatible 应使用 ${DEEPSEEK_OPENAI_BASE_URL}；当前 URL 是 Anthropic 格式。请删除 /anthropic，或将类型改为 Anthropic Compatible。`,
    );
  }
  if ((config.providerKind === "anthropic" || config.providerKind === "anthropic-compatible") && !isDeepSeekAnthropicUrl) {
    throw new AppError(
      "NETWORK_ERROR",
      "当前 Provider 类型与 DeepSeek Base URL 不匹配",
      `DeepSeek 的 Anthropic 格式 Base URL 是 ${DEEPSEEK_ANTHROPIC_BASE_URL}。请补上 /anthropic，或改选 OpenAI Compatible。`,
    );
  }
}

function safeUrl(rawUrl: string) {
  try {
    return new URL(rawUrl);
  } catch {
    return undefined;
  }
}

function isDeepSeekHost(host: string) {
  return host === "deepseek.com" || host.endsWith(".deepseek.com");
}

function modelVisibleMessages(threadId: string) {
  const items: AgentItem[] = storage.readThread(threadId).items;
  return items
    .filter((item) => !item.hidden && item.itemType === "message" && (item.content.trim() || item.reasoningContent !== undefined || (item.images && item.images.length > 0)))
    .slice(-20)
    .map((item) => {
      if (!item.images || item.images.length === 0) {
        if (item.role === "assistant") {
          const messageOptions: any = { content: item.content };
          if (item.reasoningContent !== undefined) {
            messageOptions.additional_kwargs = { reasoning_content: item.reasoningContent };
          }
          return new AIMessage(messageOptions);
        }
        if (item.role === "system") return new SystemMessage({ content: item.content });
        return new HumanMessage({ content: item.content });
      }
      const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      if (item.content.trim()) {
        content.push({ type: "text", text: item.content });
      }
      for (const image of item.images) {
        content.push({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data}` } });
      }
      return new HumanMessage({ content });
    });
}

function hostTool(name: string, description: string, schema: z.ZodTypeAny, ctx: ToolContext) {
  return tool(async (input: any) => appRuntime.toolService.invoke(ctx, name, input ?? {}), { name, description, schema });
}

function progressNoteTool(ctx: RuntimeContext) {
  return tool(async (input: any) => {
    if (appRuntime.isTurnCancelled(ctx.turn.id)) throw new AppError("CANCELLED", "会话已终止");
    const content = String(input?.content ?? input?.message ?? "").replace(/\s+/g, " ").trim();
    if (!content) return "公开进度为空，已跳过";
    const status = normalizeProgressNoteStatus(input?.status);
    recordProgressNote(ctx, content, status);
    return "已记录公开进度";
  }, {
    name: "progress_note",
    description: "记录一条可公开展示给用户的简短工作进度。只写正在做什么、发现了什么或下一步动作，不要写隐藏推理链。",
    schema: z.object({
      content: z.string().describe("公开进度，使用中文，控制在一句话内"),
      status: z.enum(["running", "completed"]).optional().describe("进度状态，默认 completed"),
    }),
  });
}

function recordProgressNote(ctx: RuntimeContext, content: string, status: ProgressNote["status"], kind: ProgressNote["kind"] = "progress") {
  if (appRuntime.isTurnCancelled(ctx.turn.id)) return undefined;
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  if (!normalizedContent) return undefined;
  const now = nowMillis();
  const noteContent = kind === "reasoning"
    ? truncateTraceThoughtText(content).content
    : normalizedContent.length > 240
      ? `${normalizedContent.slice(0, 240)}...`
      : normalizedContent;
  const note = storage.insertProgressNote({
    id: newId("note"),
    threadId: ctx.thread.id,
    turnId: ctx.turn.id,
    kind,
    content: noteContent,
    status,
    createdAt: now,
    completedAt: status === "completed" ? now : undefined,
  });
  emitAgentEvent({
    event: "progress.note",
    threadId: ctx.thread.id,
    turnId: ctx.turn.id,
    payload: note,
  });
  return note;
}

function recordRuntimeProgress(ctx: RuntimeContext, content: string) {
  return recordProgressNote(ctx, content, "completed");
}

function recordModelReasoning(ctx: RuntimeContext, content: string) {
  return recordProgressNote(ctx, content, "completed", "reasoning");
}

function flushTurnOutputSegments(ctx: RuntimeContext, segments: TurnOutputSegment[]) {
  let finalAnswerEmitted = false;
  if (appRuntime.isTurnCancelled(ctx.turn.id)) return { finalAnswerEmitted };
  for (const segment of segments) {
    if (segment.phase === "commentary") {
      recordProgressNote(ctx, segment.text, "completed");
      continue;
    }
    finalAnswerEmitted = true;
    storage.appendItemContent(ctx.assistantItemId, segment.text);
    emitAgentEvent({
      event: "message.delta",
      threadId: ctx.thread.id,
      turnId: ctx.turn.id,
      itemId: ctx.assistantItemId,
      payload: { delta: segment.text },
    });
  }
  return { finalAnswerEmitted };
}

function createHostBackend(ctx: ToolContext, virtualFiles: Record<string, any> = {}) {
  const invoke = (name: string, input: AnyRecord) => appRuntime.toolService.invoke(ctx, name, input);
  const now = () => new Date().toISOString();
  return {
    id: "any-jumper-electron-workspace",
    async ls(filePath: string) {
      try {
        const virtual = listVirtualFiles(virtualFiles, filePath);
        if (virtual) return { files: virtual };
        const output = await invoke("list_files", { path: backendFilePath(ctx.workspaceRoot, filePath) });
        return { files: output.split("\n").filter(Boolean).map((line) => {
          const [entryPath, type, size] = line.split("\t");
          return { path: entryPath, is_dir: type === "dir", size: Number(size) || undefined };
        }) };
      } catch (error: any) {
        return { error: error.message };
      }
    },
    async read(filePath: string, offset = 0, limit = 500) {
      try {
        const virtual = readVirtualFile(virtualFiles, filePath);
        if (virtual !== undefined) return { content: sliceText(virtual, offset, limit), mimeType: "text/plain" };
        return { content: await invoke("read_file", { path: backendFilePath(ctx.workspaceRoot, filePath), offset, limit }), mimeType: "text/plain" };
      } catch (error: any) {
        return { error: error.message };
      }
    },
    async readRaw(filePath: string) {
      try {
        const virtual = readVirtualFile(virtualFiles, filePath);
        const content = virtual ?? await invoke("read_file", { path: backendFilePath(ctx.workspaceRoot, filePath) });
        return { data: { content, mimeType: "text/plain", created_at: now(), modified_at: now() } };
      } catch (error: any) {
        return { error: error.message };
      }
    },
    async grep(pattern: string, basePath?: string | null, glob?: string | null) {
      try {
        const virtual = grepVirtualFiles(virtualFiles, pattern, basePath, glob);
        if (virtual) return { matches: virtual };
        const output = await invoke("search", { pattern, path: backendFilePath(ctx.workspaceRoot, basePath || "."), glob });
        return { matches: output.split("\n").filter(Boolean).map((line) => {
          const [matchPath, lineNumber, ...rest] = line.split(":");
          return { path: matchPath, line: Number(lineNumber) || 1, text: rest.join(":") };
        }) };
      } catch (error: any) {
        return { error: error.message };
      }
    },
    async glob(pattern: string, basePath?: string) {
      try {
        const virtual = globVirtualFiles(virtualFiles, pattern, basePath);
        if (virtual) return { files: virtual };
        return { files: (await invoke("glob", { pattern, path: backendFilePath(ctx.workspaceRoot, basePath || ".") })).split("\n").filter(Boolean).map((filePath) => ({ path: filePath })) };
      } catch (error: any) {
        return { error: error.message };
      }
    },
    async write(filePath: string, content: string) {
      try {
        await invoke("write_file", { path: backendFilePath(ctx.workspaceRoot, filePath), content });
        return { path: filePath, filesUpdate: null };
      } catch (error: any) {
        return { error: error.message };
      }
    },
    async edit(filePath: string, oldString: string, newString: string, replaceAll = false) {
      try {
        const output = await invoke("edit_file", { path: backendFilePath(ctx.workspaceRoot, filePath), oldString, newString, replaceAll });
        return { path: filePath, occurrences: Number(output.match(/occurrences=(\d+)/)?.[1] ?? 1), filesUpdate: null };
      } catch (error: any) {
        return { error: error.message };
      }
    },
    async execute(command: string) {
      try {
        return { output: await invoke("shell", { command }), exitCode: 0, truncated: false };
      } catch (error: any) {
        return { output: error.message, exitCode: 1, truncated: false };
      }
    },
  };
}

function backendFilePath(root: string, filePath?: string | null) {
  const value = String(filePath || ".");
  if (value === "/") return ".";
  if (!path.isAbsolute(value)) return value;
  const resolved = path.resolve(value);
  if (inside(root, resolved) || existsSync(resolved)) return resolved;
  return value.replace(/^\/+/, "") || ".";
}

function listVirtualFiles(files: Record<string, any>, filePath?: string | null) {
  const target = normalizeVirtualPath(filePath || "/");
  if (!isVirtualSkillPath(target)) return undefined;
  const exact = virtualFileContent(files, target);
  if (exact !== undefined) return [{ path: target, is_dir: false, size: exact.length }];

  const prefix = `${target === "/" ? "" : target}/`;
  const entries = new Map<string, { path: string; is_dir: boolean; size?: number }>();
  for (const key of Object.keys(files)) {
    const normalized = normalizeVirtualPath(key);
    if (!normalized.startsWith(prefix)) continue;
    const rest = normalized.slice(prefix.length);
    const [name, ...tail] = rest.split("/");
    if (!name) continue;
    const entryPath = `${prefix}${name}`;
    const isDir = tail.length > 0;
    const content = isDir ? undefined : virtualFileContent(files, normalized);
    const previous = entries.get(entryPath);
    entries.set(entryPath, {
      path: entryPath,
      is_dir: Boolean(previous?.is_dir || isDir),
      size: content?.length,
    });
  }
  return [...entries.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function readVirtualFile(files: Record<string, any>, filePath?: string | null) {
  const target = normalizeVirtualPath(filePath || "/");
  if (!isVirtualSkillPath(target)) return undefined;
  return virtualFileContent(files, target);
}

function grepVirtualFiles(files: Record<string, any>, pattern: string, basePath?: string | null, glob?: string | null) {
  const base = normalizeVirtualPath(basePath || "/");
  if (!isVirtualSkillPath(base)) return undefined;
  const matches: Array<{ path: string; line: number; text: string }> = [];
  const prefix = `${base === "/" ? "" : base}/`;
  for (const [key, value] of Object.entries(files)) {
    const filePath = normalizeVirtualPath(key);
    if (!filePath.startsWith(prefix)) continue;
    const rel = filePath.replace(/^\//, "");
    if (glob && !wildcardMatch(rel, glob)) continue;
    const content = virtualFileContent({ [filePath]: value }, filePath);
    if (content === undefined) continue;
    content.split("\n").forEach((line, index) => {
      if (matches.length < 80 && line.includes(pattern)) matches.push({ path: filePath, line: index + 1, text: line.trim() });
    });
  }
  return matches;
}

function globVirtualFiles(files: Record<string, any>, pattern: string, basePath?: string | null) {
  const base = normalizeVirtualPath(basePath || "/");
  if (!isVirtualSkillPath(base)) return undefined;
  const prefix = `${base === "/" ? "" : base}/`;
  return Object.keys(files)
    .map(normalizeVirtualPath)
    .filter((filePath) => filePath.startsWith(prefix))
    .filter((filePath) => wildcardMatch(filePath.replace(/^\//, ""), pattern))
    .map((filePath) => ({ path: filePath }));
}

function normalizeVirtualPath(filePath: string) {
  const withSlash = filePath.startsWith("/") ? filePath : `/${filePath}`;
  const normalized = path.posix.normalize(withSlash);
  return normalized === "/" ? "/" : normalized.replace(/\/+$/, "");
}

function isVirtualSkillPath(filePath: string) {
  return filePath === "/skills" || filePath.startsWith("/skills/");
}

function virtualFileContent(files: Record<string, any>, filePath: string): string | undefined {
  const value = files[normalizeVirtualPath(filePath)];
  if (!value) return undefined;
  if (typeof value.content === "string") return value.content;
  if (typeof value.data?.content === "string") return value.data.content;
  return undefined;
}

function sliceText(value: string, offset = 0, limit = 500) {
  return value.split("\n").slice(Number(offset || 0), Number(offset || 0) + Math.min(Number(limit || 500), 2000)).join("\n");
}

async function mcpToolsForAgent(ctx: ToolContext) {
  const tools = [];
  for (const server of storage.listMcpServers().filter((item) => item.enabled)) {
    for (const mcpTool of await mcpListTools(server).catch(() => [])) {
      const name = `mcp_${safeToolName(server.name)}_${safeToolName(mcpTool.name)}`;
      tools.push(tool(async (input: any) => appRuntime.toolService.invoke(ctx, "mcp_call", { serverId: server.id, toolName: mcpTool.name, input: input?.input ?? input ?? {} }), {
        name,
        description: mcpTool.description || `Call MCP tool ${mcpTool.name} on ${server.name}`,
        schema: z.record(z.string(), z.unknown()).optional().default({}),
      }));
    }
  }
  return tools;
}

function skillList(workspaceId?: string): SkillSummary[] {
  const roots = userSkillRoots().map((root) => ({ scope: "user", root }));
  if (workspaceId) {
    const workspace = storage.getWorkspace(workspaceId);
    roots.push(...workspaceSkillRoots(workspace.rootPath).map((root) => ({ scope: "workspace", root })));
  }
  roots.push(...pluginRoots().flatMap((root) => pluginSkillRoots(root).map((skillRoot) => ({ scope: "plugin", root: skillRoot }))));
  const skills: SkillSummary[] = [];
  const seen = new Set<string>();
  for (const { scope, root } of roots) {
    scanSkillRoot(scope, root, skills, seen);
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

function skillRead(filePath: string) {
  if (path.basename(filePath) !== "SKILL.md") throw new AppError("PERMISSION_DENIED", "只能读取 SKILL.md 文件");
  return readFileSync(filePath, "utf8");
}

function skillFiles(workspaceId: string) {
  const created = new Date().toISOString();
  const files: Record<string, unknown> = {};
  for (const skill of skillList(workspaceId).slice(0, 30)) {
    files[`/skills/${safeToolName(skill.name)}/SKILL.md`] = { content: skillRead(skill.path), mimeType: "text/markdown", created_at: created, modified_at: created };
  }
  return files;
}

function userSkillRoots() {
  return [".codex/skills", ".agents/skills", ".claude/skills", ".config/opencode/skills"].map((item) => path.join(homedir(), item));
}

function workspaceSkillRoots(root: string) {
  return [".agents/skills", ".codex/skills", ".claude/skills", ".opencode/skills"].map((item) => path.join(root, item));
}

function scanSkillRoot(scope: string, root: string, out: SkillSummary[], seen: Set<string>) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(root, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;
    const content = readFileSync(skillPath, "utf8");
    const meta = parseSkillMetadata(content, entry.name);
    const identityKey = skillIdentityKey(meta.name);
    if (seen.has(identityKey)) continue;
    seen.add(identityKey);
    out.push({ id: `${scope}:${skillPath}`, name: meta.name, description: meta.description, path: skillPath, scope, enabled: true });
  }
}

function skillIdentityKey(name: string) {
  return name.trim().toLowerCase();
}

function parseSkillMetadata(content: string, fallback: string) {
  let name = fallback;
  let description = "";
  const fm = content.startsWith("---") ? content.slice(3).split("---")[0] : "";
  for (const line of fm.split("\n")) {
    if (line.trim().startsWith("name:")) name = line.split(":").slice(1).join(":").trim().replace(/^["']|["']$/g, "");
    if (line.trim().startsWith("description:")) description = line.split(":").slice(1).join(":").trim().replace(/^["']|["']$/g, "");
  }
  if (!description) description = content.split("\n").find((line) => line.trim() && !line.startsWith("---"))?.trim().slice(0, 180) || "No description";
  return { name, description };
}

function pluginList(): PluginSummary[] {
  const known = storage.listPluginsFromDb();
  const plugins = [...known];
  for (const root of pluginRoots()) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const summary = readPluginSummary(path.join(root, entry.name));
      if (summary && !plugins.some((item) => item.id === summary.id)) plugins.push(summary);
    }
  }
  return plugins.sort((left, right) => left.name.localeCompare(right.name));
}

function pluginInstall(source: string): PluginSummary {
  const target = looksLikeGitUrl(source) ? path.join(app.getPath("userData"), "plugins", newId("plugin")) : source;
  if (looksLikeGitUrl(source)) {
    mkdirSync(path.dirname(target), { recursive: true });
    const result = spawnSync("git", ["clone", source, target], { encoding: "utf8" });
    if (result.status !== 0) throw new AppError("UNKNOWN_ERROR", "Git clone 插件失败", result.stderr);
  }
  const summary = readPluginSummary(target);
  if (!summary) throw new AppError("UNKNOWN_ERROR", "插件缺少 plugin.json");
  storage.upsertPlugin(summary);
  return summary;
}

function pluginRoots() {
  return [path.join(homedir(), ".codex/plugins"), path.join(homedir(), ".agents/plugins"), path.join(homedir(), ".config/opencode/plugins"), path.join(app.getPath("userData"), "plugins")];
}

function pluginSkillRoots(pluginRoot: string) {
  if (!existsSync(pluginRoot)) return [];
  const roots: string[] = [];
  for (const entry of readdirSync(pluginRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const candidate of [path.join(pluginRoot, entry.name, "skills"), path.join(pluginRoot, entry.name, ".codex-plugin/skills")]) {
      if (existsSync(candidate)) roots.push(candidate);
    }
  }
  return roots;
}

function readPluginSummary(pluginPath: string): PluginSummary | undefined {
  const manifestPath = [path.join(pluginPath, ".codex-plugin/plugin.json"), path.join(pluginPath, "plugin.json")].find(existsSync);
  if (!manifestPath) return undefined;
  const manifest = jsonParse<any>(readFileSync(manifestPath, "utf8"), {});
  return { id: pluginPath, name: manifest.name || path.basename(pluginPath), version: manifest.version, description: manifest.description, path: pluginPath, enabled: true };
}

function looksLikeGitUrl(value: string) {
  return value.startsWith("https://") || value.startsWith("http://") || value.startsWith("git@") || value.endsWith(".git");
}

function listFiles(root: string, permission: string, input: AnyRecord, reporter?: ToolTraceReporter) {
  const target = resolvePath(root, input.path || ".");
  ensureReadPath(root, target, permission, "列出");
  reporter?.progress("正在列出文件", target, "path");
  const entries = readdirSync(target, { withFileTypes: true }).slice(0, 300).map((entry) => {
    const full = path.join(target, entry.name);
    const stats = statSync(full);
    return `${full}\t${entry.isDirectory() ? "dir" : "file"}\t${stats.size}`;
  }).sort();
  reporter?.progress(`已列出 ${entries.length} 个条目`, target, "count");
  reporter?.output(entries.slice(0, 20).join("\n"), "preview");
  return entries.join("\n");
}

function readTextFile(root: string, permission: string, input: AnyRecord, reporter?: ToolTraceReporter) {
  const target = resolvePath(root, input.path);
  ensureReadPath(root, target, permission, "读取");
  reporter?.progress("正在读取文件", target, "path");
  const content = readFileSync(target, "utf8");
  const output = input.offset === undefined && input.limit === undefined
    ? content
    : content.split("\n").slice(Number(input.offset || 0), Number(input.offset || 0) + Math.min(Number(input.limit || 500), 2000)).join("\n");
  reporter?.progress(`已读取 ${output.split("\n").length} 行`, target, "count");
  reporter?.output(output.split("\n").slice(0, 20).join("\n"), "preview");
  return output;
}

function searchFiles(root: string, permission: string, input: AnyRecord, reporter?: ToolTraceReporter) {
  const pattern = String(input.pattern ?? "");
  if (!pattern) throw new AppError("UNKNOWN_ERROR", "search 缺少 pattern");
  const base = resolvePath(root, input.path || ".");
  ensureReadPath(root, base, permission, "搜索");
  reporter?.progress("正在搜索", `${pattern} · ${base}`, "stage");
  const matches: string[] = [];
  walk(base, (filePath) => {
    if (matches.length >= 80 || !statSync(filePath).isFile()) return;
    const rel = path.relative(root, filePath);
    if (input.glob && !wildcardMatch(rel, input.glob)) return;
    let content = "";
    try { content = readFileSync(filePath, "utf8"); } catch { return; }
    content.split("\n").forEach((line, index) => {
      if (matches.length < 80 && line.includes(pattern)) matches.push(`${rel}:${index + 1}:${line.trim()}`);
    });
  });
  reporter?.progress(`已命中 ${matches.length} 条`, pattern, "count");
  reporter?.output(matches.slice(0, 20).join("\n") || "未找到匹配内容", "preview");
  return matches.length ? matches.join("\n") : "未找到匹配内容";
}

function globFiles(root: string, permission: string, input: AnyRecord, reporter?: ToolTraceReporter) {
  const pattern = String(input.pattern ?? "");
  const base = resolvePath(root, input.path || ".");
  ensureReadPath(root, base, permission, "匹配");
  reporter?.progress("正在匹配文件", `${pattern} · ${base}`, "stage");
  const matches: string[] = [];
  walk(base, (filePath) => {
    const rel = path.relative(root, filePath);
    if (wildcardMatch(rel, pattern)) matches.push(rel);
  });
  const output = matches.slice(0, 500).sort();
  reporter?.progress(`已匹配 ${output.length} 个文件`, pattern, "count");
  reporter?.output(output.slice(0, 20).join("\n"), "preview");
  return output.join("\n");
}

function writeTextFile(root: string, permission: string, input: AnyRecord, reporter?: ToolTraceReporter) {
  ensureWritePath(root, resolvePath(root, input.path), permission);
  const target = resolvePath(root, input.path);
  reporter?.progress("正在写入文件", target, "path");
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, String(input.content ?? ""));
  reporter?.progress("文件写入完成", target, "stage");
  return `written=${target}`;
}

function editTextFile(root: string, permission: string, input: AnyRecord, reporter?: ToolTraceReporter) {
  const target = resolvePath(root, input.path);
  ensureWritePath(root, target, permission);
  reporter?.progress("正在编辑文件", target, "path");
  const oldString = String(input.oldString ?? input.old_string ?? "");
  const newString = String(input.newString ?? input.new_string ?? "");
  const content = readFileSync(target, "utf8");
  const occurrences = content.split(oldString).length - 1;
  if (!oldString || occurrences <= 0) throw new AppError("UNKNOWN_ERROR", "edit_file 未找到待替换内容");
  const edited = input.replaceAll || input.replace_all ? content.split(oldString).join(newString) : content.replace(oldString, newString);
  writeFileSync(target, edited);
  reporter?.progress(`已替换 ${input.replaceAll || input.replace_all ? occurrences : 1} 处`, target, "count");
  return `edited=${target}; occurrences=${input.replaceAll || input.replace_all ? occurrences : 1}`;
}

async function shellCommand(root: string, command: string, reporter?: ToolTraceReporter, signal?: AbortSignal) {
  if (dangerousCommand(command)) throw new AppError("PERMISSION_DENIED", "拒绝执行危险 shell 命令");
  reporter?.progress("正在运行 shell 命令", command, "stage");
  const result = await runStreamedCommand({
    command,
    cwd: root,
    timeoutMs: 120_000,
    signal,
    onOutput: (delta, stream) => reporter?.output(delta, stream),
  });
  if (result.exitCode !== 0) throw new AppError("UNKNOWN_ERROR", "Shell 命令返回失败", result.stderr || result.output);
  return result.output;
}

function resolvePath(root: string, value: string) {
  if (!value) throw new AppError("UNKNOWN_ERROR", "缺少 path");
  return path.isAbsolute(value) ? value : path.join(root, value);
}

function ensureReadPath(root: string, target: string, permission: string, verb: string) {
  if (permission !== "fullAccess" && !inside(root, target)) throw new AppError("PERMISSION_DENIED", `Read Only/Workspace Write 只能${verb}工作区内文件`);
}

function ensureWritePath(root: string, target: string, permission: string) {
  if (permission === "readOnly") throw new AppError("PERMISSION_DENIED", "Read Only 禁止写文件");
  const parent = existsSync(target) ? target : path.dirname(target);
  if (permission !== "fullAccess" && !inside(root, parent)) throw new AppError("PERMISSION_DENIED", "Workspace Write 只能写入工作区内文件");
}

function inside(root: string, target: string) {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(target);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}

function walk(dir: string, visit: (filePath: string) => void) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "target", "dist", "build", ".gradle"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else visit(full);
  }
}

function wildcardMatch(value: string, pattern: string) {
  if (!pattern || pattern === "*" || pattern === "**/*") return true;
  const regex = new RegExp(`^${pattern.split("").map((ch) => ch === "*" ? ".*" : ch === "?" ? "." : ch.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&")).join("")}$`);
  return regex.test(value);
}

function dangerousCommand(command: string) {
  const value = command.toLowerCase();
  return ["rm -rf", "git reset", "git clean", "push --force", "chmod -r", "sudo "].some((needle) => value.includes(needle));
}

function gitStatus(root: string, reporter?: ToolTraceReporter): GitStatus {
  reporter?.progress("正在读取 Git 状态", root, "stage");
  const branch = gitRun(root, ["rev-parse", "--abbrev-ref", "HEAD"], reporter);
  const raw = gitRun(root, ["status", "--short"], reporter);
  const entries = parseGitStatusEntries(raw);
  reporter?.progress(`Git 状态包含 ${entries.length} 个变更`, branch, "count");
  return { rootPath: root, branch, dirty: entries.length > 0, entries };
}

function gitDiff(root: string, staged = false, reporter?: ToolTraceReporter) {
  reporter?.progress(staged ? "正在读取 staged diff" : "正在读取 Git diff", root, "stage");
  return gitRun(root, staged ? ["diff", "--staged"] : ["diff"], reporter);
}

function gitStage(root: string, paths: string[], reporter?: ToolTraceReporter) {
  reporter?.progress(`正在暂存 ${paths.length} 个路径`, paths.join(", "), "count");
  gitRun(root, ["add", ...paths], reporter);
  return "已暂存选中文件";
}

function gitCommit(root: string, message: string, reporter?: ToolTraceReporter) {
  if (!message.trim()) throw new AppError("GIT_ERROR", "Commit message 不能为空");
  reporter?.progress("正在提交 Git commit", message.trim(), "stage");
  return gitRun(root, ["commit", "-m", message.trim()], reporter);
}

interface GitCommitMessageContext {
  status: GitStatus;
  stagedDiff: string;
  unstagedDiff: string;
  untrackedSummaries: string[];
}

async function generateGitCommitMessage(root: string) {
  const context = buildGitCommitMessageContext(root);
  if (context.status.entries.length === 0) {
    throw new AppError("GIT_ERROR", "当前没有可生成 commit message 的变更");
  }

  const fallback = fallbackCommitMessage(context);
  const selection = selectCommitMessageModel(root);
  if (!selection) return fallback;

  try {
    const model = createChatModel(selection.config, selection.model);
    const output = await model.invoke([
      new SystemMessage({
        content: "你负责生成简洁的中文 Conventional Commit message。只返回一行 commit message，不要引号、Markdown 或解释。",
      }),
      new HumanMessage({
        content: buildCommitMessagePrompt(context),
      }),
    ]);
    return sanitizeGeneratedCommitMessage(extractFinalContent(output)) || fallback;
  } catch {
    return fallback;
  }
}

function buildGitCommitMessageContext(root: string): GitCommitMessageContext {
  const status = gitStatus(root);
  const stagedDiff = gitDiff(root, true);
  const unstagedDiff = gitDiff(root, false);
  const untrackedSummaries = summarizeUntrackedFiles(root, status.entries.filter((entry) => entry.indexStatus === "?" || entry.worktreeStatus === "?"));
  return { status, stagedDiff, unstagedDiff, untrackedSummaries };
}

function summarizeUntrackedFiles(root: string, entries: GitStatus["entries"]) {
  return entries.slice(0, 6).map((entry) => {
    const target = resolvePath(root, entry.path);
    if (!inside(root, target) || !existsSync(target)) return `${entry.path}: unavailable`;
    const stat = statSync(target);
    if (stat.isDirectory()) return `${entry.path}: directory`;
    if (stat.size > 16 * 1024) return `${entry.path}: ${stat.size} bytes`;
    try {
      const content = readFileSync(target, "utf8");
      if (content.includes("\0")) return `${entry.path}: binary file`;
      return `${entry.path}:\n${truncateForPrompt(content, 2_000)}`;
    } catch {
      return `${entry.path}: unreadable`;
    }
  });
}

function buildCommitMessagePrompt(context: GitCommitMessageContext) {
  const changedFiles = context.status.entries
    .map((entry) => `${entry.indexStatus}${entry.worktreeStatus} ${entry.path}`)
    .join("\n");
  return [
    "使用中文生成一条 Conventional Commit message。",
    "类型前缀仍使用 feat、fix、docs、test、style、refactor、chore 等英文类型。",
    "冒号后的 subject 用中文，尽量简短，能概括这批变更即可。",
    "",
    "Changed files:",
    changedFiles,
    "",
    "Staged diff:",
    truncateForPrompt(context.stagedDiff || "(none)", 8_000),
    "",
    "Unstaged diff:",
    truncateForPrompt(context.unstagedDiff || "(none)", 12_000),
    "",
    "Untracked file summaries:",
    context.untrackedSummaries.length ? context.untrackedSummaries.join("\n\n") : "(none)",
  ].join("\n");
}

function selectCommitMessageModel(root: string): { config: ModelConfig; model: string } | undefined {
  const workspace = storage.listWorkspaces().find((item) => path.resolve(item.rootPath) === path.resolve(root));
  if (workspace) {
    const config = tryCall(() => storage.getModelConfig(workspace.defaultProviderId));
    if (config && usableCommitMessageModel(config)) {
      return { config, model: workspace.defaultModel || config.defaultModel };
    }
  }
  const config = storage.preferredModelConfig();
  return config ? { config, model: config.defaultModel } : undefined;
}

function usableCommitMessageModel(config: ModelConfig) {
  return config.providerKind !== "mock" && (config.providerKind === "ollama" || Boolean(config.hasApiKey || secrets.get(`ai-model-api-key-${config.id}`)));
}

function fallbackCommitMessage(context: GitCommitMessageContext) {
  const paths = context.status.entries.map((entry) => entry.path);
  const type = fallbackCommitType(context.status.entries);
  const subject = fallbackCommitSubject(paths, context.status.entries.some((entry) => entry.indexStatus === "?" || entry.worktreeStatus === "?"));
  return `${type}: ${subject}`;
}

function fallbackCommitType(entries: GitStatus["entries"]) {
  const paths = entries.map((entry) => entry.path.toLowerCase());
  if (paths.every((item) => item.endsWith(".md") || item.startsWith("docs/"))) return "docs";
  if (paths.every((item) => item.includes(".test.") || item.includes(".spec."))) return "test";
  if (paths.every((item) => item.endsWith(".css") || item.endsWith(".scss"))) return "style";
  if (entries.some((entry) => entry.indexStatus === "?" || entry.worktreeStatus === "?" || entry.indexStatus === "A")) return "feat";
  return "chore";
}

function fallbackCommitSubject(paths: string[], hasNewFiles: boolean) {
  const lower = paths.map((item) => item.toLowerCase());
  if (lower.some((item) => item.includes("rightpanel") || item.includes("gitservice"))) return "更新 Git 变更面板";
  if (lower.every((item) => item.startsWith("docs/"))) return "更新文档";
  if (lower.every((item) => item.includes(".test.") || item.includes(".spec."))) return "更新测试";
  if (lower.every((item) => item.endsWith(".css") || item.endsWith(".scss"))) return "更新样式";
  if (paths.length === 1) {
    const name = path.basename(paths[0]).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
    return `${hasNewFiles ? "新增" : "更新"}${name || "工作区变更"}`;
  }
  const firstDir = paths[0]?.includes("/") ? paths[0].split("/")[0] : "";
  return `${hasNewFiles ? "新增" : "更新"}${firstDir || "工作区"}变更`;
}

function sanitizeGeneratedCommitMessage(content: string) {
  const firstLine = content
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-z]*|```/gi, ""))
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "";
  const cleaned = firstLine
    .replace(/^commit message\s*:\s*/i, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^["'`]+|["'`.]+$/g, "")
    .trim();
  if (!cleaned) return "";
  const conventional = /^[a-z]+(?:\([^)]+\))?!?:\s+/.test(cleaned)
    ? cleaned
    : `chore: ${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}`;
  const limited = conventional.length <= 120 ? conventional : conventional.slice(0, 117).trimEnd();
  return containsChineseCommitSubject(limited) ? limited : "";
}

function containsChineseCommitSubject(message: string) {
  const subject = message.replace(/^[a-z]+(?:\([^)]+\))?!?:\s+/i, "");
  return /[\u3400-\u9fff]/.test(subject);
}

function truncateForPrompt(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n...<truncated>`;
}

function gitCheckout(root: string, branch: string, reporter?: ToolTraceReporter) {
  if (!branch.trim()) throw new AppError("GIT_ERROR", "分支名不能为空");
  reporter?.progress("正在切换分支", branch.trim(), "stage");
  return gitRun(root, ["checkout", branch.trim()], reporter);
}

function gitRun(root: string, args: string[], reporter?: ToolTraceReporter) {
  const git = settings.get().gitCommand || "git";
  reporter?.progress("正在执行 Git 命令", `git ${args.join(" ")}`, "stage");
  const result = spawnSync(git, ["-C", root, "-c", "core.quotepath=false", ...args], { encoding: "utf8" });
  if (result.stdout) reporter?.output(result.stdout, "stdout");
  if (result.stderr) reporter?.output(result.stderr, "stderr");
  if (result.status !== 0) throw new AppError("GIT_ERROR", "Git 命令返回失败", result.stderr.trim());
  return result.stdout.replace(/[\r\n]+$/, "");
}

function getProjectContext(projectPath: string): ProjectContext {
  if (!existsSync(projectPath)) throw new AppError("GIT_ERROR", "项目路径不存在");
  const application = findApplicationName(projectPath) || path.basename(projectPath).replace(/-(parent|service)$/i, "").toLowerCase();
  const branchName = gitRun(projectPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const gitUserName = tryCall(() => gitRun(projectPath, ["config", "user.name"]));
  const log = tryCall(() => gitRun(projectPath, ["log", "-n", "3", "--pretty=format:%s"])) || "";
  const reqNo = log.match(/REQ-\d+/)?.[0];
  const story = parseStory(log);
  return { projectPath, application, branchName, gitUserName, reqNo, story };
}

function findApplicationName(root: string): string | undefined {
  let found: string | undefined;
  walk(root, (filePath) => {
    if (found || path.basename(filePath) !== "application.properties") return;
    const value = readFileSync(filePath, "utf8").split("\n").find((line) => line.trim().startsWith("spring.application.name="));
    if (value) found = value.split("=").slice(1).join("=").trim();
  });
  if (found) return found;
  const pom = path.join(root, "pom.xml");
  if (existsSync(pom)) return readFileSync(pom, "utf8").match(/<artifactId>([^<]+)<\/artifactId>/)?.[1]?.replace(/-(parent|service)$/i, "").toLowerCase();
  return undefined;
}

function parseStory(log: string) {
  const line = log.split("\n").find((entry) => entry.includes("REQ-"));
  if (!line) return undefined;
  return line.split(":").slice(1).join(":").trim().replace(/^["']|["']$/g, "") || undefined;
}

function discoverIdeaProjectTasks(): IdeaProjectTask[] {
  const projects = recentIdeaProjects();
  return projects.slice(0, 20).map((project, index) => {
    const context = tryCall(() => getProjectContext(project.projectPath));
    return {
      id: project.projectPath,
      label: [context?.application || project.projectName, context?.branchName, context?.reqNo].filter(Boolean).join(" · "),
      projectPath: project.projectPath,
      application: context?.application || project.projectName,
      branchName: context?.branchName || "",
      gitUserName: context?.gitUserName,
      reqNo: context?.reqNo,
      reqName: context?.reqName,
      story: context?.story,
      active: index === 0,
      windowTitle: project.frameTitle,
      updatedAt: project.activationTimestamp,
    };
  });
}

function recentIdeaProjects() {
  const jetbrains = path.join(homedir(), "Library/Application Support/JetBrains");
  if (!existsSync(jetbrains)) return [];
  const projects: Array<{ projectPath: string; projectName: string; frameTitle?: string; activationTimestamp: number }> = [];
  for (const dir of readdirSync(jetbrains, { withFileTypes: true })) {
    if (!dir.isDirectory() || (!dir.name.startsWith("IntelliJIdea") && !dir.name.startsWith("IdeaIC"))) continue;
    const file = path.join(jetbrains, dir.name, "options/recentProjects.xml");
    if (!existsSync(file)) continue;
    const xml = readFileSync(file, "utf8");
    for (const match of xml.matchAll(/<entry key="([^"]+)"[\s\S]*?<RecentProjectMetaInfo([^>]*)/g)) {
      const projectPath = match[1].replaceAll("$USER_HOME$", homedir()).replace(/^~/, homedir());
      const frameTitle = match[2].match(/frameTitle="([^"]+)"/)?.[1];
      const activationTimestamp = Number(match[0].match(/activationTimestamp" value="(\d+)"/)?.[1] ?? 0);
      projects.push({ projectPath, projectName: path.basename(projectPath), frameTitle, activationTimestamp });
    }
  }
  return [...new Map(projects.sort((a, b) => b.activationTimestamp - a.activationTimestamp).map((item) => [item.projectPath, item])).values()];
}

async function fetchJson(url: string, init: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) throw new AppError("NETWORK_ERROR", "接口请求失败", `${response.status}: ${text}`);
  return jsonParse(text, {});
}

function mcpReload() {
  return Promise.all(storage.listMcpServers().filter((server) => server.enabled).map(async (server) => ({
    id: server.id,
    name: server.name,
    transport: server.transport,
    ok: (await mcpListTools(server).catch(() => undefined)) !== undefined,
  })));
}

async function mcpListTools(server: McpServerConfig): Promise<Array<{ name: string; description?: string }>> {
  const result = await mcpJsonRpc(server, "tools/list", {});
  return result.tools ?? [];
}

async function mcpCall(serverId: string, toolName: string, input: AnyRecord, reporter?: ToolTraceReporter) {
  const server = storage.getMcpServer(serverId);
  reporter?.progress("已发送 MCP 请求", `${serverId}.${toolName}`, "stage");
  reporter?.progress("等待 MCP 响应", `${serverId}.${toolName}`, "stage");
  const result = await mcpJsonRpc(server, "tools/call", { name: toolName, arguments: input });
  reporter?.output(truncateToolOutput(JSON.stringify(result, null, 2), 8 * 1024), "preview");
  return result;
}

function mcpJsonRpc(server: McpServerConfig, method: string, params: AnyRecord): Promise<any> {
  if (server.transport !== "stdio") throw new AppError("UNKNOWN_ERROR", "HTTP MCP 将在后续版本启用");
  const command = jsonParse<string[]>(server.commandJson, []);
  if (!command.length) throw new AppError("UNKNOWN_ERROR", "stdio MCP 缺少 command");
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ...jsonParse(server.envJson, {}) } });
    const timer = setTimeout(() => {
      child.kill();
      reject(new AppError("UNKNOWN_ERROR", "MCP stdio 调用超时"));
    }, 20_000);
    let buffer = "";
    const send = (value: AnyRecord) => child.stdin.write(`${JSON.stringify(value)}\n`);
    const responses = new Map<number, (value: any) => void>();
    responses.set(1, () => {
      send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
      responses.set(2, (value) => {
        clearTimeout(timer);
        child.kill();
        resolve(value.result ?? value);
      });
      send({ jsonrpc: "2.0", id: 2, method, params });
    });
    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      for (;;) {
        const index = buffer.indexOf("\n");
        if (index < 0) break;
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        const value = jsonParse<any>(line, undefined);
        if (value?.error) {
          clearTimeout(timer);
          child.kill();
          reject(new AppError("UNKNOWN_ERROR", "MCP tool 调用失败", JSON.stringify(value.error)));
          return;
        }
        responses.get(value?.id)?.(value);
      }
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new AppError("UNKNOWN_ERROR", "MCP server 启动失败", error.message));
    });
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "Any Jumper Desktop", version: "0.1.0" } } });
  });
}

function extractContent(chunk: any): string {
  return extractModelOutputParts(chunk).content;
}

function extractFinalOutputParts(output: any): { content: string; reasoning: string } & {
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number; cacheCreation?: number; cacheRead?: number };
} {
  // Helper to extract usage from a LangChain AIMessage-like object
  function extractUsage(obj: any): ReturnType<typeof extractFinalOutputParts>["usage"] | undefined {
    const meta = obj?.usage_metadata;
    if (meta && typeof meta.input_tokens === "number") {
      return {
        inputTokens: meta.input_tokens,
        outputTokens: meta.output_tokens,
        totalTokens: meta.total_tokens,
        cacheCreation: meta.input_token_details?.cache_creation,
        cacheRead: meta.input_token_details?.cache_read,
      };
    }
    return undefined;
  }

  // Try direct usage_metadata on output itself (e.g. AIMessage as top-level output)
  const directUsage = extractUsage(output);
  if (directUsage) return { ...extractModelOutputParts(output), usage: directUsage };

  // Try searching output.messages for the last AI message
  const messages = output?.messages;
  if (Array.isArray(messages)) {
    for (const message of [...messages].reverse()) {
      const type = message?._getType?.() ?? message?.type ?? message?.role;
      if (type === "ai" || type === "assistant") {
        const parts = extractModelOutputParts(message);
        const usage = extractUsage(message);
        if (parts.content || parts.reasoning || usage) return { ...parts, usage };
      }
    }
  }
  return { content: "", reasoning: "" };
}

function extractFinalContent(output: any): string {
  return extractFinalOutputParts(output).content;
}

function emitTodos(ctx: RuntimeContext, value: any) {
  const todos = Array.isArray(value) ? value : Array.isArray(value?.todos) ? value.todos : Array.isArray(value?.items) ? value.items : [];
  if (!todos.length) return;
  emitAgentEvent({
    event: "task.updated",
    threadId: ctx.thread.id,
    turnId: ctx.turn.id,
    payload: { items: todos.map((todo: any, index: number) => ({ id: String(todo.id ?? `todo-${index + 1}`), content: String(todo.content ?? todo.todo ?? todo.title ?? todo), status: normalizeTodoStatus(todo.status) })) },
  });
}

function normalizeTodoStatus(status: unknown) {
  const value = String(status ?? "pending").toLowerCase();
  if (value.includes("done") || value.includes("complete")) return "completed";
  if (value.includes("progress") || value.includes("running")) return "running";
  return "pending";
}

function normalizeProgressNoteStatus(status: unknown): ProgressNote["status"] {
  const value = String(status ?? "completed").toLowerCase();
  if (value.includes("running") || value.includes("progress") || value.includes("start")) return "running";
  return "completed";
}

function stringify(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function approvalSummary(name: string, input: AnyRecord) {
  if (name === "shell") return `运行 shell 命令：${input.command}`;
  return `调用工具 ${name}: ${JSON.stringify(input)}`;
}

function safeToolName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "tool";
}

function tryCall<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

const EXCLUDED_DIRS = new Set(["node_modules", ".git", ".svn", "__pycache__", ".DS_Store", ".idea", ".vscode"]);
const MAX_DIR_ENTRIES = 500;

interface DirEntry {
  path: string;
  name: string;
  type: "file" | "directory";
  hasChildren?: boolean;
}

function listDirectory(dirPath: string): DirEntry[] {
  if (!existsSync(dirPath)) throw new AppError("FILE_NOT_FOUND", `目录不存在：${dirPath}`);
  const names = readdirSync(dirPath);
  const entries: DirEntry[] = [];
  for (const name of names) {
    if (name.startsWith(".") || EXCLUDED_DIRS.has(name)) continue;
    const fullPath = path.join(dirPath, name);
    try {
      const st = statSync(fullPath);
      const entry: DirEntry = {
        path: fullPath,
        name,
        type: st.isDirectory() ? "directory" : "file",
      };
      if (st.isDirectory()) {
        try {
          const children = readdirSync(fullPath).filter(
            (c) => !c.startsWith(".") && !EXCLUDED_DIRS.has(c),
          );
          entry.hasChildren = children.length > 0;
        } catch {
          entry.hasChildren = false;
        }
      }
      entries.push(entry);
      if (entries.length >= MAX_DIR_ENTRIES) break;
    } catch {
      // Skip entries that can't be stat'd
    }
  }
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

function resizeCurrentWindowByWidthDelta(event: Electron.IpcMainInvokeEvent, delta: unknown) {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || typeof delta !== "number" || !Number.isFinite(delta) || Math.abs(delta) < 1) return;
  const [width, height] = win.getSize();
  const [minWidth] = win.getMinimumSize();
  win.setSize(Math.max(minWidth, width + Math.round(delta)), height, false);
}

function registerIpcHandlers() {
  ipcMain.handle("any-jumper:pick-directory", async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const result = owner
      ? await dialog.showOpenDialog(owner, { properties: ["openDirectory"] })
      : await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  const pickFiles = async (event?: Electron.IpcMainInvokeEvent) => {
    const owner = event ? BrowserWindow.fromWebContents(event.sender) : null;
    const options: Electron.OpenDialogOptions = {
      buttonLabel: "添加文件",
      properties: ["openFile", "multiSelections"],
    };
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? [] : result.filePaths;
  };
  ipcMain.handle("any-jumper:pick-files", pickFiles);
  ipcMain.handle("any-jumper:invoke", async (_event, command: string, args: AnyRecord = {}) => {
    try {
      switch (command) {
        case "pick_files": return pickFiles(_event);
        case "workspace_list": return storage.listWorkspaces();
        case "workspace_create": return storage.createWorkspace(args.request);
        case "workspace_update": return storage.updateWorkspace(args.id, args.request);
        case "workspace_delete": return storage.deleteWorkspace(args.id);
        case "workspace_open_window": return createWindow(args.workspaceId, args.threadId);
        case "window_resize_by_width_delta": return resizeCurrentWindowByWidthDelta(_event, args.delta);
        case "model_provider_list": return storage.listModelConfigs();
        case "model_provider_save": {
          const config = storage.saveModelConfig(args.request);
          if (args.request?.apiKey !== undefined) secrets.set(`ai-model-api-key-${config.id}`, args.request.apiKey);
          if (config.providerKind !== "mock" && (config.providerKind === "ollama" || args.request?.apiKey !== undefined || secrets.get(`ai-model-api-key-${config.id}`))) {
            storage.activateModelConfig(config.id);
          }
          return config;
        }
        case "model_provider_delete": {
          storage.deleteModelConfig(args.id);
          secrets.set(`ai-model-api-key-${args.id}`, "");
          return undefined;
        }
        case "model_provider_test": {
          const config = storage.getModelConfig(args.id);
          validateModelProvider(config);
          if (config.providerKind !== "mock" && config.providerKind !== "ollama" && !secrets.get(`ai-model-api-key-${config.id}`)) {
            throw new AppError("TOKEN_MISSING", `请先为 ${config.displayName} 配置 API Key`);
          }
          return `${config.displayName} 配置可用`;
        }
        case "model_provider_models": return discoverProviderModels(args.id);
        case "agent_runtime_list": return storage.listAgentRuntimes();
        case "agent_runtime_save": return storage.saveAgentRuntime(args.request);
        case "agent_runtime_test": {
          if (args.id !== DEEPAGENTS_RUNTIME_ID) throw new AppError("UNSUPPORTED_RUNTIME", "仅支持 DeepAgents Runtime");
          return "DeepAgents Runtime OK（Electron 内嵌官方 createDeepAgent）";
        }
        case "thread_create": return storage.createThread(args.request);
        case "thread_list": return storage.listThreads(args.workspaceId);
        case "thread_read": return storage.readThread(args.threadId);
        case "thread_fork": return storage.forkThread(args.threadId, args.itemId);
        case "thread_archive": return storage.archiveThread(args.threadId);
        case "thread_name_set": return storage.setThreadName(args.threadId, args.title);
        case "turn_start": return appRuntime.startTurn(args.request);
        case "turn_enqueue": return appRuntime.enqueueTurn(args.request);
        case "turn_steer": return appRuntime.steerTurn(args.threadId, args.input);
        case "turn_interrupt": return appRuntime.interruptTurn(args.threadId);
        case "turn_retry": return appRuntime.retryTurn(args.threadId, args.request);
        case "turn_edit_and_rerun": return appRuntime.editAndRerun(args.itemId, args.content, args.request);
        case "approval_resolve": return appRuntime.toolService.resolveApproval(args.approvalId, args.decision);
        case "tool_call_cancel": return storage.completeToolCall(args.toolCallId, "cancelled", "用户取消");
        case "mcp_list": return storage.listMcpServers();
        case "mcp_save": return storage.saveMcpServer(args.request);
        case "mcp_reload": return mcpReload();
        case "mcp_call": return mcpCall(args.request.serverId, args.request.toolName, args.request.input);
        case "skill_list": return skillList(args.workspaceId);
        case "skill_read": return skillRead(args.path);
        case "plugin_list": return pluginList();
        case "plugin_install": return pluginInstall(args.request.source);
        case "plugin_enable": return storage.setPluginEnabled(args.id, args.enabled);
        case "git_status": return gitStatus(args.rootPath);
        case "git_diff": return gitDiff(args.rootPath, args.staged);
        case "git_stage": return gitStage(args.rootPath, args.paths);
        case "git_commit": return gitCommit(args.rootPath, args.message);
        case "git_generate_commit_message": return generateGitCommitMessage(args.rootPath);
        case "git_checkout": return gitCheckout(args.rootPath, args.branch);
        case "git_pull": return gitRun(args.rootPath, ["pull", "--ff-only"]);
        case "git_push": return gitRun(args.rootPath, ["push"]);
        case "git_log": return gitRun(args.rootPath, ["log", "--oneline", "--decorate", "--max-count", String(args.limit ?? 20)]);
        case "git_revert_file": return gitRun(args.rootPath, ["checkout", "--", args.filePath]);
        case "read_file_content_at_ref": {
          const ref = (args.ref as string) || "HEAD";
          return gitRun(args.rootPath, ["show", `${ref}:${args.filePath}`]);
        }
        case "get_project_context": return getProjectContext(args.projectPath);
        case "list_idea_project_tasks": return discoverIdeaProjectTasks();
        case "get_settings": return settings.get();
        case "save_settings": {
          settings.save(args.settings);
          return registerGlobalShortcuts();
        }
        case "portal_shortcut_reregister": return registerGlobalShortcuts();
        case "portal_window_hide": return hidePortalWindow();
        case "portal_window_set_always_on_top": return setPortalWindowAlwaysOnTop(Boolean(args.pinned));
        case "portal_open_chat": return createWindow(args.workspaceId, args.threadId);
        case "open_external_url": return shell.openExternal(args.url);
        case "agent_bridge_status": return agentBridge.status();
        case "agent_bridge_restart": return agentBridge.restart();
        case "agent_bridge_clear_logs": {
          agentBridge.clearLogs();
          return agentBridge.status();
        }
        case "agent_bridge_rpc": return agentBridge.rpc(args.request);
        case "terminal_create": return terminalManager.create(args.cwd);
        case "terminal_write": return terminalManager.write(args.id, args.data);
        case "terminal_resize": return terminalManager.resize(args.id, args.cols, args.rows);
        case "terminal_kill": return terminalManager.kill(args.id);
        case "list_directory": return listDirectory(args.dirPath);
        case "read_file_content": {
          if (!existsSync(args.filePath)) throw new AppError("FILE_NOT_FOUND", `文件不存在：${args.filePath}`);
          return readFileSync(args.filePath, "utf8");
        }
        case "read_file_base64": {
          if (!existsSync(args.filePath)) throw new AppError("FILE_NOT_FOUND", `文件不存在：${args.filePath}`);
          const buf = readFileSync(args.filePath);
          const ext = path.extname(args.filePath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".svg": "image/svg+xml",
            ".bmp": "image/bmp",
            ".ico": "image/x-icon",
          };
          const mime = mimeTypes[ext] || "application/octet-stream";
          return `data:${mime};base64,${buf.toString("base64")}`;
        }
        case "get_file_info": {
          if (!existsSync(args.filePath)) throw new AppError("FILE_NOT_FOUND", `文件不存在：${args.filePath}`);
          const st = statSync(args.filePath);
          return {
            path: args.filePath,
            name: path.basename(args.filePath),
            type: st.isDirectory() ? "directory" : "file",
            size: st.size,
            modifiedAt: st.mtimeMs,
          };
        }
        default: throw new AppError("UNKNOWN_ERROR", `未知命令：${command}`);
      }
    } catch (error) {
      throw new Error(`ANY_JUMPER_ERROR:${JSON.stringify(normalizeError(error))}`);
    }
  });
}

function createWindow(workspaceId?: string, threadId?: string) {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 720,
    title: "Any Jumper Desktop",
    frame: false,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 20 },
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    webPreferences: {
      preload: path.join(mainDir, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  windows.add(win);
  mainWindows.add(win);
  win.on("minimize" as any, (event: { preventDefault(): void }) => {
    event.preventDefault();
    win.hide();
  });
  win.on("closed", () => {
    windows.delete(win);
    mainWindows.delete(win);
  });
  const query = new URLSearchParams();
  if (workspaceId) query.set("workspaceId", workspaceId);
  if (threadId) query.set("threadId", threadId);
  if (process.env.VITE_DEV_SERVER_URL || !app.isPackaged) {
    void win.loadURL(`${DEV_URL}${query.size ? `?${query}` : ""}`);
  } else {
    void win.loadFile(path.join(mainDir, "../dist/index.html"), { query: Object.fromEntries(query) });
  }
}

function applyPortalWindowPin(win: BrowserWindow, pinned: boolean) {
  if (process.platform === "darwin") {
    win.setAlwaysOnTop(pinned, pinned ? "screen-saver" : "normal");
    win.setVisibleOnAllWorkspaces(pinned, { visibleOnFullScreen: pinned });
  } else {
    win.setAlwaysOnTop(pinned);
  }
  if (pinned) win.moveTop();
}

function createPortalWindow() {
  if (portalWindow && !portalWindow.isDestroyed()) return portalWindow;

  const win = new BrowserWindow({
    width: 720,
    height: 360,
    minWidth: 560,
    minHeight: 220,
    title: "Any Jumper Portal",
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    alwaysOnTop: portalWindowPinned,
    skipTaskbar: true,
    resizable: true,
    movable: true,
    show: false,
    webPreferences: {
      preload: path.join(mainDir, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  portalWindow = win;
  applyPortalWindowPin(win, portalWindowPinned);
  windows.add(win);
  win.on("closed", () => {
    windows.delete(win);
    if (portalWindow === win) portalWindow = undefined;
  });

  const query = new URLSearchParams();
  query.set("portal", "capsule");
  if (process.env.VITE_DEV_SERVER_URL || !app.isPackaged) {
    void win.loadURL(`${DEV_URL}?${query}`);
  } else {
    void win.loadFile(path.join(mainDir, "../dist/index.html"), { query: Object.fromEntries(query) });
  }
  return win;
}

function showPortalWindow() {
  const win = portalWindow && !portalWindow.isDestroyed()
    ? portalWindow
    : createPortalWindow();
  if (win.isVisible() && win.isFocused()) {
    win.hide();
    return;
  }
  win.center();
  activatingPortalWindow = true;
  win.show();
  if (portalWindowPinned) {
    win.setAlwaysOnTop(true, "screen-saver");
    win.moveTop();
  }
  win.focus();
  setTimeout(() => {
    activatingPortalWindow = false;
  }, 250);
}

function hidePortalWindow() {
  if (portalWindow && !portalWindow.isDestroyed()) {
    portalWindow.hide();
  }
}

function setPortalWindowAlwaysOnTop(pinned: boolean) {
  portalWindowPinned = pinned;
  if (portalWindow && !portalWindow.isDestroyed()) {
    applyPortalWindowPin(portalWindow, pinned);
  }
  return pinned;
}

function findMainWindow() {
  return Array.from(mainWindows).find((win) => !win.isDestroyed());
}

function focusMainWindow() {
  const win = findMainWindow();
  if (!win) return false;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return true;
}

function toggleMainWindow() {
  const visibleMainWindows = Array.from(mainWindows)
    .filter((win) => !win.isDestroyed() && win.isVisible());
  if (visibleMainWindows.length > 0) {
    for (const win of visibleMainWindows) win.hide();
    return;
  }
  if (!focusMainWindow()) createWindow();
}

function shouldSkipMainActivation() {
  return activatingPortalWindow ||
    Boolean(portalWindow && !portalWindow.isDestroyed() && portalWindow.isFocused());
}

if (gotSingleInstanceLock) {
  app.on("second-instance", () => {
    if (!focusMainWindow()) createWindow();
  });
}

if (gotSingleInstanceLock) app.whenReady().then(() => {
  storage = new StorageService(app.getPath("userData"));
  secrets = new SecretService(app.getPath("userData"));
  settings = new SettingsService(app.getPath("userData"));
  appRuntime = new AgentRuntimeService();
  terminalManager = new TerminalManager();
  agentBridge = new AgentBridgeService({
    onStatusChange: (status) => emitAgentBridgeEvent(status),
  });
  void agentBridge.start().catch((error) => {
    agentBridge.addLog("error", "Agent Bridge 服务启动失败", error instanceof Error ? error.message : String(error));
  });
  registerIpcHandlers();
  registerGlobalShortcuts();
  createWindow();
  app.on("activate", () => {
    if (shouldSkipMainActivation()) return;
    if (!focusMainWindow()) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  void agentBridge?.stop();
});
