import type { ReactNode } from "react";

export type ActivityStatus = "idle" | "running" | "success" | "error";

export type SubagentTaskStatus = "running" | "completed" | "failed";

export interface SubagentTask {
  id: string;
  title: string;
  agentType?: string;
  status: SubagentTaskStatus;
  summary?: string;
  createdAt: number;
  completedAt?: number;
}

export interface ActivityItem {
  id: string;
  title: string;
  detail?: string;
  status: ActivityStatus;
  timestamp: string;
}

export interface AppSettings {
  defaultProjectPath?: string;
  gitCommand: string;
  defaultNewSessionProviderId?: string;
  defaultNewSessionModel?: string;
  mainWindowShortcut?: string;
  portalShortcut?: string;
  portalDefaultWorkspaceId?: string;
  portalDefaultProviderId?: string;
  portalDefaultModel?: string;
  portalReasoningEffort?: string;
  selectionShortcut?: string;
  selectionDefaultWorkspaceId?: string;
  selectionDefaultProviderId?: string;
  selectionDefaultModel?: string;
  selectionReasoningEffort?: string;
  selectionActions?: SelectionAction[];
}

export interface ProjectContext {
  projectPath: string;
  application: string;
  branchName: string;
  gitUserName?: string;
  reqNo?: string;
  reqName?: string;
  story?: string;
}

export interface IdeaProjectTask extends ProjectContext {
  id: string;
  label: string;
  active: boolean;
  windowTitle?: string;
  updatedAt: number;
}

export interface AppError {
  code:
    | "TOKEN_MISSING"
    | "TOKEN_EXPIRED"
    | "GIT_ERROR"
    | "INVALID_BRANCH"
    | "NETWORK_ERROR"
    | "PERMISSION_DENIED"
    | "UNKNOWN_ERROR";
  message: string;
  detail?: string;
}

export interface ResultAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
}

export interface SelectionAction {
  id: string;
  label: string;
  description: string;
  promptTemplate: string;
  enabled: boolean;
  order: number;
}

export interface SelectionDefaults {
  shortcut: string;
  providerId?: string;
  model?: string;
  reasoningEffort: string;
  actions: SelectionAction[];
}

export interface SelectionRunRequest {
  actionId: string;
  selectedText: string;
  providerId?: string;
  model?: string;
  reasoningEffort?: string;
}

export interface SelectionRunResult {
  runId: string;
  status: "started";
}

export interface SelectionEvent {
  runId: string;
  event: "selection.started" | "selection.delta" | "selection.completed" | "selection.failed";
  payload?: unknown;
  createdAt: number;
}

export type PermissionMode = "readOnly" | "workspaceWrite" | "fullAccess";

export interface Workspace {
  id: string;
  name: string;
  rootPath: string;
  trustLevel: string;
  defaultRuntimeId: string;
  defaultProviderId: string;
  defaultModel: string;
  layoutJson?: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceRequest {
  name?: string;
  rootPath: string;
  trustLevel?: string;
  defaultRuntimeId?: string;
  defaultProviderId?: string;
  defaultModel?: string;
  layoutJson?: string;
}

export interface ModelConfig {
  id: string;
  providerKind: string;
  displayName: string;
  baseUrl: string;
  defaultModel: string;
  models?: string[];
  enabled: boolean;
  hasApiKey?: boolean;
  createdAt: number;
  updatedAt: number;
  apiKey?: string;
}

export interface ModelConfigRequest {
  id?: string;
  providerKind: string;
  displayName: string;
  baseUrl: string;
  defaultModel: string;
  models?: string[];
  enabled: boolean;
  apiKey?: string;
}

export interface AgentRuntimeConfig {
  id: string;
  runtimeKind: string;
  displayName: string;
  endpointUrl?: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AgentRuntimeConfigRequest {
  id?: string;
  runtimeKind: string;
  displayName: string;
  endpointUrl?: string;
  enabled: boolean;
}

export interface AgentThread {
  id: string;
  workspaceId: string;
  title: string;
  status: string;
  runtimeId: string;
  providerId: string;
  model: string;
  reasoningEffort?: string;
  permissionMode: PermissionMode | string;
  forkedFromId?: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ThreadCreateRequest {
  workspaceId: string;
  title?: string;
  runtimeId?: string;
  providerId?: string;
  model?: string;
  reasoningEffort?: string;
  permissionMode?: PermissionMode;
}

export interface TurnStartRequest {
  threadId: string;
  input: string;
  images?: ImageAttachment[];
  runtimeId?: string;
  providerId?: string;
  model?: string;
  reasoningEffort?: string;
  permissionMode?: PermissionMode;
}

export interface TurnTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheCreation?: number;
  cacheRead?: number;
}

export interface AgentTurn {
  id: string;
  threadId: string;
  status: string;
  runtimeId: string;
  providerId: string;
  model: string;
  reasoningEffort?: string;
  permissionMode: PermissionMode | string;
  startedAt: number;
  completedAt?: number;
  tokenUsage?: TurnTokenUsage;
}

export type UsageSource = "any_jumper" | "claude_code" | "codex_cli";

export interface NormalizedUsageEvent {
  id: string;
  source: UsageSource;
  providerKind?: string;
  providerId?: string;
  providerLabel?: string;
  model: string;
  modelLabel?: string;
  sessionId?: string;
  sessionTitle?: string;
  workspaceId?: string;
  workspaceName?: string;
  workspacePath?: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  occurredAt: number;
  rawJson?: unknown;
}

export interface UsageNormalizedTotals {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  freshInputTokens: number;
  realTotalTokens: number;
  cacheHitRate: number;
}

export interface UsageSummary extends UsageNormalizedTotals {
  eventCount: number;
  sessionCount: number;
  modelCount: number;
}

export interface UsageModelSummary extends UsageNormalizedTotals {
  source: UsageSource;
  providerKind?: string;
  providerId?: string;
  providerLabel?: string;
  model: string;
  modelLabel?: string;
  workspaceId?: string;
  workspaceName?: string;
  workspacePath?: string;
  sessionCount: number;
  eventCount: number;
}

export interface UsageSessionModelSummary extends UsageNormalizedTotals {
  source: UsageSource;
  providerKind?: string;
  providerId?: string;
  providerLabel?: string;
  model: string;
  modelLabel?: string;
  eventCount: number;
}

export interface UsageSessionSummary extends UsageNormalizedTotals {
  source: UsageSource;
  sessionId?: string;
  sessionTitle?: string;
  workspaceId?: string;
  workspaceName?: string;
  workspacePath?: string;
  providerKind?: string;
  providerId?: string;
  providerLabel?: string;
  primaryModel: string;
  modelCount: number;
  modelBreakdown: UsageSessionModelSummary[];
  eventCount: number;
  lastOccurredAt?: number;
}

export interface UsageSyncState {
  source: UsageSource;
  filePath: string;
  fileMtime: number;
  fileSize: number;
  lastSyncedAt: number;
  errorMessage?: string;
}

export interface UsageDashboardRequest {
  source?: UsageSource | "all";
  workspaceId?: string;
  model?: string;
  from?: number;
  to?: number;
  query?: string;
}

export interface UsageDashboardData {
  summary: UsageSummary;
  modelBreakdown: UsageModelSummary[];
  sessionBreakdown: UsageSessionSummary[];
  events: NormalizedUsageEvent[];
  syncState: UsageSyncState[];
}

export interface UsageSyncResult {
  importedCount: number;
  syncState: UsageSyncState[];
}

export type ThreadArchiveFilter = "active" | "archived" | "all";

export interface ImageAttachment {
  mimeType: string;
  data: string;
  name?: string;
}

export interface AgentItem {
  id: string;
  threadId: string;
  turnId?: string;
  role: "system" | "user" | "assistant" | string;
  itemType: string;
  content: string;
  reasoningContent?: string;
  status: string;
  toolCallId?: string;
  metadata?: Record<string, unknown>;
  images?: ImageAttachment[];
  hidden: boolean;
  createdAt: number;
}

export interface QueuedInput {
  id: string;
  threadId: string;
  input: string;
  images?: ImageAttachment[];
  runtimeId?: string;
  providerId?: string;
  model?: string;
  reasoningEffort?: string;
  permissionMode?: PermissionMode;
  createdAt: number;
}

export interface ToolCall {
  id: string;
  threadId: string;
  turnId?: string;
  name: string;
  status: string;
  inputJson: string;
  output?: string;
  requiresApproval: boolean;
  startedAt: number;
  completedAt?: number;
}

export type ToolTraceKind = "shell" | "git" | "file" | "search" | "mcp" | "task" | "other";

export type ToolTraceStatus =
  | "pending"
  | "running"
  | "waiting_approval"
  | "completed"
  | "error"
  | "cancelled"
  | "rejected";

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

export interface ProgressNote {
  id: string;
  threadId: string;
  turnId?: string;
  kind?: "progress" | "reasoning" | string;
  content: string;
  status: string;
  createdAt: number;
  completedAt?: number;
}

export interface Approval {
  id: string;
  threadId: string;
  toolCallId: string;
  toolName: string;
  summary: string;
  decision?: string;
  createdAt: number;
  resolvedAt?: number;
}

export interface ThreadDetail {
  thread: AgentThread;
  turns: AgentTurn[];
  items: AgentItem[];
  queue: QueuedInput[];
  toolCalls: ToolCall[];
  toolCallEvents: ToolCallEvent[];
  progressNotes: ProgressNote[];
  approvals: Approval[];
}

export interface AgentEvent {
  event: string;
  threadId: string;
  turnId?: string;
  itemId?: string;
  toolCallId?: string;
  payload: unknown;
  createdAt: number;
}

export type AgentBridgeLogLevel = "info" | "success" | "warning" | "error";

export interface AgentBridgeLogEntry {
  id: string;
  level: AgentBridgeLogLevel;
  message: string;
  detail?: string;
  createdAt: number;
}

export interface AgentBridgeStatus {
  listening: boolean;
  host: string;
  port: number;
  endpoint: string;
  extensionCount: number;
  requestCount: number;
  errorCount: number;
  lastConnectedAt?: number;
  lastHeartbeatAt?: number;
  lastError?: string;
  logs: AgentBridgeLogEntry[];
}

export interface AgentBridgeRpcRequest {
  id?: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface AgentBridgeRpcResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface GitStatusEntry {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
}

export interface GitStatus {
  rootPath: string;
  branch: string;
  dirty: boolean;
  entries: GitStatusEntry[];
}

export interface McpServerConfig {
  id: string;
  name: string;
  transport: string;
  commandJson?: string;
  url?: string;
  envJson?: string;
  headersJson?: string;
  timeout?: number;
  enabled: boolean;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface McpServerRequest {
  id?: string;
  name: string;
  transport: string;
  commandJson?: string;
  url?: string;
  envJson?: string;
  headersJson?: string;
  timeout?: number;
  enabled: boolean;
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  path: string;
  scope: string;
  enabled: boolean;
}

export interface PluginSummary {
  id: string;
  name: string;
  version?: string;
  description?: string;
  path: string;
  enabled: boolean;
}
