import type {
  AgentEvent,
  AgentBridgeRpcResponse,
  AgentBridgeStatus,
  AgentRuntimeConfig,
  AgentRuntimeConfigRequest,
  AgentThread,
  AppSettings,
  Approval,
  GitStatus,
  IdeaProjectTask,
  McpServerConfig,
  McpServerRequest,
  ModelConfig,
  ModelConfigRequest,
  PluginSummary,
  ProjectContext,
  SkillSummary,
  ThreadCreateRequest,
  ThreadDetail,
  TurnStartRequest,
  Workspace,
  WorkspaceRequest,
} from "../types";

function bridge() {
  if (!window.anyJumper) {
    throw new Error("Electron bridge 未初始化，请在桌面应用中运行");
  }
  return window.anyJumper;
}

function invoke<T>(command: string, args?: Record<string, unknown>) {
  return bridge().invoke<T>(command, args);
}

export const desktopApi = {
  onAgentEvent(handler: (event: AgentEvent) => void) {
    const unsubscribe = bridge().onAgentEvent((event) => handler(event as AgentEvent));
    return Promise.resolve(unsubscribe);
  },
  onAgentBridgeEvent(handler: (status: AgentBridgeStatus) => void) {
    const api = bridge();
    if (!api.onAgentBridgeEvent) return Promise.resolve(() => undefined);
    const unsubscribe = api.onAgentBridgeEvent((event) => handler(event as AgentBridgeStatus));
    return Promise.resolve(unsubscribe);
  },
  pickDirectory() {
    return bridge().pickDirectory();
  },
  pickFiles() {
    const api = bridge();
    return api.pickFiles ? api.pickFiles() : invoke<string[]>("pick_files");
  },
  workspaceList() {
    return invoke<Workspace[]>("workspace_list");
  },
  workspaceCreate(request: WorkspaceRequest) {
    return invoke<Workspace>("workspace_create", { request });
  },
  workspaceUpdate(id: string, request: WorkspaceRequest) {
    return invoke<Workspace>("workspace_update", { id, request });
  },
  workspaceDelete(id: string) {
    return invoke<void>("workspace_delete", { id });
  },
  workspaceOpenWindow(workspaceId?: string, threadId?: string) {
    return invoke<void>("workspace_open_window", { workspaceId, threadId });
  },
  modelProviderList() {
    return invoke<ModelConfig[]>("model_provider_list");
  },
  modelProviderSave(request: ModelConfigRequest) {
    return invoke<ModelConfig>("model_provider_save", { request });
  },
  modelProviderDelete(id: string) {
    return invoke<void>("model_provider_delete", { id });
  },
  modelProviderTest(id: string) {
    return invoke<string>("model_provider_test", { id });
  },
  modelProviderModels(id: string) {
    return invoke<string[]>("model_provider_models", { id });
  },
  agentRuntimeList() {
    return invoke<AgentRuntimeConfig[]>("agent_runtime_list");
  },
  agentRuntimeSave(request: AgentRuntimeConfigRequest) {
    return invoke<AgentRuntimeConfig>("agent_runtime_save", { request });
  },
  agentRuntimeTest(id: string) {
    return invoke<string>("agent_runtime_test", { id });
  },
  threadCreate(request: ThreadCreateRequest) {
    return invoke<AgentThread>("thread_create", { request });
  },
  threadList(workspaceId?: string) {
    return invoke<AgentThread[]>("thread_list", { workspaceId });
  },
  threadRead(threadId: string) {
    return invoke<ThreadDetail>("thread_read", { threadId });
  },
  threadFork(threadId: string, itemId?: string) {
    return invoke<AgentThread>("thread_fork", { threadId, itemId });
  },
  threadArchive(threadId: string) {
    return invoke<void>("thread_archive", { threadId });
  },
  threadNameSet(threadId: string, title: string) {
    return invoke<AgentThread>("thread_name_set", { threadId, title });
  },
  turnStart(request: TurnStartRequest) {
    return invoke<ThreadDetail>("turn_start", { request });
  },
  turnEnqueue(request: TurnStartRequest) {
    return invoke<ThreadDetail>("turn_enqueue", { request });
  },
  turnSteer(threadId: string, input: string) {
    return invoke<ThreadDetail>("turn_steer", { threadId, input });
  },
  turnInterrupt(threadId: string) {
    return invoke<ThreadDetail>("turn_interrupt", { threadId });
  },
  turnRetry(threadId: string, request?: Omit<TurnStartRequest, "threadId" | "input">) {
    return invoke<ThreadDetail>("turn_retry", { threadId, request });
  },
  turnEditAndRerun(itemId: string, content: string, request?: Omit<TurnStartRequest, "threadId" | "input">) {
    return invoke<ThreadDetail>("turn_edit_and_rerun", { itemId, content, request });
  },
  approvalResolve(approvalId: string, decision: string) {
    return invoke<Approval>("approval_resolve", { approvalId, decision });
  },
  toolCallCancel(toolCallId: string) {
    return invoke<void>("tool_call_cancel", { toolCallId });
  },
  mcpList() {
    return invoke<McpServerConfig[]>("mcp_list");
  },
  mcpSave(request: McpServerRequest) {
    return invoke<McpServerConfig>("mcp_save", { request });
  },
  mcpReload() {
    return invoke<unknown[]>("mcp_reload");
  },
  skillList(workspaceId?: string) {
    return invoke<SkillSummary[]>("skill_list", { workspaceId });
  },
  skillRead(path: string) {
    return invoke<string>("skill_read", { path });
  },
  pluginList() {
    return invoke<PluginSummary[]>("plugin_list");
  },
  pluginInstall(source: string) {
    return invoke<PluginSummary>("plugin_install", { request: { source } });
  },
  pluginEnable(id: string, enabled: boolean) {
    return invoke<void>("plugin_enable", { id, enabled });
  },
  gitStatus(rootPath: string) {
    return invoke<GitStatus>("git_status", { rootPath });
  },
  gitDiff(rootPath: string, staged = false) {
    return invoke<string>("git_diff", { rootPath, staged });
  },
  gitStage(rootPath: string, paths: string[]) {
    return invoke<string>("git_stage", { rootPath, paths });
  },
  gitCommit(rootPath: string, commitMessage: string) {
    return invoke<string>("git_commit", { rootPath, message: commitMessage });
  },
  gitCheckout(rootPath: string, branch: string) {
    return invoke<string>("git_checkout", { rootPath, branch });
  },
  gitPull(rootPath: string) {
    return invoke<string>("git_pull", { rootPath });
  },
  gitPush(rootPath: string) {
    return invoke<string>("git_push", { rootPath });
  },
  gitLog(rootPath: string, limit = 20) {
    return invoke<string>("git_log", { rootPath, limit });
  },
  gitRevertFile(rootPath: string, filePath: string) {
    return invoke<string>("git_revert_file", { rootPath, filePath });
  },
  readFileContentAtRef(rootPath: string, filePath: string, ref = "HEAD") {
    return invoke<string>("read_file_content_at_ref", { rootPath, filePath, ref });
  },
  getProjectContext(projectPath: string) {
    return invoke<ProjectContext>("get_project_context", { projectPath });
  },
  listIdeaProjectTasks() {
    return invoke<IdeaProjectTask[]>("list_idea_project_tasks");
  },
  getSettings() {
    return invoke<AppSettings>("get_settings");
  },
  saveSettings(settings: AppSettings) {
    return invoke<void>("save_settings", { settings });
  },
  openExternalUrl(url: string) {
    return invoke<void>("open_external_url", { url });
  },
  agentBridgeStatus() {
    return invoke<AgentBridgeStatus>("agent_bridge_status");
  },
  agentBridgeRestart() {
    return invoke<AgentBridgeStatus>("agent_bridge_restart");
  },
  agentBridgeClearLogs() {
    return invoke<AgentBridgeStatus>("agent_bridge_clear_logs");
  },
  agentBridgeRpc(method: string, params?: Record<string, unknown>) {
    return invoke<AgentBridgeRpcResponse>("agent_bridge_rpc", { request: { method, params } });
  },
  listDirectory(dirPath: string) {
    return invoke<{ path: string; name: string; type: "file" | "directory"; hasChildren?: boolean }[]>("list_directory", { dirPath });
  },
  readFileContent(filePath: string) {
    return invoke<string>("read_file_content", { filePath });
  },
  readFileBase64(filePath: string) {
    return invoke<string>("read_file_base64", { filePath });
  },
  getFileInfo(filePath: string) {
    return invoke<{ path: string; name: string; type: string; size: number; modifiedAt: number }>("get_file_info", { filePath });
  },
  terminalCreate(cwd?: string) {
    return invoke<string>("terminal_create", { cwd });
  },
  terminalWrite(id: string, data: string) {
    return invoke<void>("terminal_write", { id, data });
  },
  terminalResize(id: string, cols: number, rows: number) {
    return invoke<void>("terminal_resize", { id, cols, rows });
  },
  terminalKill(id: string) {
    return invoke<void>("terminal_kill", { id });
  },
  onTerminalData(handler: (event: { id: string; data: string }) => void) {
    const unsubscribe = bridge().onTerminalData((event) => handler(event as { id: string; data: string }));
    return Promise.resolve(unsubscribe);
  },
  onTerminalExit(handler: (event: { id: string }) => void) {
    const unsubscribe = bridge().onTerminalExit((event) => handler(event as { id: string }));
    return Promise.resolve(unsubscribe);
  },
};

export function errorMessage(error: unknown): string {
  const parsed = parseIpcError(error);
  if (parsed?.message) return parsed.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "操作失败";
}

export function errorDetail(error: unknown): string | undefined {
  const parsed = parseIpcError(error);
  if (parsed?.detail) return String(parsed.detail);
  if (error && typeof error === "object" && "detail" in error) {
    const detail = (error as { detail?: unknown }).detail;
    return detail ? String(detail) : undefined;
  }
  return undefined;
}

function parseIpcError(error: unknown): { message?: string; detail?: string } | undefined {
  const raw = typeof error === "string"
    ? error
    : error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  const marker = "ANY_JUMPER_ERROR:";
  const index = raw.indexOf(marker);
  if (index < 0) return undefined;
  const json = raw.slice(index + marker.length).trim();
  try {
    return JSON.parse(json) as { message?: string; detail?: string };
  } catch {
    return undefined;
  }
}
