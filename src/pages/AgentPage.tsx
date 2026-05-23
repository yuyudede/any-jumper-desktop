import {
  Bot,
  Check,
  ChevronDown,
  Copy,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderTree,
  GitBranch,
  History,
  Info,
  KeyRound,
  Maximize2,
  MessageSquare,
  Moon,
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightOpen,
  PanelRightClose,
  Package,
  PauseCircle,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  Square,
  StopCircle,
  Sun,
  TerminalSquare,
  Trash2,
  Wrench,
  Archive,
} from "lucide-react";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from "react";
import { Badge } from "../components/ui/badge";
import { Button, type ButtonProps } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import RichComposer, { type RichComposerHandle } from "../components/RichComposer";
import { Textarea } from "../components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";
import {
  getCandidates,
  isSlashActive,
  parseSlashInput,
  registerBuiltinCommands,
  type SlashCommand,
} from "../lib/slash-commands";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { Message, MessageBody, MessageActions, MessageImageGrid } from "../components/message";
import { Conversation, ConversationScrollButton } from "../components/conversation";
import { ResizeHandle } from "../components/ResizeHandle";
import { PreviewPanel, type PreviewFile } from "../components/PreviewPanel";
import { RightPanel } from "../components/RightPanel";
import ModelPage from "./ModelPage";
import PluginPage from "./PluginPage";
import { ProjectPicker } from "../components/ProjectPicker";
import TerminalPanel from "../components/TerminalPanel";
import { desktopApi, errorDetail, errorMessage } from "../services/desktopApi";
import type {
  ActivityItem,
  AgentEvent,
  AgentBridgeStatus,
  AgentItem,
  AgentThread,
  AppSettings,
  Approval,
  ImageAttachment,
  ModelConfig,
  PermissionMode,
  SkillSummary,
  ThreadDetail,
  ToolCall,
  Workspace,
} from "../types";
import {
  reduceThinkingTraceByTurn,
  thinkingTraceSectionForTurn,
  type ThinkingTraceByTurn,
  type ThinkingTraceItem,
  type ThinkingTraceSection,
  type TurnTokenUsage,
} from "../utils/thinkingTrace";
import { formatTraceThoughtText } from "../utils/traceThoughtText";
import {
  buildToolTraceCardsForTurn,
  reduceToolTraceByTurn,
  type ToolTraceCardModel,
  type ToolTraceByTurn,
} from "../utils/toolTrace";
import { stripProgressChatter } from "../utils/progressChatter";
import {
  DEEPAGENTS_RUNTIME_ID,
  defaultModelForProvider,
  modelOptionsForProvider,
} from "../utils/modelProviders";
import { resolveNewSessionModelDefaults } from "../utils/newSessionDefaults";
import { displaySkillPrompt } from "../utils/skillPromptDisplay";
import type { ThemeMode } from "../main";

interface AgentPageProps {
  settings: AppSettings;
  themeMode: ThemeMode;
  pushActivity: (
    title: string,
    status?: ActivityItem["status"],
    detail?: string,
  ) => void;
  clearActivity: () => void;
  onToggleTheme?: () => void;
}

interface NoticeState {
  tone: "success" | "warning" | "danger" | "muted";
  title: string;
  detail?: string;
}

interface ConfirmAction {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

interface AgentComposerHandle {
  setComposer: (value: string) => void;
}

const permissionOptions = [
  { label: "默认权限", value: "readOnly" },
  { label: "自动审查", value: "workspaceWrite" },
  { label: "完全访问权限", value: "fullAccess" },
];

const SIDEBAR_EXPANDED_WORKSPACES_STORAGE_KEY = "any-jumper-sidebar-expanded-workspaces";
const PROJECT_TREE_COLLAPSED_STORAGE_KEY = "any-jumper-sidebar-project-tree-collapsed";
const TRACE_THOUGHT_VISIBLE_LIMIT = 24;
const RIGHT_PANEL_MIN_WIDTH = 220;
type ActiveMainView = "chat" | "bridge" | "modelConfig" | "plugin";

export default function AgentPage({
  settings,
  themeMode,
  pushActivity,
  clearActivity,
  onToggleTheme,
}: AgentPageProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [threadsByWorkspaceId, setThreadsByWorkspaceId] = useState<Record<string, AgentThread[]>>({});
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState(readStoredExpandedWorkspaceIds);
  const [projectTreeCollapsed, setProjectTreeCollapsed] = useState(readStoredProjectTreeCollapsed);
  const [threadId, setThreadId] = useState<string>();
  const [detail, setDetail] = useState<ThreadDetail>();
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("mock");
  const [selectedModel, setSelectedModel] = useState("mock-agent");
  const [permissionMode, setPermissionMode] = useState<PermissionMode>("workspaceWrite");
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace>();
  const [workspaceDraft, setWorkspaceDraft] = useState(settings.defaultProjectPath || "");
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState("");
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [editingItem, setEditingItem] = useState<AgentItem>();
  const [editingContent, setEditingContent] = useState("");
  const [renamingThread, setRenamingThread] = useState<AgentThread>();
  const [threadTitleDraft, setThreadTitleDraft] = useState("");
  const [savingThreadTitle, setSavingThreadTitle] = useState(false);
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const [activeMainView, setActiveMainView] = useState<ActiveMainView>("chat");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showArchivedThreads, setShowArchivedThreads] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(
    () => localStorage.getItem("any-jumper-right-panel-open") === "true",
  );
  const [rightPanelResizing, setRightPanelResizing] = useState(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    const stored = localStorage.getItem("any-jumper-right-panel-width");
    return stored ? Number(stored) : 300;
  });
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem("any-jumper-right-panel-width", String(rightPanelWidth));
    }, 400);
    return () => clearTimeout(t);
  }, [rightPanelWidth]);

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((prev) => Math.min(480, Math.max(180, prev + delta)));
  }, []);
  const [sidebarWidth, setSidebarWidth] = useState(284);
  const [pinnedThreadIds, setPinnedThreadIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("any-jumper-pinned-threads");
      return stored ? new Set<string>(JSON.parse(stored)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [previewSplitRatio, setPreviewSplitRatio] = useState(0.45);

  const handlePreviewClose = useCallback(() => {
    setPreviewOpen(false);
    setPreviewFile(null);
  }, []);

  const handlePreviewResize = useCallback((delta: number) => {
    setPreviewSplitRatio((prev) => {
      const containerWidth = window.innerWidth - sidebarWidth - 6;
      const currentPx = prev * containerWidth;
      const newPx = currentPx - delta;
      return Math.min(0.75, Math.max(0.25, newPx / containerWidth));
    });
  }, [sidebarWidth]);

  const [terminalVisible, setTerminalVisible] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<AgentBridgeStatus>();
  const [thinkingTraceByTurn, setThinkingTraceByTurn] = useState<ThinkingTraceByTurn>({});
  const [tokenUsageByTurn, setTokenUsageByTurn] = useState<Record<string, TurnTokenUsage>>({});
  const [toolTraceByTurn, setToolTraceByTurn] = useState<ToolTraceByTurn>({});
  const [expandedTraceTurns, setExpandedTraceTurns] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<NoticeState>();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>();
  const refreshTimer = useRef<number>();
  const noticeTimer = useRef<number>();
  const initialSelectionRef = useRef(readInitialAgentSelection());
  const creatingThreadForWorkspaceRef = useRef(new Set<string>());
  const composerRef = useRef<AgentComposerHandle>(null);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === workspaceId);
  const activeWorkspaceThreads = workspaceId ? threadsByWorkspaceId[workspaceId] || [] : [];
  const activeThread = detail?.thread || activeWorkspaceThreads.find((thread) => thread.id === threadId) || findThreadById(threadsByWorkspaceId, threadId);
  const activeModel = models.find((model) => model.id === selectedProvider);
  const needsModelKey = Boolean(activeModel && activeModel.providerKind !== "mock" && activeModel.providerKind !== "ollama");
  const modelKeyMissing = needsModelKey && !activeModel?.hasApiKey;
  const sessionProviderOptions = useMemo(
    () => models.map((model) => ({
      label: model.displayName,
      value: model.id,
    })),
    [models],
  );
  const sessionModelOptions = useMemo(() => modelOptionsForProvider(activeModel), [activeModel]);
  const permissionView = permissionDisplay(permissionMode);
  const visibleItems = useMemo(
    () => (detail?.items || []).filter((item) => !item.hidden),
    [detail?.items],
  );
  const turnsById = useMemo(
    () => new Map((detail?.turns || []).map((turn) => [turn.id, turn])),
    [detail?.turns],
  );
  const toolCallsByTurn = useMemo(() => {
    const next = new Map<string, ThreadDetail["toolCalls"]>();
    for (const toolCall of detail?.toolCalls || []) {
      if (!toolCall.turnId) continue;
      next.set(toolCall.turnId, [...(next.get(toolCall.turnId) || []), toolCall]);
    }
    return next;
  }, [detail?.toolCalls]);
  const progressNotesByTurn = useMemo(() => {
    const next = new Map<string, ThreadDetail["progressNotes"]>();
    for (const note of detail?.progressNotes || []) {
      if (!note.turnId) continue;
      next.set(note.turnId, [...(next.get(note.turnId) || []), note]);
    }
    return next;
  }, [detail?.progressNotes]);
  const toolCallEventsByTurn = useMemo(() => {
    const next = new Map<string, ThreadDetail["toolCallEvents"]>();
    for (const event of detail?.toolCallEvents || []) {
      if (!event.turnId) continue;
      next.set(event.turnId, [...(next.get(event.turnId) || []), event]);
    }
    return next;
  }, [detail?.toolCallEvents]);
  const pendingApprovals = useMemo(
    () => (detail?.approvals || []).filter((approval) => !approval.decision),
    [detail?.approvals],
  );
  useEffect(() => {
    void bootstrap();
    return () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  // 注册斜杠命令：内建命令 + 已安装 skill
  useEffect(() => {
    registerBuiltinCommands(() => skills);
  }, [skills]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    try {
      void desktopApi.onAgentEvent((event) => handleAgentEvent(event)).then((next) => {
        unlisten = next;
      }).catch((error) => {
        showNotice({ tone: "danger", title: "Agent 事件订阅失败", detail: errorMessage(error) });
      });
    } catch (error) {
      showNotice({ tone: "danger", title: "Agent 事件订阅失败", detail: errorMessage(error) });
    }
    return () => unlisten?.();
  }, [threadId]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void loadAgentBridgeStatus();
    try {
      void desktopApi.onAgentBridgeEvent((status) => setBridgeStatus(status)).then((next) => {
        unlisten = next;
      }).catch((error) => {
        showNotice({ tone: "danger", title: "Agent Bridge 事件订阅失败", detail: errorMessage(error) });
      });
    } catch (error) {
      showNotice({ tone: "danger", title: "Agent Bridge 事件订阅失败", detail: errorMessage(error) });
    }
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (workspaceId) {
      ensureWorkspaceExpanded(workspaceId);
      void loadThreads(workspaceId);
      void loadWorkspaceSkills(workspaceId);
    } else {
      setThreadId(undefined);
      setDetail(undefined);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadRestoredExpandedWorkspaceThreads();
  }, [workspaces, expandedWorkspaceIds, threadsByWorkspaceId, workspaceId]);

  useEffect(() => {
    setThinkingTraceByTurn({});
    setTokenUsageByTurn({});
    setToolTraceByTurn({});
    setExpandedTraceTurns({});
    if (threadId) void loadThread(threadId);
  }, [threadId]);

  useEffect(() => {
    if (!activeModel) return;
    const nextModel = defaultModelForProvider(activeModel, selectedModel);
    if (nextModel !== selectedModel) setSelectedModel(nextModel);
  }, [activeModel, selectedModel]);

  function showNotice(next: NoticeState) {
    setNotice(next);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(undefined), 4200);
  }

  async function bootstrap() {
    clearActivity();
    pushActivity("初始化 Agent 工作台", "running");
    try {
      const [workspaceList, modelList] = await Promise.all([
        desktopApi.workspaceList(),
        desktopApi.modelProviderList(),
      ]);
      setModels(modelList);
      setWorkspaces(workspaceList);
      const firstModel = preferredModel(modelList);
      if (firstModel) {
        setSelectedProvider(firstModel.id);
        setSelectedModel(firstModel.defaultModel);
      }

      if (workspaceList.length > 0) {
        const initialWorkspaceId = initialSelectionRef.current.workspaceId;
        const first = workspaceList.find((workspace) => workspace.id === initialWorkspaceId) || workspaceList[0];
        setWorkspaceId(first.id);
        const workspaceDefaultIsMock = first.defaultProviderId === "mock";
        setSelectedProvider(workspaceDefaultIsMock ? firstModel?.id || "mock" : first.defaultProviderId || firstModel?.id || "mock");
        setSelectedModel(workspaceDefaultIsMock ? firstModel?.defaultModel || "mock-agent" : first.defaultModel || firstModel?.defaultModel || "mock-agent");
      } else if (settings.defaultProjectPath) {
        const workspace = await desktopApi.workspaceCreate({
          rootPath: settings.defaultProjectPath,
          defaultRuntimeId: DEEPAGENTS_RUNTIME_ID,
          defaultProviderId: firstModel?.id || "mock",
          defaultModel: firstModel?.defaultModel || "mock-agent",
        });
        setWorkspaces([workspace]);
        setWorkspaceId(workspace.id);
      } else {
        setWorkspaceModalOpen(true);
      }
      pushActivity("初始化 Agent 工作台", "success");
    } catch (error) {
      const detailText = errorDetail(error) || errorMessage(error);
      pushActivity("初始化 Agent 工作台失败", "error", detailText);
      showNotice({ tone: "danger", title: "初始化失败", detail: detailText });
    }
  }

  function loadRestoredExpandedWorkspaceThreads() {
    const restoredExpandedWorkspaceIds = workspaces
      .filter((workspace) => expandedWorkspaceIds[workspace.id] === true)
      .filter((workspace) => workspace.id !== workspaceId)
      .filter((workspace) => !hasLoadedThreadsForWorkspace(threadsByWorkspaceId, workspace.id))
      .map((workspace) => workspace.id);

    for (const restoredWorkspaceId of restoredExpandedWorkspaceIds) {
      void loadThreads(restoredWorkspaceId, { ensureSelection: false, createIfEmpty: false });
    }
  }

  async function loadThreads(
    nextWorkspaceId = workspaceId,
    options: { ensureSelection?: boolean; createIfEmpty?: boolean } = {},
  ) {
    if (!nextWorkspaceId) return;
    const { ensureSelection = nextWorkspaceId === workspaceId, createIfEmpty = ensureSelection } = options;
    let list: AgentThread[];
    try {
      list = await desktopApi.threadList(nextWorkspaceId);
    } catch (error) {
      const detailText = errorMessage(error);
      setThreadsByWorkspaceId((current) =>
        hasLoadedThreadsForWorkspace(current, nextWorkspaceId)
          ? current
          : { ...current, [nextWorkspaceId]: [] },
      );
      pushActivity("读取会话列表失败", "error", detailText);
      showNotice({ tone: "danger", title: "会话列表读取失败", detail: detailText });
      return;
    }
    setThreadsByWorkspaceId((current) => ({ ...current, [nextWorkspaceId]: list }));
    if (!ensureSelection) return;
    const preferredThreadId = initialSelectionRef.current.threadId;
    const preferredThread = preferredThreadId
      ? list.find((thread) => thread.id === preferredThreadId)
      : undefined;
    if (preferredThread) {
      initialSelectionRef.current.threadId = undefined;
      setThreadId(preferredThread.id);
    } else if (list[0] && !list.some((thread) => thread.id === threadId)) {
      setThreadId(list[0].id);
    } else if (createIfEmpty && list.length === 0 && !creatingThreadForWorkspaceRef.current.has(nextWorkspaceId)) {
      creatingThreadForWorkspaceRef.current.add(nextWorkspaceId);
      try {
        await createThread(nextWorkspaceId);
      } catch (error) {
        const detailText = errorMessage(error);
        pushActivity("创建会话失败", "error", detailText);
        showNotice({ tone: "danger", title: "创建会话失败", detail: detailText });
      } finally {
        creatingThreadForWorkspaceRef.current.delete(nextWorkspaceId);
      }
    }
  }

  async function loadThread(nextThreadId = threadId) {
    if (!nextThreadId) return;
    try {
      const next = await desktopApi.threadRead(nextThreadId);
      setDetail(next);
      setTokenUsageByTurn(tokenUsageByTurnFromDetail(next));
      updateThreadList(next.thread);
      ensureWorkspaceExpanded(next.thread.workspaceId);
      setThreadId(next.thread.id);
      setSelectedProvider(next.thread.providerId);
      setSelectedModel(next.thread.model);
      setPermissionMode(next.thread.permissionMode as PermissionMode);
    } catch (error) {
      showNotice({ tone: "danger", title: "会话读取失败", detail: errorMessage(error) });
    }
  }

  async function loadAgentBridgeStatus() {
    try {
      setBridgeStatus(await desktopApi.agentBridgeStatus());
    } catch (error) {
      showNotice({ tone: "danger", title: "Agent Bridge 状态读取失败", detail: errorMessage(error) });
    }
  }

  function openAgentBridge() {
    setActiveMainView("bridge");
  }

  async function restartAgentBridge() {
    try {
      setBridgeStatus(await desktopApi.agentBridgeRestart());
      showNotice({ tone: "success", title: "Agent Bridge 已重启" });
    } catch (error) {
      showNotice({ tone: "danger", title: "Agent Bridge 重启失败", detail: errorMessage(error) });
    }
  }

  async function clearAgentBridgeLogs() {
    try {
      setBridgeStatus(await desktopApi.agentBridgeClearLogs());
      showNotice({ tone: "success", title: "Agent Bridge 日志已清空" });
    } catch (error) {
      showNotice({ tone: "danger", title: "Agent Bridge 清空失败", detail: errorMessage(error) });
    }
  }

  async function copyAgentBridgeExample() {
    const command = [
      "curl -s http://127.0.0.1:9528/rpc \\",
      "  -H 'content-type: application/json' \\",
      "  -d '{\"method\":\"tabs.list\",\"params\":{\"query\":{}}}'",
    ].join("\n");
    await navigator.clipboard.writeText(command);
    showNotice({ tone: "success", title: "调用示例已复制" });
  }

  function openModelSettings() {
    setModelSettingsOpen(true);
  }

  async function loadWorkspaceSkills(nextWorkspaceId = workspaceId) {
    const workspace = workspaces.find((item) => item.id === nextWorkspaceId);
    if (!workspace) return;
    setSkills(await desktopApi.skillList(workspace.id));
  }

  function workspaceDefaults(workspace?: Workspace) {
    const fallbackProvider = preferredModel(models);
    const requestedProviderId = workspace?.defaultProviderId || selectedProvider || fallbackProvider?.id || "mock";
    const provider = models.find((model) => model.id === requestedProviderId) || fallbackProvider;
    const providerId = provider?.id || requestedProviderId;
    const preferredModelName = workspace?.defaultProviderId === providerId ? workspace.defaultModel : selectedModel;
    return {
      runtimeId: DEEPAGENTS_RUNTIME_ID,
      providerId,
      model: defaultModelForProvider(provider, preferredModelName),
    };
  }

  function openCreateWorkspace() {
    setEditingWorkspace(undefined);
    setWorkspaceNameDraft("");
    setWorkspaceDraft(settings.defaultProjectPath || "");
    setWorkspaceModalOpen(true);
  }

  function openEditWorkspace(workspace: Workspace) {
    setEditingWorkspace(workspace);
    setWorkspaceNameDraft(workspace.name);
    setWorkspaceDraft(workspace.rootPath);
    setWorkspaceModalOpen(true);
  }

  function applyWorkspaceDefaults(workspace: Workspace) {
    const defaults = workspaceDefaults(workspace);
    setSelectedProvider(defaults.providerId);
    setSelectedModel(defaults.model);
  }

  function selectWorkspace(workspace: Workspace) {
    if (workspace.id === workspaceId) return;
    setActiveMainView("chat");
    ensureWorkspaceExpanded(workspace.id);
    applyWorkspaceDefaults(workspace);
    setWorkspaceId(workspace.id);
    setThreadId(undefined);
    setDetail(undefined);
  }

  async function saveWorkspace() {
    if (!workspaceDraft.trim()) {
      showNotice({ tone: "warning", title: "请选择工作区路径" });
      return;
    }
    setSavingWorkspace(true);
    try {
      const currentModel = models.find((model) => model.id === selectedProvider);
      const defaults = editingWorkspace ? workspaceDefaults(editingWorkspace) : workspaceDefaults();
      const request = {
        name: workspaceNameDraft.trim() || undefined,
        rootPath: workspaceDraft.trim(),
        trustLevel: editingWorkspace?.trustLevel,
        defaultRuntimeId: DEEPAGENTS_RUNTIME_ID,
        defaultProviderId: defaults.providerId || selectedProvider || currentModel?.id || "mock",
        defaultModel: defaults.model,
        layoutJson: editingWorkspace?.layoutJson,
      };
      if (editingWorkspace) {
        const workspace = await desktopApi.workspaceUpdate(editingWorkspace.id, request);
        setWorkspaces((items) => items.map((item) => (item.id === workspace.id ? workspace : item)));
        if (workspace.id === workspaceId) {
          applyWorkspaceDefaults(workspace);
        }
        pushActivity("更新 Workspace", "success", workspace.rootPath);
      } else {
        const workspace = await desktopApi.workspaceCreate(request);
        setWorkspaces((items) => [workspace, ...items]);
        ensureWorkspaceExpanded(workspace.id);
        selectWorkspace(workspace);
        pushActivity("创建 Workspace", "success", workspace.rootPath);
      }
      setWorkspaceModalOpen(false);
      setEditingWorkspace(undefined);
      showNotice({ tone: "success", title: editingWorkspace ? "工作区已保存" : "工作区已添加" });
    } catch (error) {
      showNotice({ tone: "danger", title: "工作区保存失败", detail: errorMessage(error) });
    } finally {
      setSavingWorkspace(false);
    }
  }

  function removeWorkspace(workspace: Workspace) {
    setConfirmAction({
      title: `移除 ${workspace.name}？`,
      description: "只会从工作区列表移除，不会删除本地文件。",
      confirmLabel: "移除",
      destructive: true,
      async onConfirm() {
        await desktopApi.workspaceDelete(workspace.id);
        const remaining = workspaces.filter((item) => item.id !== workspace.id);
        setWorkspaces(remaining);
        setThreadsByWorkspaceId((current) => {
          const { [workspace.id]: _removed, ...rest } = current;
          return rest;
        });
        setExpandedWorkspaceIds((current) => {
          const { [workspace.id]: _removed, ...rest } = current;
          persistExpandedWorkspaceIds(rest);
          return rest;
        });
        pushActivity("移除 Workspace", "success", workspace.rootPath);
        if (workspace.id === workspaceId) {
          const next = remaining[0];
          if (next) {
            selectWorkspace(next);
          } else {
            setWorkspaceId(undefined);
            setWorkspaceModalOpen(true);
          }
        }
      },
    });
  }

  async function createThread(nextWorkspaceId = workspaceId) {
    const workspace = workspaces.find((item) => item.id === nextWorkspaceId);
    if (!nextWorkspaceId || !workspace) {
      openCreateWorkspace();
      return;
    }
    const workspaceModelDefaults = workspaceDefaults(workspace);
    const latestSettings = await desktopApi.getSettings().catch(() => settings);
    const defaults = resolveNewSessionModelDefaults(latestSettings, models, workspaceModelDefaults);
    const thread = await desktopApi.threadCreate({
      workspaceId: nextWorkspaceId,
      title: "New session",
      runtimeId: defaults.runtimeId,
      providerId: defaults.providerId,
      model: defaults.model,
      permissionMode,
    });
    setSelectedProvider(defaults.providerId);
    setSelectedModel(defaults.model);
    setActiveMainView("chat");
    setWorkspaceId(workspace.id);
    ensureWorkspaceExpanded(workspace.id);
    setThreadsByWorkspaceId((current) => ({
      ...current,
      [workspace.id]: [thread, ...(current[workspace.id] || [])],
    }));
    setThreadId(thread.id);
    setDetail(await desktopApi.threadRead(thread.id));
  }

  function updateThreadList(nextThread: AgentThread) {
    setThreadsByWorkspaceId((current) => upsertThreadInMap(current, nextThread));
  }

  function syncThread(nextThread: AgentThread) {
    updateThreadList(nextThread);
    setDetail((current) => (current?.thread.id === nextThread.id ? { ...current, thread: nextThread } : current));
  }

  function openRenameThread(thread: AgentThread) {
    setRenamingThread(thread);
    setThreadTitleDraft(thread.title);
  }

  async function saveThreadName() {
    if (!renamingThread) return;
    const title = threadTitleDraft.trim();
    if (!title) {
      showNotice({ tone: "warning", title: "请输入会话名称" });
      return;
    }
    setSavingThreadTitle(true);
    try {
      const next = await desktopApi.threadNameSet(renamingThread.id, title);
      syncThread(next);
      pushActivity("重命名会话", "success", next.title);
      setRenamingThread(undefined);
      setThreadTitleDraft("");
    } catch (error) {
      showNotice({ tone: "danger", title: "重命名失败", detail: errorMessage(error) });
    } finally {
      setSavingThreadTitle(false);
    }
  }

  function togglePinThread(threadId: string) {
    setPinnedThreadIds((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) {
        next.delete(threadId);
      } else {
        next.add(threadId);
      }
      localStorage.setItem("any-jumper-pinned-threads", JSON.stringify([...next]));
      return next;
    });
  }

  async function archiveThread(thread: AgentThread) {
    try {
      await desktopApi.threadArchive(thread.id);
      const remaining = (threadsByWorkspaceId[thread.workspaceId] || []).filter((item) => item.id !== thread.id);
      setThreadsByWorkspaceId((current) => ({ ...current, [thread.workspaceId]: remaining }));
      pushActivity("归档会话", "success", thread.title);
      if (thread.id === threadId) {
        const next = remaining[0];
        setDetail(undefined);
        if (next) {
          setThreadId(next.id);
        }
      }
    } catch {
      pushActivity("归档失败", "error", thread.title);
    }
  }

  function removeThread(thread: AgentThread) {
    setConfirmAction({
      title: `删除「${thread.title}」？`,
      description: "删除后会从会话列表移除，不影响本地项目文件。",
      confirmLabel: "删除",
      destructive: true,
      async onConfirm() {
        if (thread.status === "running") {
          await desktopApi.turnInterrupt(thread.id);
        }
        await desktopApi.threadArchive(thread.id);
        const remaining = (threadsByWorkspaceId[thread.workspaceId] || []).filter((item) => item.id !== thread.id);
        setThreadsByWorkspaceId((current) => ({ ...current, [thread.workspaceId]: remaining }));
        pushActivity("删除会话", "success", thread.title);
        if (thread.id === threadId) {
          const next = remaining[0];
          setDetail(undefined);
          if (next) {
            setThreadId(next.id);
          } else if (workspaceId) {
            setThreadId(undefined);
            await createThread(workspaceId);
          }
        }
      },
    });
  }

  async function autoNameThreadIfNeeded(targetThreadId: string, input: string) {
    const thread = detail?.thread.id === targetThreadId
      ? detail.thread
      : findThreadById(threadsByWorkspaceId, targetThreadId);
    if (!thread || !shouldAutoNameThread(thread.title)) return;
    const title = summarizeThreadTitle(input);
    if (!title || title === thread.title) return;
    try {
      const next = await desktopApi.threadNameSet(targetThreadId, title);
      syncThread(next);
      pushActivity("自动命名会话", "success", next.title);
    } catch (error) {
      pushActivity("自动命名会话失败", "error", errorMessage(error));
    }
  }

  async function executeSlashCommand(trigger: string, args: string): Promise<boolean> {
    const directSkill = findSkillByName(skills, trigger);
    if (directSkill) return executeSkillRun(directSkill, args);

    // 兼容旧输入：手打 `/skill run <name>` 仍然可以运行，但 UI 不再展示这层命令。
    if (trigger === "skill") return executeSkillSlashCommand(args);
    return false;
  }

  async function executeSkillSlashCommand(args: string): Promise<boolean> {
    const request = parseSkillSlashArgs(args);
    if (request.action === "list") {
      if (skills.length === 0) {
        showNotice({ tone: "warning", title: "没有可用 Skill", detail: "当前工作区、用户目录和插件目录都没有加载到 Skill。" });
        return true;
      }
      const skillList = skills
        .map((skill) => `- ${skill.name} (${skill.scope})：${skill.description || "无描述"}`)
        .join("\n");
      return sendMessageToAgent(`请用中文简洁列出当前可用 Skill，并说明适用场景。\n\n${skillList}`, []);
    }

    if (!request.skillName) {
      showNotice({ tone: "warning", title: "请选择 Skill", detail: "用法：/skill run <skill名称> <你的请求>" });
      return false;
    }

    const skill = findSkillByName(skills, request.skillName);
    if (!skill) {
      showNotice({ tone: "warning", title: "未找到 Skill", detail: `没有找到名为 ${request.skillName} 的 Skill。` });
      return false;
    }

    return executeSkillRun(skill, request.instruction);
  }

  async function executeSkillRun(skill: SkillSummary, instruction: string): Promise<boolean> {
    pushActivity("运行 Skill", "running", skill.name);
    try {
      const skillMarkdown = await desktopApi.skillRead(skill.path);
      return sendMessageToAgent(buildSkillRunPrompt(skill, skillMarkdown, instruction), []);
    } catch (error) {
      showNotice({ tone: "danger", title: "Skill 读取失败", detail: errorMessage(error) });
      return false;
    }
  }

  /** 将消息直接发送给 agent（跳过斜杠命令检查） */
  async function sendMessageToAgent(input: string, images: ImageAttachment[]): Promise<boolean> {
    if (!threadId || (!input.trim() && images.length === 0)) return false;
    const targetThreadId = threadId;
    pushActivity(activeThread?.status === "running" ? "排队发送" : "发送会话", "running", input);
    try {
      await autoNameThreadIfNeeded(targetThreadId, input);
      const model = defaultModelForProvider(activeModel, selectedModel);
      const next = await desktopApi.turnStart({
        threadId: targetThreadId,
        input,
        images: images.length > 0 ? images : undefined,
        runtimeId: DEEPAGENTS_RUNTIME_ID,
        providerId: selectedProvider,
        model,
        permissionMode,
      });
      setDetail(next);
      updateThreadList(next.thread);
      return true;
    } catch (error) {
      showNotice({ tone: "danger", title: "发送失败", detail: errorMessage(error) });
      return false;
    }
  }

  async function sendMessage(input: string, images: ImageAttachment[]) {
    if (!threadId || (!input.trim() && images.length === 0)) return false;
    // 检查斜杠命令
    if (isSlashActive(input.trim())) {
      const parsed = parseSlashInput(input.trim());
      if (parsed && parsed.trigger) {
        const handled = await executeSlashCommand(parsed.trigger, parsed.args);
        return handled;
      }
    }
    return sendMessageToAgent(input, images);
  }

  async function interrupt() {
    if (!threadId) return;
    const next = await desktopApi.turnInterrupt(threadId);
    setDetail(next);
    pushActivity("停止会话", "success");
  }

  function openRetryEditor(item: AgentItem) {
    if (item.role !== "user") return;
    setEditingItem(item);
    setEditingContent(item.content);
  }

  async function copyMessageContent(item: AgentItem) {
    const content = (item.role === "assistant" ? assistantDisplayParts(item).content : userDisplayContent(item.content)).trim();
    if (!content) {
      showNotice({ tone: "warning", title: "没有可复制的内容" });
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      showNotice({ tone: "success", title: "消息已复制" });
    } catch (error) {
      showNotice({ tone: "danger", title: "复制失败", detail: errorMessage(error) });
    }
  }

  async function rerunEdited() {
    if (!editingItem) return;
    const content = editingContent.trim();
    if (!content) {
      showNotice({ tone: "warning", title: "重试内容不能为空" });
      return;
    }
    try {
      const next = await desktopApi.turnEditAndRerun(editingItem.id, content, {
        runtimeId: DEEPAGENTS_RUNTIME_ID,
        providerId: selectedProvider,
        model: defaultModelForProvider(activeModel, selectedModel),
        permissionMode,
      });
      setDetail(next);
      updateThreadList(next.thread);
      pushActivity("编辑并重试", "running", content);
      setEditingItem(undefined);
      setEditingContent("");
    } catch (error) {
      showNotice({ tone: "danger", title: "重试失败", detail: errorMessage(error) });
    }
  }

  async function forkThreadFromItem(item: AgentItem) {
    if (!threadId) return;
    try {
      const forked = await desktopApi.threadFork(threadId, item.id);
      updateThreadList(forked);
      ensureWorkspaceExpanded(forked.workspaceId);
      setActiveMainView("chat");
      setWorkspaceId(forked.workspaceId);
      setThreadId(forked.id);
      pushActivity("分叉会话", "success", forked.title);
    } catch (error) {
      showNotice({ tone: "danger", title: "分叉失败", detail: errorMessage(error) });
    }
  }

  async function resolveApproval(approval: Approval, decision: string) {
    await desktopApi.approvalResolve(approval.id, decision);
    if (threadId) await loadThread(threadId);
    pushActivity("处理工具审批", "success", `${approval.toolName}: ${decision}`);
  }

  function handleAgentEvent(event: AgentEvent) {
    if (event.threadId !== threadId) return;
    setThinkingTraceByTurn((current) => reduceThinkingTraceByTurn(current, event));
    setToolTraceByTurn((current) => reduceToolTraceByTurn(current, event));
    setDetail((current) => applyEvent(current, event));
    if ((event.event === "turn.completed" || event.event === "turn.failed") && event.turnId) {
      const payload = event.payload as Record<string, unknown> | undefined;
      const tu = payload?.tokenUsage as TurnTokenUsage | undefined;
      if (tu) {
        setTokenUsageByTurn((current) => ({ ...current, [event.turnId!]: tu }));
      }
    }
    if (!shouldReloadThreadAfterAgentEvent(event)) return;
    if (refreshTimer.current) return;
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = undefined;
      if (threadId) void loadThread(threadId);
    }, 80);
  }

  function toggleThinkingTrace(section: ThinkingTraceSection, approvals: Approval[] = []) {
    setExpandedTraceTurns((current) => {
      const expanded = current[section.turnId] ?? defaultTurnTraceExpanded(section, approvals);
      return { ...current, [section.turnId]: !expanded };
    });
  }

  function setWorkspaceExpanded(nextWorkspaceId: string, expanded: boolean) {
    setExpandedWorkspaceIds((current) => {
      const next = { ...current, [nextWorkspaceId]: expanded };
      persistExpandedWorkspaceIds(next);
      return next;
    });
    if (expanded && !hasLoadedThreadsForWorkspace(threadsByWorkspaceId, nextWorkspaceId)) {
      void loadThreads(nextWorkspaceId, { ensureSelection: false, createIfEmpty: false });
    }
  }

  function ensureWorkspaceExpanded(nextWorkspaceId: string) {
    setExpandedWorkspaceIds((current) => {
      if (current[nextWorkspaceId]) return current;
      const next = { ...current, [nextWorkspaceId]: true };
      persistExpandedWorkspaceIds(next);
      return next;
    });
  }

  function toggleWorkspaceExpanded(nextWorkspaceId: string) {
    const expanded = !(expandedWorkspaceIds[nextWorkspaceId] ?? false);
    setWorkspaceExpanded(nextWorkspaceId, expanded);
  }

  function toggleProjectTreeCollapsed() {
    setProjectTreeCollapsed((current) => {
      const next = !current;
      persistProjectTreeCollapsed(next);
      return next;
    });
  }

  function selectThread(workspace: Workspace, thread: AgentThread) {
    setActiveMainView("chat");
    applyWorkspaceDefaults(workspace);
    ensureWorkspaceExpanded(workspace.id);
    setWorkspaceId(workspace.id);
    setThreadId(thread.id);
  }

  return (
    <TooltipProvider delayDuration={160}>
      <div
        className={`agent-workbench shadcn-agent-shell ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`}
        style={{ "--agent-sidebar-width": `${sidebarCollapsed ? 60 : sidebarWidth}px` } as React.CSSProperties}
        data-ui="shadcn-agent-shell"
      >
        {notice ? (
          <div className={`agent-toast is-${notice.tone}`} role="status">
            <strong>{notice.title}</strong>
            {notice.detail ? <span>{notice.detail}</span> : null}
          </div>
        ) : null}

        <aside className="agent-sidebar">
          {/* Mini Rail — icon-only collapsed mode */}
          <div className="agent-mini-rail">
            <button
              className={`agent-mini-rail-entry ${activeMainView === "bridge" ? "is-active" : ""}`}
              type="button"
              aria-label="Agent-Bridge"
              onClick={openAgentBridge}
            >
              <Radio size={17} />
            </button>
            <button
              className={`agent-mini-rail-entry ${activeMainView === "modelConfig" ? "is-active" : ""}`}
              type="button"
              aria-label="Model-Config"
              onClick={() => setActiveMainView("modelConfig")}
            >
              <KeyRound size={17} />
            </button>
            <button
              className={`agent-mini-rail-entry ${activeMainView === "plugin" ? "is-active" : ""}`}
              type="button"
              aria-label="Plugin"
              onClick={() => setActiveMainView("plugin")}
            >
              <Package size={17} />
            </button>
            <div className="agent-mini-rail-separator" />
            <button
              className="agent-mini-rail-entry"
              type="button"
              aria-label="Project"
              onClick={toggleProjectTreeCollapsed}
            >
              <FolderTree size={17} />
            </button>
          </div>

          <button
            className={`agent-bridge-entry ${activeMainView === "bridge" ? "is-active" : ""}`}
            type="button"
            onClick={openAgentBridge}
          >
            <Radio size={17} />
            <span>Agent-Bridge</span>
          </button>

          <button
            className={`agent-bridge-entry ${activeMainView === "modelConfig" ? "is-active" : ""}`}
            type="button"
            onClick={() => setActiveMainView("modelConfig")}
          >
            <KeyRound size={17} />
            <span>Model-Config</span>
          </button>

          <button
            className={`agent-bridge-entry ${activeMainView === "plugin" ? "is-active" : ""}`}
            type="button"
            onClick={() => setActiveMainView("plugin")}
          >
            <Package size={17} />
            <span>Plugin</span>
          </button>

          <div className="agent-sidebar-section-divider" />

          <div className="agent-sidebar-head">
            <button
              aria-expanded={!projectTreeCollapsed}
              aria-label={projectTreeCollapsed ? "展开 Project" : "收起 Project"}
              className="agent-sidebar-head-toggle"
              type="button"
              onClick={toggleProjectTreeCollapsed}
            >
              <ChevronDown className="agent-sidebar-head-chevron" size={14} />
              <span className="agent-sidebar-head-copy">
                <span className="panel-title">Project</span>
                <span className="panel-subtitle">{workspaces.length} workspaces</span>
              </span>
            </button>
            <div className="agent-sidebar-actions">
              <IconButton label="Add Workspace" onClick={openCreateWorkspace}>
                <Plus size={16} />
              </IconButton>
            </div>
          </div>

          {!projectTreeCollapsed ? (
            <div className="codex-project-tree">
                {workspaces.length === 0 ? (
                  <MiniEmpty label="No workspaces" />
                ) : (
                  workspaces.map((workspace) => {
                    const expanded = expandedWorkspaceIds[workspace.id] ?? workspace.id === workspaceId;
                    const sessionsLoaded = hasLoadedThreadsForWorkspace(threadsByWorkspaceId, workspace.id);
                    const workspaceThreads = threadsByWorkspaceId[workspace.id] || [];
                    return (
                      <div className={`codex-project-node ${expanded ? "is-expanded" : ""}`} key={workspace.id}>
                        <div className="codex-project-row">
                          <button
                            aria-expanded={expanded}
                            aria-label={expanded ? `收起 ${workspace.name}` : `展开 ${workspace.name}`}
                            className="codex-project-disclosure"
                            type="button"
                            onClick={() => toggleWorkspaceExpanded(workspace.id)}
                          >
                            <ChevronDown size={14} />
                          </button>
                          <button
                            className="codex-project-select"
                            title={workspace.rootPath}
                            type="button"
                            onClick={() => selectWorkspace(workspace)}
                          >
                            {expanded ? <FolderOpen size={16} /> : <Folder size={16} />}
                            <span>{workspace.name}</span>
                          </button>
                          <button
                            aria-label={`编辑 ${workspace.name}`}
                            className="codex-project-action"
                            type="button"
                            onClick={() => openEditWorkspace(workspace)}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            aria-label={`删除 ${workspace.name}`}
                            className="codex-project-action codex-project-action--danger"
                            type="button"
                            onClick={() => removeWorkspace(workspace)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        {expanded ? (
                          <div className="codex-project-sessions">
                            <div className="codex-session-list">
                              {!sessionsLoaded ? (
                                <MiniEmpty label="Loading sessions" />
                              ) : workspaceThreads.length === 0 ? (
                                <MiniEmpty label="No sessions" />
                              ) : (
                                [...workspaceThreads]
                                  .sort((a, b) => {
                                    const aPinned = pinnedThreadIds.has(a.id) ? 1 : 0;
                                    const bPinned = pinnedThreadIds.has(b.id) ? 1 : 0;
                                    if (aPinned !== bPinned) return bPinned - aPinned;
                                    return (b.updatedAt || 0) - (a.updatedAt || 0);
                                  })
                                  .map((thread) => {
                                  const isActive = thread.id === threadId;
                                  const isPinned = pinnedThreadIds.has(thread.id);
                                  return (
                                    <div
                                      className={`codex-session-row is-nested ${isPinned ? "is-pinned" : ""} ${isActive ? "is-active" : ""}`}
                                      key={thread.id}
                                    >
                                      <button
                                        className="codex-session-main"
                                        type="button"
                                        onClick={() => selectThread(workspace, thread)}
                                      >
                                        <span className="codex-session-title">
                                          {isPinned && <Pin size={11} className="codex-session-pin-icon" />}
                                          {thread.title}
                                        </span>
                                        <span className="codex-session-meta">
                                          {formatRelativeTime(thread.updatedAt)}
                                        </span>
                                      </button>
                                      <button
                                        aria-label={isPinned ? `取消置顶 ${thread.title}` : `置顶 ${thread.title}`}
                                        className={`codex-session-action ${isPinned ? "codex-session-action-active" : ""}`}
                                        type="button"
                                        onClick={() => togglePinThread(thread.id)}
                                      >
                                        {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                                      </button>
                                      <button
                                        aria-label={`归档 ${thread.title}`}
                                        className="codex-session-action"
                                        type="button"
                                        onClick={() => archiveThread(thread)}
                                      >
                                        <Archive size={12} />
                                      </button>
                                      <button
                                        aria-label={`删除会话 ${thread.title}`}
                                        className="codex-session-action codex-session-action-danger"
                                        type="button"
                                        onClick={() => removeThread(thread)}
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                            <button
                              className="codex-session-add"
                              type="button"
                              onClick={() => void createThread(workspace.id)}
                            >
                              <Plus size={14} />
                              <span>New Session</span>
                            </button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
            </div>
          ) : null}

        </aside>

        {!sidebarCollapsed && (
          <ResizeHandle onResize={handleSidebarResize} />
        )}

        <div
          className={`agent-content-row ${rightPanelOpen && activeWorkspace ? "has-right-panel" : ""}`}
          style={{ "--agent-right-panel-width": `${rightPanelWidth}px` } as React.CSSProperties}
        >
        <section className="agent-main">
          <header className="agent-status-strip">
            <div className="agent-status-copy">
              <div className="agent-status-title">
                <strong>{activeMainView === "bridge" ? "Agent-Bridge" : activeMainView === "modelConfig" ? "Model-Config" : activeMainView === "plugin" ? "Plugin" : activeThread?.title || "New Session"}</strong>
                <Badge tone={activeMainView === "bridge" ? bridgeStatusTone(bridgeStatus) : activeMainView === "modelConfig" || activeMainView === "plugin" ? "muted" : activeThread?.status === "running" ? "success" : "muted"}>
                  <span className={`agent-status-dot ${activeMainView === "bridge" ? bridgeStatus?.listening ? "is-running" : "is-idle" : activeMainView === "modelConfig" || activeMainView === "plugin" ? "is-idle" : activeThread?.status === "running" ? "is-running" : "is-idle"}`} />
                  {activeMainView === "bridge" ? bridgeStatusLabel(bridgeStatus) : activeMainView === "modelConfig" || activeMainView === "plugin" ? "Settings" : threadStatusLabel(activeThread?.status)}
                </Badge>
              </div>
              <div className="agent-status-meta" aria-label={activeMainView === "bridge" ? "Bridge status" : activeMainView === "modelConfig" ? "Model config" : activeMainView === "plugin" ? "Plugin status" : "Session status"}>
                {activeMainView === "bridge" ? (
                  <>
                    <span className="agent-meta-pill"><TerminalSquare size={12} />{bridgeStatus?.endpoint || "http://127.0.0.1:9528"}</span>
                    <span className="agent-meta-pill"><History size={12} />{bridgeStatus?.extensionCount || 0} 扩展</span>
                    <span className="agent-meta-pill"><Wrench size={12} />{bridgeStatus?.requestCount || 0} RPC</span>
                    <span className="agent-meta-pill"><ShieldAlert size={12} />{bridgeStatus?.errorCount || 0} 错误</span>
                  </>
                ) : activeMainView === "modelConfig" ? (
                  <>
                    <span className="agent-meta-pill"><KeyRound size={12} />Provider & API Key</span>
                    <span className="agent-meta-pill"><Bot size={12} />{models.length} models</span>
                  </>
                ) : activeMainView === "plugin" ? (
                  <>
                    <span className="agent-meta-pill"><Package size={12} />Plugin</span>
                    <span className="agent-meta-pill"><Wrench size={12} />Skills & MCP</span>
                  </>
                ) : (
                  <>
                    <span className="agent-meta-pill"><Bot size={12} />{activeModel?.displayName || "Model"} · {selectedModel}</span>
                    <span className="agent-meta-pill"><History size={12} />{detail?.queue.length || 0} queued</span>
                    <span className="agent-meta-pill"><PauseCircle size={12} />{pendingApprovals.length} approvals</span>
                    <span className="agent-meta-pill"><Wrench size={12} />{detail?.toolCalls.length || 0} tools</span>
                  </>
                )}
              </div>
            </div>
            <div className="agent-status-actions">
              <IconButton
                className={`agent-header-action agent-sidebar-toggle agent-side-control ${sidebarCollapsed ? "is-collapsed" : ""}`}
                label={sidebarCollapsed ? "展开左侧栏" : "收起左侧栏"}
                aria-pressed={!sidebarCollapsed}
                onClick={() => setSidebarCollapsed((v) => !v)}
              >
                {sidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
              </IconButton>
              {activeMainView === "chat" ? (
                <IconButton
                  className={`agent-header-action agent-terminal-toggle agent-side-control ${terminalVisible ? "is-collapsed" : ""}`}
                  label={terminalVisible ? "收起下侧栏终端" : "展开下侧栏终端"}
                  aria-pressed={terminalVisible}
                  onClick={() => setTerminalVisible((v) => !v)}
                >
                  {terminalVisible ? <PanelBottomClose size={15} /> : <PanelBottomOpen size={15} />}
                </IconButton>
              ) : null}
              <IconButton
                className={`agent-header-action agent-right-panel-toggle agent-side-control ${rightPanelOpen ? "is-active" : ""}`}
                label={rightPanelOpen ? "收起右侧面板" : "展开右侧面板"}
                aria-pressed={rightPanelOpen}
                onClick={() => {
                  const next = !rightPanelOpen;
                  setRightPanelOpen(next);
                  localStorage.setItem("any-jumper-right-panel-open", String(next));
                }}
              >
                {rightPanelOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
              </IconButton>
              {onToggleTheme ? (
                <IconButton
                  className={`agent-header-action agent-theme-toggle ${themeMode === "dark" ? "is-active" : ""}`}
                  label={`切换到${themeMode === "dark" ? "浅色" : "深色"}主题`}
                  aria-pressed={themeMode === "dark"}
                  onClick={onToggleTheme}
                >
                  {themeMode === "dark" ? <Sun size={15} /> : <Moon size={15} />}
                </IconButton>
              ) : null}
            </div>
          </header>

          {activeMainView === "bridge" ? (
            <BridgeMainPanel
              status={bridgeStatus}
              onClearLogs={() => void clearAgentBridgeLogs()}
              onCopyExample={() => void copyAgentBridgeExample()}
              onRestart={() => void restartAgentBridge()}
            />
          ) : activeMainView === "modelConfig" ? (
            <div className="model-config-inline">
              <ModelPage pushActivity={pushActivity} />
            </div>
          ) : activeMainView === "plugin" ? (
            <div className="model-config-inline">
              <PluginPage pushActivity={pushActivity} />
            </div>
          ) : previewOpen && previewFile ? (
            <div className="agent-main-with-preview">
              <div className="agent-main-chat">
                <Conversation
                  className={visibleItems.length === 0 ? "is-empty-home" : ""}
                >
                  {visibleItems.length === 0 ? (
                    <AgentEmptyState
                      activeWorkspace={activeWorkspace}
                      threadReady={Boolean(threadId)}
                      onPickSuggestion={(suggestion) => composerRef.current?.setComposer(suggestion)}
                      onCreateWorkspace={openCreateWorkspace}
                    />
                  ) : (
                  <>
                    {visibleItems.map((item) => {
                      const assistantDisplay = assistantDisplayParts(item);
                      const displayContent = item.role === "assistant" ? assistantDisplay.content : userDisplayContent(item.content);
                      const isEmpty = !displayContent.trim();
                      const messageActionsDisabled = activeThread?.status === "running";
                      const hasCopyableMessage = displayContent.trim().length > 0;
                      const showUserActions = item.role === "user" && hasCopyableMessage;
                      const showAssistantActions = item.role === "assistant" && hasCopyableMessage;
                      const turnToolCalls = item.turnId ? toolCallsByTurn.get(item.turnId) || [] : [];
                      const approvalCards = turnApprovalsForToolCalls(pendingApprovals, turnToolCalls);
                      const progressNotes = item.turnId
                        ? [...(progressNotesByTurn.get(item.turnId) || []), ...assistantDisplay.progressNotes]
                        : assistantDisplay.progressNotes;
                      const thinkingSection = thinkingTraceSectionForTurn({
                        traceByTurn: thinkingTraceByTurn,
                        turnId: item.turnId,
                        turn: item.turnId ? turnsById.get(item.turnId) : undefined,
                        toolCalls: turnToolCalls,
                        progressNotes,
                      });
                      const toolCards = item.role === "assistant"
                        ? buildToolTraceCardsForTurn({
                          traceByTurn: toolTraceByTurn,
                          turnId: item.turnId,
                          toolCalls: turnToolCalls,
                          toolCallEvents: item.turnId ? toolCallEventsByTurn.get(item.turnId) || [] : [],
                        })
                        : [];
                      const showModelProcess =
                        item.role === "assistant" &&
                        Boolean(thinkingSection || toolCards.length > 0 || approvalCards.length > 0) &&
                        (
                          item.status === "running" ||
                          thinkingSection?.status === "running" ||
                          Boolean(thinkingSection?.items.length) ||
                          toolCards.length > 0 ||
                          approvalCards.length > 0
                        );
                      const modelProcessSection = thinkingSection || toolOnlyTraceSection(item.turnId, toolCards, approvalCards);
                      const traceExpanded = modelProcessSection
                        ? expandedTraceTurns[modelProcessSection.turnId] ?? defaultTurnTraceExpanded(modelProcessSection, approvalCards)
                        : false;
                      const messageStatus = (item.status as "running" | "completed" | "error" | "idle") || "completed";
                      return (
                        <Message key={item.id} id={item.id} role={item.role as "user" | "assistant" | "system"} status={messageStatus} isEmpty={isEmpty}>
                          {showModelProcess && modelProcessSection ? (
                            <TurnTracePanel
                              expanded={traceExpanded}
                              section={modelProcessSection}
                              toolCards={toolCards}
                              approvals={approvalCards}
                              tokenUsage={item.turnId ? tokenUsageByTurn[item.turnId] : undefined}
                              onToggle={() => toggleThinkingTrace(modelProcessSection, approvalCards)}
                              onResolveApproval={resolveApproval}
                            />
                          ) : null}
                          {displayContent.trim() || (item.images && item.images.length > 0) ? (
                            <MessageBody>
                              {displayContent.trim() ? (
                                <MarkdownRenderer content={displayContent} streaming={item.status === "running"} />
                              ) : null}
                              {item.images && item.images.length > 0 ? (
                                <MessageImageGrid images={item.images} />
                              ) : null}
                            </MessageBody>
                          ) : null}
                          {showUserActions ? (
                            <MessageActions>
                              <IconButton
                                className="message-action-button"
                                label="复制消息"
                                onClick={() => void copyMessageContent(item)}
                              >
                                <Copy size={13} />
                              </IconButton>
                              <IconButton
                                className="message-action-button"
                                disabled={messageActionsDisabled}
                                label="编辑并重试"
                                onClick={() => openRetryEditor(item)}
                              >
                                <Pencil size={13} />
                              </IconButton>
                            </MessageActions>
                          ) : null}
                          {showAssistantActions ? (
                            <MessageActions>
                              <IconButton
                                className="message-action-button"
                                label="复制消息"
                                onClick={() => void copyMessageContent(item)}
                              >
                                <Copy size={13} />
                              </IconButton>
                              <IconButton
                                className="message-action-button"
                                disabled={messageActionsDisabled}
                                label="从这里分叉"
                                onClick={() => void forkThreadFromItem(item)}
                              >
                                <GitBranch size={13} />
                              </IconButton>
                            </MessageActions>
                          ) : null}
                        </Message>
                      );
                    })}
                  </>
                )}
                <ConversationScrollButton />
              </Conversation>

              <AgentComposer
                ref={composerRef}
                activeModelDisplayName={activeModel?.displayName || "Model"}
                modelKeyMissing={modelKeyMissing}
                permissionView={permissionView}
                queueLength={detail?.queue.length || 0}
                threadId={threadId}
                workspaceId={workspaceId}
                isRunning={activeThread?.status === "running"}
                skills={skills}
                onAttachFilesActivity={pushActivity}
                onInterrupt={interrupt}
                onModelSettingsOpen={openModelSettings}
                onPermissionModeChange={setPermissionMode}
                onSubmit={sendMessage}
              />
              <TerminalPanel
                rootPath={activeWorkspace?.rootPath}
                workspaceName={activeWorkspace?.name}
                visible={terminalVisible}
                onToggle={() => setTerminalVisible(false)}
              />
              </div>
              <ResizeHandle onResize={handlePreviewResize} />
              <div className="agent-main-preview">
                <PreviewPanel
                  file={previewFile}
                  diff={null}
                  onClose={handlePreviewClose}
                />
              </div>
            </div>
          ) : previewOpen && previewFile ? (
            <div className="agent-main-with-preview">
              <div className="agent-main-chat">
                <Conversation
                  className={visibleItems.length === 0 ? "is-empty-home" : ""}
                >
                  {visibleItems.length === 0 ? (
                    <AgentEmptyState
                      activeWorkspace={activeWorkspace}
                      threadReady={Boolean(threadId)}
                      onPickSuggestion={(suggestion) => composerRef.current?.setComposer(suggestion)}
                      onCreateWorkspace={openCreateWorkspace}
                    />
                  ) : (
                  <>
                    {visibleItems.map((item) => {
                      const assistantDisplay = assistantDisplayParts(item);
                      const displayContent = item.role === "assistant" ? assistantDisplay.content : userDisplayContent(item.content);
                      const isEmpty = !displayContent.trim();
                      const messageActionsDisabled = activeThread?.status === "running";
                      const hasCopyableMessage = displayContent.trim().length > 0;
                      const showUserActions = item.role === "user" && hasCopyableMessage;
                      const showAssistantActions = item.role === "assistant" && hasCopyableMessage;
                      const turnToolCalls = item.turnId ? toolCallsByTurn.get(item.turnId) || [] : [];
                      const approvalCards = turnApprovalsForToolCalls(pendingApprovals, turnToolCalls);
                      const progressNotes = item.turnId
                        ? [...(progressNotesByTurn.get(item.turnId) || []), ...assistantDisplay.progressNotes]
                        : assistantDisplay.progressNotes;
                      const thinkingSection = thinkingTraceSectionForTurn({
                        traceByTurn: thinkingTraceByTurn,
                        turnId: item.turnId,
                        turn: item.turnId ? turnsById.get(item.turnId) : undefined,
                        toolCalls: turnToolCalls,
                        progressNotes,
                      });
                      const toolCards = item.role === "assistant"
                        ? buildToolTraceCardsForTurn({
                          traceByTurn: toolTraceByTurn,
                          turnId: item.turnId,
                          toolCalls: turnToolCalls,
                          toolCallEvents: item.turnId ? toolCallEventsByTurn.get(item.turnId) || [] : [],
                        })
                        : [];
                      const showModelProcess =
                        item.role === "assistant" &&
                        Boolean(thinkingSection || toolCards.length > 0 || approvalCards.length > 0) &&
                        (
                          item.status === "running" ||
                          thinkingSection?.status === "running" ||
                          Boolean(thinkingSection?.items.length) ||
                          toolCards.length > 0 ||
                          approvalCards.length > 0
                        );
                      const modelProcessSection = thinkingSection || toolOnlyTraceSection(item.turnId, toolCards, approvalCards);
                      const traceExpanded = modelProcessSection
                        ? expandedTraceTurns[modelProcessSection.turnId] ?? defaultTurnTraceExpanded(modelProcessSection, approvalCards)
                        : false;
                      const messageStatus = (item.status as "running" | "completed" | "error" | "idle") || "completed";
                      return (
                        <Message key={item.id} id={item.id} role={item.role as "user" | "assistant" | "system"} status={messageStatus} isEmpty={isEmpty}>
                          {showModelProcess && modelProcessSection ? (
                            <TurnTracePanel
                              expanded={traceExpanded}
                              section={modelProcessSection}
                              toolCards={toolCards}
                              approvals={approvalCards}
                              tokenUsage={item.turnId ? tokenUsageByTurn[item.turnId] : undefined}
                              onToggle={() => toggleThinkingTrace(modelProcessSection, approvalCards)}
                              onResolveApproval={resolveApproval}
                            />
                          ) : null}
                          {displayContent.trim() || (item.images && item.images.length > 0) ? (
                            <MessageBody>
                              {displayContent.trim() ? (
                                <MarkdownRenderer content={displayContent} streaming={item.status === "running"} />
                              ) : null}
                              {item.images && item.images.length > 0 ? (
                                <MessageImageGrid images={item.images} />
                              ) : null}
                            </MessageBody>
                          ) : null}
                          {showUserActions ? (
                            <MessageActions>
                              <IconButton
                                className="message-action-button"
                                label="复制消息"
                                onClick={() => void copyMessageContent(item)}
                              >
                                <Copy size={13} />
                              </IconButton>
                              <IconButton
                                className="message-action-button"
                                disabled={messageActionsDisabled}
                                label="编辑并重试"
                                onClick={() => openRetryEditor(item)}
                              >
                                <Pencil size={13} />
                              </IconButton>
                            </MessageActions>
                          ) : null}
                          {showAssistantActions ? (
                            <MessageActions>
                              <IconButton
                                className="message-action-button"
                                label="复制消息"
                                onClick={() => void copyMessageContent(item)}
                              >
                                <Copy size={13} />
                              </IconButton>
                              <IconButton
                                className="message-action-button"
                                disabled={messageActionsDisabled}
                                label="从这里分叉"
                                onClick={() => void forkThreadFromItem(item)}
                              >
                                <GitBranch size={13} />
                              </IconButton>
                            </MessageActions>
                          ) : null}
                        </Message>
                      );
                    })}
                  </>
                )}
                <ConversationScrollButton />
              </Conversation>

              <AgentComposer
                ref={composerRef}
                activeModelDisplayName={activeModel?.displayName || "Model"}
                modelKeyMissing={modelKeyMissing}
                permissionView={permissionView}
                queueLength={detail?.queue.length || 0}
                threadId={threadId}
                workspaceId={workspaceId}
                isRunning={activeThread?.status === "running"}
                skills={skills}
                onAttachFilesActivity={pushActivity}
                onInterrupt={interrupt}
                onModelSettingsOpen={openModelSettings}
                onPermissionModeChange={setPermissionMode}
                onSubmit={sendMessage}
              />
              <TerminalPanel
                rootPath={activeWorkspace?.rootPath}
                workspaceName={activeWorkspace?.name}
                visible={terminalVisible}
                onToggle={() => setTerminalVisible(false)}
              />
              </div>
              <ResizeHandle onResize={handlePreviewResize} />
              <div className="agent-main-preview">
                <PreviewPanel
                  file={previewFile}
                  diff={null}
                  onClose={handlePreviewClose}
                />
              </div>
            </div>
          ) : previewOpen && previewFile ? (
            <div className="agent-main-with-preview">
              <div className="agent-main-chat">
                <Conversation
                  className={visibleItems.length === 0 ? "is-empty-home" : ""}
                >
                  {visibleItems.length === 0 ? (
                    <AgentEmptyState
                      activeWorkspace={activeWorkspace}
                      threadReady={Boolean(threadId)}
                      onPickSuggestion={(suggestion) => composerRef.current?.setComposer(suggestion)}
                      onCreateWorkspace={openCreateWorkspace}
                    />
                  ) : (
                  <>
                    {visibleItems.map((item) => {
                      const assistantDisplay = assistantDisplayParts(item);
                      const displayContent = item.role === "assistant" ? assistantDisplay.content : userDisplayContent(item.content);
                      const isEmpty = !displayContent.trim();
                      const messageActionsDisabled = activeThread?.status === "running";
                      const hasCopyableMessage = displayContent.trim().length > 0;
                      const showUserActions = item.role === "user" && hasCopyableMessage;
                      const showAssistantActions = item.role === "assistant" && hasCopyableMessage;
                      const turnToolCalls = item.turnId ? toolCallsByTurn.get(item.turnId) || [] : [];
                      const approvalCards = turnApprovalsForToolCalls(pendingApprovals, turnToolCalls);
                      const progressNotes = item.turnId
                        ? [...(progressNotesByTurn.get(item.turnId) || []), ...assistantDisplay.progressNotes]
                        : assistantDisplay.progressNotes;
                      const thinkingSection = thinkingTraceSectionForTurn({
                        traceByTurn: thinkingTraceByTurn,
                        turnId: item.turnId,
                        turn: item.turnId ? turnsById.get(item.turnId) : undefined,
                        toolCalls: turnToolCalls,
                        progressNotes,
                      });
                      const toolCards = item.role === "assistant"
                        ? buildToolTraceCardsForTurn({
                          traceByTurn: toolTraceByTurn,
                          turnId: item.turnId,
                          toolCalls: turnToolCalls,
                          toolCallEvents: item.turnId ? toolCallEventsByTurn.get(item.turnId) || [] : [],
                        })
                        : [];
                      const showModelProcess =
                        item.role === "assistant" &&
                        Boolean(thinkingSection || toolCards.length > 0 || approvalCards.length > 0) &&
                        (
                          item.status === "running" ||
                          thinkingSection?.status === "running" ||
                          Boolean(thinkingSection?.items.length) ||
                          toolCards.length > 0 ||
                          approvalCards.length > 0
                        );
                      const modelProcessSection = thinkingSection || toolOnlyTraceSection(item.turnId, toolCards, approvalCards);
                      const traceExpanded = modelProcessSection
                        ? expandedTraceTurns[modelProcessSection.turnId] ?? defaultTurnTraceExpanded(modelProcessSection, approvalCards)
                        : false;
                      const messageStatus = (item.status as "running" | "completed" | "error" | "idle") || "completed";
                      return (
                        <Message key={item.id} id={item.id} role={item.role as "user" | "assistant" | "system"} status={messageStatus} isEmpty={isEmpty}>
                          {showModelProcess && modelProcessSection ? (
                            <TurnTracePanel
                              expanded={traceExpanded}
                              section={modelProcessSection}
                              toolCards={toolCards}
                              approvals={approvalCards}
                              tokenUsage={item.turnId ? tokenUsageByTurn[item.turnId] : undefined}
                              onToggle={() => toggleThinkingTrace(modelProcessSection, approvalCards)}
                              onResolveApproval={resolveApproval}
                            />
                          ) : null}
                          {displayContent.trim() || (item.images && item.images.length > 0) ? (
                            <MessageBody>
                              {displayContent.trim() ? (
                                <MarkdownRenderer content={displayContent} streaming={item.status === "running"} />
                              ) : null}
                              {item.images && item.images.length > 0 ? (
                                <MessageImageGrid images={item.images} />
                              ) : null}
                            </MessageBody>
                          ) : null}
                          {showUserActions ? (
                            <MessageActions>
                              <IconButton
                                className="message-action-button"
                                label="复制消息"
                                onClick={() => void copyMessageContent(item)}
                              >
                                <Copy size={13} />
                              </IconButton>
                              <IconButton
                                className="message-action-button"
                                disabled={messageActionsDisabled}
                                label="编辑并重试"
                                onClick={() => openRetryEditor(item)}
                              >
                                <Pencil size={13} />
                              </IconButton>
                            </MessageActions>
                          ) : null}
                          {showAssistantActions ? (
                            <MessageActions>
                              <IconButton
                                className="message-action-button"
                                label="复制消息"
                                onClick={() => void copyMessageContent(item)}
                              >
                                <Copy size={13} />
                              </IconButton>
                              <IconButton
                                className="message-action-button"
                                disabled={messageActionsDisabled}
                                label="从这里分叉"
                                onClick={() => void forkThreadFromItem(item)}
                              >
                                <GitBranch size={13} />
                              </IconButton>
                            </MessageActions>
                          ) : null}
                        </Message>
                      );
                    })}
                  </>
                )}
                <ConversationScrollButton />
              </Conversation>

              <AgentComposer
                ref={composerRef}
                activeModelDisplayName={activeModel?.displayName || "Model"}
                modelKeyMissing={modelKeyMissing}
                permissionView={permissionView}
                queueLength={detail?.queue.length || 0}
                threadId={threadId}
                workspaceId={workspaceId}
                isRunning={activeThread?.status === "running"}
                skills={skills}
                onAttachFilesActivity={pushActivity}
                onInterrupt={interrupt}
                onModelSettingsOpen={openModelSettings}
                onPermissionModeChange={setPermissionMode}
                onSubmit={sendMessage}
              />
              <TerminalPanel
                rootPath={activeWorkspace?.rootPath}
                workspaceName={activeWorkspace?.name}
                visible={terminalVisible}
                onToggle={() => setTerminalVisible(false)}
              />
              </div>
              <ResizeHandle onResize={handlePreviewResize} />
              <div className="agent-main-preview">
                <PreviewPanel
                  file={previewFile}
                  diff={null}
                  onClose={handlePreviewClose}
                />
              </div>
            </div>
          ) : (
            <>
              <Conversation
                className={visibleItems.length === 0 ? "is-empty-home" : ""}
              >
                {visibleItems.length === 0 ? (
                  <AgentEmptyState
                    activeWorkspace={activeWorkspace}
                    threadReady={Boolean(threadId)}
                    onPickSuggestion={(suggestion) => composerRef.current?.setComposer(suggestion)}
                    onCreateWorkspace={openCreateWorkspace}
                  />
                ) : (
                  <>
                    {visibleItems.map((item) => {
                      const assistantDisplay = assistantDisplayParts(item);
                      const displayContent = item.role === "assistant" ? assistantDisplay.content : userDisplayContent(item.content);
                      const isEmpty = !displayContent.trim();
                      const messageActionsDisabled = activeThread?.status === "running";
                      const hasCopyableMessage = displayContent.trim().length > 0;
                      const showUserActions = item.role === "user" && hasCopyableMessage;
                      const showAssistantActions = item.role === "assistant" && hasCopyableMessage;
                      const turnToolCalls = item.turnId ? toolCallsByTurn.get(item.turnId) || [] : [];
                      const approvalCards = turnApprovalsForToolCalls(pendingApprovals, turnToolCalls);
                      const progressNotes = item.turnId
                        ? [...(progressNotesByTurn.get(item.turnId) || []), ...assistantDisplay.progressNotes]
                        : assistantDisplay.progressNotes;
                      const thinkingSection = thinkingTraceSectionForTurn({
                        traceByTurn: thinkingTraceByTurn,
                        turnId: item.turnId,
                        turn: item.turnId ? turnsById.get(item.turnId) : undefined,
                        toolCalls: turnToolCalls,
                        progressNotes,
                      });
                      const toolCards = item.role === "assistant"
                        ? buildToolTraceCardsForTurn({
                          traceByTurn: toolTraceByTurn,
                          turnId: item.turnId,
                          toolCalls: turnToolCalls,
                          toolCallEvents: item.turnId ? toolCallEventsByTurn.get(item.turnId) || [] : [],
                        })
                        : [];
                      const showModelProcess =
                        item.role === "assistant" &&
                        Boolean(thinkingSection || toolCards.length > 0 || approvalCards.length > 0) &&
                        (
                          item.status === "running" ||
                          thinkingSection?.status === "running" ||
                          Boolean(thinkingSection?.items.length) ||
                          toolCards.length > 0 ||
                          approvalCards.length > 0
                        );
                      const modelProcessSection = thinkingSection || toolOnlyTraceSection(item.turnId, toolCards, approvalCards);
                      const traceExpanded = modelProcessSection
                        ? expandedTraceTurns[modelProcessSection.turnId] ?? defaultTurnTraceExpanded(modelProcessSection, approvalCards)
                        : false;
                      const messageStatus = (item.status as "running" | "completed" | "error" | "idle") || "completed";
                      return (
                        <Message key={item.id} id={item.id} role={item.role as "user" | "assistant" | "system"} status={messageStatus} isEmpty={isEmpty}>
                          {showModelProcess && modelProcessSection ? (
                            <TurnTracePanel
                              expanded={traceExpanded}
                              section={modelProcessSection}
                              toolCards={toolCards}
                              approvals={approvalCards}
                              tokenUsage={item.turnId ? tokenUsageByTurn[item.turnId] : undefined}
                              onToggle={() => toggleThinkingTrace(modelProcessSection, approvalCards)}
                              onResolveApproval={resolveApproval}
                            />
                          ) : null}
                          {displayContent.trim() || (item.images && item.images.length > 0) ? (
                            <MessageBody>
                              {displayContent.trim() ? (
                                <MarkdownRenderer content={displayContent} streaming={item.status === "running"} />
                              ) : null}
                              {item.images && item.images.length > 0 ? (
                                <MessageImageGrid images={item.images} />
                              ) : null}
                            </MessageBody>
                          ) : null}
                          {showUserActions ? (
                            <MessageActions>
                              <IconButton
                                className="message-action-button"
                                label="复制消息"
                                onClick={() => void copyMessageContent(item)}
                              >
                                <Copy size={13} />
                              </IconButton>
                              <IconButton
                                className="message-action-button"
                                disabled={messageActionsDisabled}
                                label="编辑并重试"
                                onClick={() => openRetryEditor(item)}
                              >
                                <Pencil size={13} />
                              </IconButton>
                            </MessageActions>
                          ) : null}
                          {showAssistantActions ? (
                            <MessageActions>
                              <IconButton
                                className="message-action-button"
                                label="复制消息"
                                onClick={() => void copyMessageContent(item)}
                              >
                                <Copy size={13} />
                              </IconButton>
                              <IconButton
                                className="message-action-button"
                                disabled={messageActionsDisabled}
                                label="从这里分叉"
                                onClick={() => void forkThreadFromItem(item)}
                              >
                                <GitBranch size={13} />
                              </IconButton>
                            </MessageActions>
                          ) : null}
                        </Message>
                      );
                    })}
                  </>
                )}
                <ConversationScrollButton />
              </Conversation>

              <AgentComposer
                ref={composerRef}
                activeModelDisplayName={activeModel?.displayName || "Model"}
                modelKeyMissing={modelKeyMissing}
                permissionView={permissionView}
                queueLength={detail?.queue.length || 0}
                threadId={threadId}
                workspaceId={workspaceId}
                isRunning={activeThread?.status === "running"}
                skills={skills}
                onAttachFilesActivity={pushActivity}
                onInterrupt={interrupt}
                onModelSettingsOpen={openModelSettings}
                onPermissionModeChange={setPermissionMode}
                onSubmit={sendMessage}
              />
              <TerminalPanel
                rootPath={activeWorkspace?.rootPath}
                workspaceName={activeWorkspace?.name}
                visible={terminalVisible}
                onToggle={() => setTerminalVisible(false)}
              />
            </>
          )}
        </section>

        {rightPanelOpen && activeWorkspace ? (
          <>
            <div
              className="agent-right-resize"
              onMouseDown={(e) => {
                e.preventDefault();
                const startX = e.clientX;
                const startWidth = rightPanelWidth;
                document.body.style.cursor = "col-resize";
                document.body.style.userSelect = "none";
                setRightPanelResizing(true);
                const onMove = (ev: MouseEvent) => {
                  const delta = startX - ev.clientX;
                  const next = Math.max(RIGHT_PANEL_MIN_WIDTH, startWidth + delta);
                  setRightPanelWidth(next);
                };
                const onUp = () => {
                  document.body.style.cursor = "";
                  document.body.style.userSelect = "";
                  setRightPanelResizing(false);
                  document.removeEventListener("mousemove", onMove);
                  document.removeEventListener("mouseup", onUp);
                };
                document.addEventListener("mousemove", onMove);
                document.addEventListener("mouseup", onUp);
              }}
            />
            <RightPanel
              rootPath={activeWorkspace.rootPath}
              width={rightPanelWidth}
              resizing={rightPanelResizing}
              onClose={() => {
                setRightPanelOpen(false);
                localStorage.setItem("any-jumper-right-panel-open", "false");
              }}
            />
          </>
        ) : null}
        </div>

        <ModelSettingsDialog
          activeModel={activeModel}
          modelKeyMissing={modelKeyMissing}
          open={modelSettingsOpen}
          providerOptions={sessionProviderOptions}
          selectedModel={selectedModel}
          selectedProvider={selectedProvider}
          modelOptions={sessionModelOptions}
          onClose={() => setModelSettingsOpen(false)}
          onModelChange={setSelectedModel}
          onProviderChange={(value) => {
            setSelectedProvider(value);
            const model = models.find((item) => item.id === value);
            if (model) setSelectedModel(model.defaultModel);
          }}
        />

        <Dialog open={workspaceModalOpen} onOpenChange={setWorkspaceModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingWorkspace ? "编辑工作区" : "新建工作区"}</DialogTitle>
              <DialogDescription>选择本地项目后，Any Jumper 会在这里保存会话、工具调用和工作区上下文。</DialogDescription>
            </DialogHeader>
            <div className="dialog-form-stack">
              <label className="field-stack">
                <span>名称</span>
                <Input
                  value={workspaceNameDraft}
                  placeholder="留空则使用目录名"
                  onChange={(event) => setWorkspaceNameDraft(event.target.value)}
                />
              </label>
              <label className="field-stack">
                <span>项目</span>
                <ProjectPicker value={workspaceDraft} onChange={setWorkspaceDraft} />
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setWorkspaceModalOpen(false)}>取消</Button>
              <Button type="button" disabled={savingWorkspace} onClick={() => void saveWorkspace()}>
                {savingWorkspace ? "保存中..." : editingWorkspace ? "保存" : "添加"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(editingItem)} onOpenChange={(open) => !open && setEditingItem(undefined)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>编辑历史消息并重新发起</DialogTitle>
              <DialogDescription>修改这条用户消息后，会基于新内容重新运行一轮。</DialogDescription>
            </DialogHeader>
            <Textarea
              value={editingContent}
              rows={8}
              onChange={(event) => setEditingContent(event.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditingItem(undefined)}>取消</Button>
              <Button type="button" onClick={() => void rerunEdited()}>重新发起</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(renamingThread)} onOpenChange={(open) => !open && setRenamingThread(undefined)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>重命名会话</DialogTitle>
              <DialogDescription>清晰的名称会让左侧会话列表更容易扫描。</DialogDescription>
            </DialogHeader>
            <Input
              value={threadTitleDraft}
              autoFocus
              maxLength={60}
              placeholder="输入会话名称"
              onChange={(event) => setThreadTitleDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveThreadName();
              }}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRenamingThread(undefined)}>取消</Button>
              <Button type="button" disabled={savingThreadTitle} onClick={() => void saveThreadName()}>
                {savingThreadTitle ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(confirmAction)} onOpenChange={(open) => !open && setConfirmAction(undefined)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{confirmAction?.title}</DialogTitle>
              <DialogDescription>{confirmAction?.description}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setConfirmAction(undefined)}>取消</Button>
              <Button
                type="button"
                variant={confirmAction?.destructive ? "destructive" : "default"}
                onClick={() => {
                  const action = confirmAction;
                  setConfirmAction(undefined);
                  void action?.onConfirm();
                }}
              >
                {confirmAction?.confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

function IconButton({
  label,
  children,
  size = "icon",
  variant = "ghost",
  ...props
}: ButtonProps & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} size={size} type="button" variant={variant} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function MiniEmpty({ label }: { label: string }) {
  return (
    <div className="mini-empty">
      <Info size={14} />
      <span>{label}</span>
    </div>
  );
}

function AgentEmptyState({
  activeWorkspace,
  threadReady,
  onPickSuggestion,
  onCreateWorkspace,
}: {
  activeWorkspace?: Workspace;
  threadReady: boolean;
  onPickSuggestion: (prompt: string) => void;
  onCreateWorkspace: () => void;
}) {
  const suggestions = [
    "总结当前项目结构",
    "检查最近变更风险",
    "帮我规划下一步实现",
  ];
  return (
    <EmptyState
      icon={<MessageSquare size={28} />}
      title={activeWorkspace ? `准备处理「${activeWorkspace.name}」` : "先添加一个工作区"}
      description={
        activeWorkspace
          ? "描述目标、贴上错误，或添加文件上下文。"
          : "选择本地项目后，就可以开始会话、查看 Git 状态和调用工具。"
      }
    >
      {activeWorkspace ? (
        suggestions.map((suggestion) => (
          <Button
            key={suggestion}
            type="button"
            variant="outline"
            disabled={!threadReady}
            onClick={() => onPickSuggestion(suggestion)}
          >
            <FilePlus2 size={15} />
            {suggestion}
          </Button>
        ))
      ) : (
        <Button type="button" onClick={onCreateWorkspace}>
          <FolderOpen size={15} />
          添加工作区
        </Button>
      )}
    </EmptyState>
  );
}

interface AgentComposerProps {
  activeModelDisplayName: string;
  modelKeyMissing: boolean;
  permissionView: ReturnType<typeof permissionDisplay>;
  queueLength: number;
  threadId?: string;
  workspaceId?: string;
  isRunning: boolean;
  skills: SkillSummary[];
  onAttachFilesActivity: AgentPageProps["pushActivity"];
  onInterrupt: () => Promise<void>;
  onModelSettingsOpen: () => void;
  onPermissionModeChange: (mode: PermissionMode) => void;
  onSubmit: (input: string, images: ImageAttachment[]) => Promise<boolean>;
}

const AgentComposer = memo(forwardRef<AgentComposerHandle, AgentComposerProps>(function AgentComposer({
  activeModelDisplayName,
  modelKeyMissing,
  permissionView,
  queueLength,
  threadId,
  workspaceId,
  isRunning,
  skills,
  onAttachFilesActivity,
  onInterrupt,
  onModelSettingsOpen,
  onPermissionModeChange,
  onSubmit,
}, ref) {
  const [composer, setComposer] = useState("");
  const [attachedImages, setAttachedImages] = useState<ImageAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [interrupting, setInterrupting] = useState(false);
  const slashSuggestionItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const richComposerRef = useRef<RichComposerHandle>(null);

  useImperativeHandle(ref, () => ({ setComposer }), []);

  // ---- 斜杠命令提示浮层 ----
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const suggestions = useMemo(() => {
    if (!isSlashActive(composer)) return [];
    return getCandidates(composer);
  }, [composer, skills]);
  const showSuggestions = isSlashActive(composer) && suggestions.length > 0;

  useEffect(() => {
    if (!showSuggestions) return;
    slashSuggestionItemRefs.current[selectedSuggestionIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedSuggestionIndex, showSuggestions]);

  useEffect(() => {
    slashSuggestionItemRefs.current = slashSuggestionItemRefs.current.slice(0, suggestions.length);
  }, [suggestions.length]);

  function applySuggestion(cmd: SlashCommand) {
    setSelectedSuggestionIndex(0);
    setComposer("");
    void submitDirect(`/${cmd.trigger}`, []);
  }

  function completeSuggestion(cmd: SlashCommand) {
    setSelectedSuggestionIndex(0);
    setComposer(`/${cmd.trigger} `);
  }

  /** 提交直接消息（跳过斜杠命令检查和输入框状态） */
  async function submitDirect(input: string, images: ImageAttachment[]) {
    // 通过 props 的 onSubmit 走，但需要先设 sending
    if (!threadId || sending) return;
    setSending(true);
    try {
      await onSubmit(input, images);
    } finally {
      setSending(false);
    }
  }

  const actionDisabled = isRunning
    ? !threadId || interrupting
    : !threadId || (!composer.trim() && attachedImages.length === 0) || sending;

  async function submitComposer() {
    if (!threadId || (!composer.trim() && attachedImages.length === 0) || sending) return;
    const input = composer;
    const images = attachedImages;
    setSending(true);
    setComposer("");
    setAttachedImages([]);
    try {
      const submitted = await onSubmit(input, images);
      if (!submitted) setAttachedImages(images);
    } finally {
      setSending(false);
    }
  }

  async function runPrimaryAction() {
    if (isRunning) {
      if (!threadId || interrupting) return;
      setInterrupting(true);
      try {
        await onInterrupt();
      } finally {
        setInterrupting(false);
      }
      return;
    }
    await submitComposer();
  }

  async function attachFiles() {
    const files = await desktopApi.pickFiles();
    if (files.length === 0) return;
    const mentions = files.map(formatFileMention).join("\n");
    setComposer((value) => {
      const trimmed = value.trimEnd();
      return trimmed ? `${trimmed}\n${mentions}` : mentions;
    });
    onAttachFilesActivity("添加文件上下文", "success", files.length === 1 ? files[0] : `${files.length} 个文件`);
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = event.clipboardData.files;
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    event.preventDefault();
    for (const file of imageFiles) {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const base64 = result.split(",")[1] || "";
        if (!base64) return;
        setAttachedImages((prev) => [...prev, { mimeType: file.type, data: base64, name: file.name }]);
      };
      reader.readAsDataURL(file);
    }
    onAttachFilesActivity("粘贴图片", "success", imageFiles.length === 1 ? imageFiles[0].name : `${imageFiles.length} 张图片`);
  }

  function removeAttachedImage(index: number) {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <footer className="composer">
      {queueLength ? (
        <div className="queue-strip">
          <span className="queue-dot" /> 已排队 {queueLength} 条输入
        </div>
      ) : null}
      <div className="composer-box">
        {attachedImages.length > 0 ? (
          <div className="composer-image-preview-row">
            {attachedImages.map((image, index) => (
              <div className="composer-image-preview" key={index}>
                <img src={`data:${image.mimeType};base64,${image.data}`} alt={image.name || `图片 ${index + 1}`} />
                <button
                  className="composer-image-remove"
                  type="button"
                  aria-label="移除图片"
                  onClick={() => removeAttachedImage(index)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        {showSuggestions ? (
          <div className="slash-command-popover" role="listbox" aria-label="斜杠命令">
            {suggestions.map((candidate, i) => {
              const cmd = candidate.command;
              return (
                <button
                  key={cmd.id}
                  className={`slash-command-item ${i === selectedSuggestionIndex ? "is-selected" : ""}`}
                  type="button"
                  role="option"
                  aria-selected={i === selectedSuggestionIndex}
                  ref={(node) => { slashSuggestionItemRefs.current[i] = node; }}
                  onMouseDown={(e) => { e.preventDefault(); applySuggestion(cmd); }}
                >
                  <span className="slash-command-name">/{cmd.trigger}</span>
                  <span className="slash-command-label">{cmd.label}</span>
                  <span className="slash-command-category">{cmd.group === "builtin" ? "内建" : "skill"}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        <RichComposer
          ref={richComposerRef}
          content={composer}
          placeholder="输入下一步要求（输入 / 查看命令）"
          onContentChange={(text) => {
            setComposer(text);
            setSelectedSuggestionIndex(0);
          }}
          onEnter={() => {
            if (showSuggestions) {
              if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
                applySuggestion(suggestions[selectedSuggestionIndex].command);
              }
              return;
            }
            void submitComposer();
          }}
          onKeyDown={(event) => {
            if (showSuggestions) {
              if (event.key === "Tab") {
                event.preventDefault();
                if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < suggestions.length) {
                  completeSuggestion(suggestions[selectedSuggestionIndex].command);
                }
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedSuggestionIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedSuggestionIndex((prev) => Math.max(prev - 1, 0));
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setComposer("");
                return;
              }
            }
          }}
        />
        <div className="composer-actions">
          <div className="composer-left-actions">
            <IconButton label="添加文件上下文" onClick={() => void attachFiles()}>
              <Plus size={16} />
            </IconButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className={`composer-permission-chip ${permissionView.className}`} type="button" variant="ghost">
                  {permissionView.icon}
                  {permissionView.label}
                  <ChevronDown size={13} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {permissionOptions.map((option) => {
                  const view = permissionDisplay(option.value);
                  return (
                    <DropdownMenuItem key={option.value} onSelect={() => onPermissionModeChange(option.value as PermissionMode)}>
                      {view.icon}
                      {option.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              className={`composer-model-chip ${modelKeyMissing ? "is-warning" : ""}`}
              type="button"
              variant="ghost"
              onClick={onModelSettingsOpen}
            >
              <Bot size={15} />
              {activeModelDisplayName}
              {modelKeyMissing ? <Badge tone="danger">Key</Badge> : null}
            </Button>
            <IconButton label="在新窗口打开当前会话" onClick={() => void desktopApi.workspaceOpenWindow(workspaceId, threadId)}>
              <Maximize2 size={16} />
            </IconButton>
          </div>
          <Button
            aria-label={isRunning ? "停止会话" : sending ? "正在发送" : "发送消息"}
            className="composer-send-button"
            type="button"
            size="icon"
            variant={isRunning ? "destructive" : "default"}
            disabled={actionDisabled}
            onClick={() => void runPrimaryAction()}
          >
            {isRunning ? <StopCircle size={17} /> : sending ? <RefreshCw className="is-spinning" size={17} /> : <Send size={17} />}
          </Button>
        </div>
      </div>
    </footer>
  );
}));

AgentComposer.displayName = "AgentComposer";

function BridgeMainPanel({
  status,
  onClearLogs,
  onCopyExample,
  onRestart,
}: {
  status?: AgentBridgeStatus;
  onClearLogs: () => void;
  onCopyExample: () => void;
  onRestart: () => void;
}) {
  const logs = status?.logs || [];
  const statusTone = !status
    ? "muted"
    : status.listening && status.extensionCount > 0
      ? "success"
      : status.listening
        ? "warning"
        : "danger";
  const statusLabel = !status
    ? "读取中"
    : status.listening
      ? "服务运行中"
      : "服务未启动";
  const extensionLabel = status?.extensionCount
    ? `${status.extensionCount} 个扩展已连接`
    : "无扩展连接";

  return (
    <div className="bridge-main-panel panel-stack bridge-main-stack">
      <BridgeSection title="Agent Bridge" icon={<TerminalSquare size={15} />}>
        <div className="bridge-toolbar">
          <Button size="sm" type="button" variant="outline" onClick={onRestart}>
            <RefreshCw size={14} /> 重启服务
          </Button>
          <Button size="sm" type="button" variant="outline" onClick={onCopyExample}>
            <Copy size={14} /> 复制调用示例
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={onClearLogs}>
            <Trash2 size={14} /> 清空日志
          </Button>
        </div>
        <div className="bridge-health-grid">
          <BridgeMetric label="服务状态" value={<Badge tone={statusTone}>{statusLabel}</Badge>} />
          <BridgeMetric label="扩展连接" value={<Badge tone={status?.extensionCount ? "success" : "muted"}>{extensionLabel}</Badge>} />
          <BridgeMetric label="监听地址" value={<code>{status?.endpoint || "http://127.0.0.1:9528"}</code>} />
          <BridgeMetric label="请求总数" value={status?.requestCount ?? 0} />
          <BridgeMetric label="错误总数" value={status?.errorCount ?? 0} />
          <BridgeMetric label="最近连接" value={formatBridgeTime(status?.lastConnectedAt)} />
          <BridgeMetric label="最近心跳" value={formatBridgeTime(status?.lastHeartbeatAt)} />
          <BridgeMetric label="最近错误" value={status?.lastError || "-"} wide />
        </div>
      </BridgeSection>

      <BridgeSection title="桥接日志" icon={<History size={15} />} meta={<Badge tone="muted">{logs.length}</Badge>}>
        {logs.length === 0 ? (
          <MiniEmpty label="暂无日志" />
        ) : (
          <div className="bridge-log-list">
            {[...logs].reverse().map((log) => (
              <div className={`bridge-log-entry is-${log.level}`} key={log.id}>
                <span className="bridge-log-meta">
                  <Badge tone={bridgeLogTone(log.level)}>{log.level}</Badge>
                  <time>{formatBridgeTime(log.createdAt)}</time>
                </span>
                <strong>{log.message}</strong>
                {log.detail ? <code>{log.detail}</code> : null}
              </div>
            ))}
          </div>
        )}
      </BridgeSection>
    </div>
  );
}

function BridgeMetric({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`bridge-metric ${wide ? "is-wide" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BridgeSection({
  title,
  icon,
  children,
  collapsible = false,
  defaultOpen = true,
  meta,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  meta?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const titleContent = (
    <span className="panel-section-title">
      {icon}
      <span>{title}</span>
    </span>
  );

  if (collapsible) {
    return (
      <section className={`panel-section is-collapsible ${open ? "is-open" : "is-collapsed"}`}>
        <button
          className="panel-section-trigger"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {titleContent}
          <span className="panel-section-actions">
            {meta}
            <ChevronDown className="panel-section-collapse-icon" size={15} />
          </span>
        </button>
        {open ? <div className="panel-section-body">{children}</div> : null}
      </section>
    );
  }

  return (
    <section className="panel-section">
      <div className="panel-section-head-inline">
        {titleContent}
        {meta ? <span className="panel-section-actions">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

function ModelSettingsDialog({
  activeModel,
  modelKeyMissing,
  modelOptions,
  open,
  providerOptions,
  selectedModel,
  selectedProvider,
  onClose,
  onModelChange,
  onProviderChange,
}: {
  activeModel?: ModelConfig;
  modelKeyMissing: boolean;
  modelOptions: Array<{ label: string; value: string }>;
  open: boolean;
  providerOptions: Array<{ label: string; value: string }>;
  selectedModel: string;
  selectedProvider: string;
  onClose: () => void;
  onModelChange: (value: string) => void;
  onProviderChange: (value: string) => void;
}) {
  const [draftProvider, setDraftProvider] = useState(selectedProvider);
  const [draftModel, setDraftModel] = useState(selectedModel);

  // Reset drafts when dialog opens with new values
  useEffect(() => {
    if (open) {
      setDraftProvider(selectedProvider);
      setDraftModel(selectedModel);
    }
  }, [open, selectedProvider, selectedModel]);

  function handleConfirm() {
    onProviderChange(draftProvider);
    onModelChange(draftModel);
    onClose();
  }

  function handleCancel() {
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Switch Model</DialogTitle>
          <DialogDescription>
            Runtime uses DeepAgents; Provider and API Key are managed in Model Config.
          </DialogDescription>
        </DialogHeader>
        {modelKeyMissing ? (
          <div className="inline-alert is-warning">
            <ShieldAlert size={16} />
            <div>
              <strong>API Key missing</strong>
              <span>Save your API Key in Model Config. Keys are stored in local encrypted storage.</span>
            </div>
          </div>
        ) : null}
        <div className="dialog-form-stack">
          <label className="field-stack">
            <span>Provider</span>
            <Select
              value={draftProvider}
              options={providerOptions}
              onChange={(event) => setDraftProvider(event.target.value)}
            />
          </label>
          <label className="field-stack">
            <span>Model</span>
            <Select
              className="mono-select"
              value={draftModel}
              options={modelOptions}
              onChange={(event) => setDraftModel(event.target.value)}
            />
          </label>
          <div className="model-current-row">
            <Bot size={15} />
            <span>{activeModel?.displayName || "Model"}</span>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={handleCancel}>Cancel</Button>
          <Button type="button" onClick={handleConfirm}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function permissionDisplay(value: PermissionMode | string): {
  label: string;
  className: string;
  icon: ReactNode;
} {
  if (value === "readOnly") {
    return {
      label: "默认权限",
      className: "is-default",
      icon: <Square size={14} />,
    };
  }
  if (value === "fullAccess") {
    return {
      label: "完全访问权限",
      className: "is-full",
      icon: <ShieldAlert size={14} />,
    };
  }
  return {
    label: "自动审查",
    className: "is-auto",
    icon: <Shield size={14} />,
  };
}

function assistantDisplayParts(item: AgentItem): {
  content: string;
  progressNotes: ThreadDetail["progressNotes"];
} {
  if (item.role !== "assistant" || !item.content.trim()) {
    return { content: item.content, progressNotes: [] };
  }

  const stripped = stripProgressChatter(item.content);
  if (stripped.notes.length === 0 && stripped.content === item.content) {
    return { content: item.content, progressNotes: [] };
  }

  const progressNotes = item.status === "running"
    ? stripped.notes.map((content, index) => ({
        id: `live-progress:${item.id}:${index}`,
        threadId: item.threadId,
        turnId: item.turnId,
        kind: "progress" as const,
        content,
        status: "running" as const,
        createdAt: item.createdAt + index,
      }))
    : [];

  return {
    content: stripped.content,
    progressNotes,
  };
}

function userDisplayContent(content: string) {
  return displaySkillPrompt(content);
}

function parseSkillSlashArgs(args: string) {
  const normalized = args.trim();
  if (!normalized || normalized === "list") return { action: "list" as const, skillName: "", instruction: "" };
  const runMatch = normalized.match(/^run(?:\s+(.+))?$/u);
  if (!runMatch) return { action: "list" as const, skillName: "", instruction: "" };

  const rest = (runMatch[1] || "").trim();
  const [skillName = "", ...instructionParts] = rest.split(/\s+/u);
  return {
    action: "run" as const,
    skillName,
    instruction: instructionParts.join(" ").trim(),
  };
}

function findSkillByName(skills: SkillSummary[], name: string) {
  const normalized = name.trim().toLowerCase();
  return skills.find((skill) => skill.name.toLowerCase() === normalized)
    || skills.find((skill) => skill.id.toLowerCase().endsWith(`:${normalized}`));
}

function buildSkillRunPrompt(skill: SkillSummary, skillMarkdown: string, instruction: string) {
  const userRequest = instruction.trim()
    || `请按 Skill「${skill.name}」的说明判断是否适用，并继续推进当前任务；如果缺少必要输入，请直接向我提问。`;
  return [
    `请使用 Skill「${skill.name}」处理下面的用户请求。`,
    "",
    `用户请求：${userRequest}`,
    "",
    "执行要求：",
    "1. 先阅读并遵循下面的 SKILL.md。",
    "2. 如果这个 Skill 不适用，请说明原因，不要硬套。",
    "3. 最终回答只输出结果和必要说明，不要复述完整 SKILL.md。",
    "",
    `<SKILL name="${skill.name}" path="${skill.path}">`,
    "```markdown",
    skillMarkdown,
    "```",
    "</SKILL>",
  ].join("\n");
}

function messageRoleClass(role: string) {
  if (role === "user" || role === "assistant" || role === "system") return role;
  return "assistant";
}

function messageStatusClass(status: string) {
  return status.replace(/[^a-z0-9_-]/gi, "-").toLowerCase() || "unknown";
}

function threadStatusLabel(status?: string) {
  if (status === "running") return "运行中";
  if (status === "completed") return "已完成";
  if (status === "error") return "异常";
  if (status === "queued") return "排队中";
  if (status === "interrupted" || status === "cancelled" || status === "canceled") return "已停止";
  if (status === "idle" || !status) return "空闲";
  return status;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天`;
  const months = Math.floor(days / 30);
  return `${months} 月`;
}

function bridgeStatusLabel(status?: AgentBridgeStatus) {
  if (!status) return "读取中";
  if (!status.listening) return "服务未启动";
  if (status.extensionCount > 0) return "已连接";
  return "等待扩展";
}

function bridgeStatusTone(status?: AgentBridgeStatus): "default" | "success" | "warning" | "danger" | "muted" {
  if (!status) return "muted";
  if (!status.listening) return "danger";
  if (status.extensionCount > 0) return "success";
  return "warning";
}

function bridgeLogTone(level: string): "default" | "success" | "warning" | "danger" | "muted" {
  if (level === "success") return "success";
  if (level === "warning") return "warning";
  if (level === "error") return "danger";
  if (level === "info") return "muted";
  return "default";
}

function formatBridgeTime(value?: number) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function formatFileMention(filePath: string) {
  return `@"${filePath.replaceAll('"', '\\"')}"`;
}

function preferredModel(models: ModelConfig[]) {
  return models.find((model) => model.providerKind !== "mock" && (model.providerKind === "ollama" || model.hasApiKey)) || models[0];
}

function findThreadById(threadsByWorkspaceId: Record<string, AgentThread[]>, targetThreadId?: string) {
  if (!targetThreadId) return undefined;
  for (const threads of Object.values(threadsByWorkspaceId)) {
    const thread = threads.find((item) => item.id === targetThreadId);
    if (thread) return thread;
  }
  return undefined;
}

function hasLoadedThreadsForWorkspace(threadsByWorkspaceId: Record<string, AgentThread[]>, workspaceId: string) {
  return Object.prototype.hasOwnProperty.call(threadsByWorkspaceId, workspaceId);
}

function upsertThreadInMap(
  threadsByWorkspaceId: Record<string, AgentThread[]>,
  nextThread: AgentThread,
) {
  const workspaceThreads = threadsByWorkspaceId[nextThread.workspaceId] || [];
  const exists = workspaceThreads.some((thread) => thread.id === nextThread.id);
  const nextThreads = exists
    ? workspaceThreads.map((thread) => (thread.id === nextThread.id ? nextThread : thread))
    : [nextThread, ...workspaceThreads];
  return { ...threadsByWorkspaceId, [nextThread.workspaceId]: nextThreads };
}

function shouldAutoNameThread(title?: string) {
  const normalized = (title || "").trim().toLowerCase();
  return !normalized || normalized === "new session" || normalized === "untitled" || normalized === "新会话";
}

function summarizeThreadTitle(input: string) {
  const cleaned = input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/@"[^"]+"/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[>#*_~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "新会话";
  const firstSentence = cleaned.split(/[。！？!?；;]/).find((part) => part.trim())?.trim() || cleaned;
  const withoutPolitePrefix = firstSentence
    .replace(/^(请|帮我|帮忙|麻烦|可以|能不能|能否|请你)\s*/u, "")
    .trim();
  const title = withoutPolitePrefix || firstSentence;
  const chars = Array.from(title);
  return chars.length > 28 ? `${chars.slice(0, 28).join("")}...` : title;
}

function turnApprovalsForToolCalls(approvals: Approval[], toolCalls: ToolCall[]) {
  const toolCallIds = new Set(toolCalls.map((toolCall) => toolCall.id));
  return approvals.filter((approval) => toolCallIds.has(approval.toolCallId));
}

function defaultTurnTraceExpanded(section: ThinkingTraceSection, approvals: Approval[] = []) {
  return section.status === "error" || approvals.length > 0;
}

function toolOnlyTraceSection(
  turnId: string | undefined,
  toolCards: ToolTraceCardModel[],
  approvals: Approval[] = [],
): ThinkingTraceSection | undefined {
  if (!turnId || (toolCards.length === 0 && approvals.length === 0)) return undefined;
  const hasActiveTool = toolCards.some((card) => ["pending", "running", "waiting_approval"].includes(card.status));
  const hasFailedTool = toolCards.some((card) => ["error", "cancelled", "rejected"].includes(card.status));
  const startedAtValues = toolCards.map((card) => card.startedAt).filter((value): value is number => typeof value === "number");
  const completedAtValues = toolCards.map((card) => card.completedAt).filter((value): value is number => typeof value === "number");
  return {
    turnId,
    status: approvals.length > 0 || hasActiveTool ? "running" : hasFailedTool ? "error" : "completed",
    startedAt: startedAtValues.length > 0 ? Math.min(...startedAtValues) : undefined,
    completedAt: completedAtValues.length > 0 ? Math.max(...completedAtValues) : undefined,
    summary: "",
    items: [],
  };
}

type TurnTraceRow =
  | {
    type: "thought";
    id: string;
    kind: ThinkingTraceItem["kind"];
    status: ThinkingTraceItem["status"];
    label: string;
    title: string;
    detail?: string;
    createdAt?: number;
  }
  | {
    type: "tool";
    id: string;
    status: ToolTraceCardModel["status"];
    kind: ToolTraceCardModel["kind"];
    label: string;
    detail?: string;
    outputPreview?: string;
    progress: string[];
    createdAt?: number;
    completedAt?: number;
  }
  | {
    type: "approval";
    id: string;
    status: ToolTraceCardModel["status"];
    label: string;
    title: string;
    detail?: string;
    approval: Approval;
    createdAt?: number;
  };

function TurnTracePanel({
  section,
  toolCards = [],
  approvals = [],
  tokenUsage,
  expanded,
  onToggle,
  onResolveApproval,
}: {
  section: ThinkingTraceSection;
  toolCards?: ToolTraceCardModel[];
  approvals?: Approval[];
  tokenUsage?: TurnTokenUsage;
  expanded: boolean;
  onToggle: () => void;
  onResolveApproval: (approval: Approval, decision: string) => Promise<void>;
}) {
  const rawItems = section.items.length > 0
    ? section.items
    : toolCards.length > 0 || approvals.length > 0
      ? []
      : [{ id: "fallback", kind: "task" as const, title: "等待模型响应", status: "running" as const }];
  const processItems = toolCards.length > 0
    ? rawItems.filter((item) => item.kind !== "tool")
    : rawItems;
  const compactItems = compactModelProcessItems(processItems, TRACE_THOUGHT_VISIBLE_LIMIT);
  const timelineRows = composeTurnTraceRows(compactItems.items, toolCards, approvals);
  const headline = thinkingTraceHeadline(section);
  const summary = [
    section.summary,
    !section.summary && toolCards.length > 0 ? `工具 ${toolCards.length} 个` : "",
    approvals.length > 0 ? `审批 ${approvals.length} 个` : "",
  ].filter(Boolean).join(" · ");
  const traceCardRef = useRef<HTMLDivElement>(null);
  const [tracePinnedToBottom, setTracePinnedToBottom] = useState(true);
  const [showTraceJump, setShowTraceJump] = useState(false);
  const [expandedTimelineRows, setExpandedTimelineRows] = useState<Record<string, boolean>>({});
  const traceContentSignature = useMemo(() => [
    section.status,
    headline,
    summary,
    timelineRows.map((row) => [
      row.id,
      row.type,
      row.status,
      row.label.length,
      row.type === "thought" ? row.kind : "",
      row.type === "thought" ? row.title.length : 0,
      row.detail?.length || 0,
      row.type === "tool" ? row.outputPreview?.length || 0 : 0,
    ].join(":")).join("|"),
  ].join("::"), [headline, section.status, summary, timelineRows]);

  const handleTraceScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const pinned = isNearScrollBottom(event.currentTarget);
    setTracePinnedToBottom(pinned);
    setShowTraceJump(!pinned && event.currentTarget.scrollHeight > event.currentTarget.clientHeight);
  }, []);

  const jumpTraceToLatest = useCallback(() => {
    setTracePinnedToBottom(true);
    setShowTraceJump(false);
    scrollElementToBottom(traceCardRef.current, "smooth");
  }, []);

  useEffect(() => {
    if (!expanded) return;
    setTracePinnedToBottom(true);
    setShowTraceJump(false);
  }, [expanded]);

  useEffect(() => {
    setExpandedTimelineRows({});
  }, [section.turnId]);

  useLayoutEffect(() => {
    const element = traceCardRef.current;
    if (!expanded || !element) return;

    if (tracePinnedToBottom) {
      scrollElementToBottom(element);
      setShowTraceJump(false);
      return;
    }

    setShowTraceJump(element.scrollHeight > element.clientHeight && !isNearScrollBottom(element));
  }, [expanded, traceContentSignature, tracePinnedToBottom]);

  return (
    <section className={`turn-trace is-${section.status} ${expanded ? "is-expanded" : ""}`} aria-label="Turn trace">
      <button
        aria-expanded={expanded}
        className="turn-trace-toggle"
        type="button"
        onClick={onToggle}
      >
        <Sparkles className="turn-trace-icon" size={17} />
        <span className="turn-trace-heading">Trace</span>
        <span className="turn-trace-summary">{headline}{summary ? ` · ${summary}` : ""}</span>
        <TraceTokenUsage tokenUsage={tokenUsage} />
        <ChevronDown className="turn-trace-chevron" size={15} />
      </button>
      {expanded ? (
        <div className="turn-trace-card-wrap">
          <div className="turn-trace-card" ref={traceCardRef} onScroll={handleTraceScroll}>
            <div className="turn-trace-current">
              <strong>{headline}</strong>
              {summary ? <small>{summary}</small> : null}
            </div>
            {timelineRows.length > 0 ? (
              <div className="turn-trace-section">
                <div className="turn-trace-section-title">
                  <span>时间线</span>
                  {compactItems.hiddenCount > 0 ? <small>已收起 {compactItems.hiddenCount} 条较早进度</small> : null}
                </div>
                <div className="turn-trace-stream">
                  {timelineRows.map((row) => {
                    if (row.type === "thought") {
                      return (
                        <div className={`turn-trace-thought is-${row.status} is-${row.kind}`} key={row.id}>
                          <span className="turn-trace-dot" />
                          <div className={`turn-trace-copy ${row.kind === "reasoning" ? "is-reasoning" : ""}`}>
                            <div className="turn-trace-item-meta">
                              <span>{row.label}</span>
                              <small>{traceStatusLabel(row.status)}</small>
                            </div>
                            {row.kind === "reasoning" ? (
                              <TraceThoughtText text={row.title} />
                            ) : (
                              <span className="turn-trace-item-title">{row.title}</span>
                            )}
                            {row.detail ? <small className="turn-trace-item-detail">{row.detail}</small> : null}
                          </div>
                        </div>
                      );
                    }
                    const rowIcon = row.type === "tool" ? (
                      <TerminalSquare className="turn-trace-row-icon" size={14} />
                    ) : row.type === "approval" ? (
                      <Shield className="turn-trace-row-icon" size={14} />
                    ) : null;
                    return (
                      <div
                        className={`turn-trace-row-action is-${row.type} is-${row.status} ${expandedTimelineRows[row.id] ? "is-open" : ""}`}
                        key={row.id}
                      >
                        <button
                          aria-expanded={Boolean(expandedTimelineRows[row.id])}
                          className="turn-trace-row-action-button"
                          type="button"
                          onClick={() => setExpandedTimelineRows((current) => ({ ...current, [row.id]: !current[row.id] }))}
                        >
                          {rowIcon}
                          <span className="turn-trace-row-title" title={row.label}>{row.label}</span>
                          {row.detail ? <span className="turn-trace-row-summary" title={row.detail}>{row.detail}</span> : <span className="turn-trace-row-summary" />}
                          {row.status !== "completed" ? <span className="turn-trace-row-status">{toolTraceStatusLabel(row.status)}</span> : null}
                          <ChevronDown className="turn-trace-row-chevron" size={14} />
                        </button>
                        {expandedTimelineRows[row.id] ? (
                          <TurnTraceTimelineDetail row={row} onResolveApproval={onResolveApproval} />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          {showTraceJump ? (
            <button className="turn-trace-jump-to-latest" type="button" onClick={jumpTraceToLatest}>
              跳到最新
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function TurnTraceTimelineDetail({
  row,
  onResolveApproval,
}: {
  row: Exclude<TurnTraceRow, { type: "thought" }>;
  onResolveApproval: (approval: Approval, decision: string) => Promise<void>;
}) {
  if (row.type === "tool") {
    const hasDetail = Boolean(row.detail || row.progress.length > 0 || row.outputPreview);
    return (
      <div className="turn-trace-row-detail">
        {row.detail ? (
          <div className="turn-trace-row-detail-line">
            <span>输入</span>
            <code>{row.detail}</code>
          </div>
        ) : null}
        {row.progress.length > 0 ? (
          <div className="turn-trace-row-detail-line">
            <span>进展</span>
            <div className="turn-trace-row-progress-list">
              {row.progress.map((item, index) => (
                <small key={`${row.id}-progress-${index}`}>{item}</small>
              ))}
            </div>
          </div>
        ) : null}
        {row.outputPreview ? (
          <pre className="turn-trace-tool-output">{row.outputPreview}</pre>
        ) : null}
        {!hasDetail ? <small className="turn-trace-row-empty">暂无更多详情</small> : null}
      </div>
    );
  }
  const approval = row.approval;
  return (
    <div className="turn-trace-row-detail">
      <div className="turn-trace-approval">
        <div className="turn-trace-approval-copy">
          <strong>{approval.toolName}</strong>
          <span>{approval.summary}</span>
        </div>
        {!approval.decision ? (
          <div className="turn-trace-approval-actions">
            <Button size="sm" type="button" onClick={() => void onResolveApproval(approval, "approved")}>
              允许一次
            </Button>
            <Button size="sm" type="button" variant="outline" onClick={() => void onResolveApproval(approval, "rejected")}>
              拒绝
            </Button>
          </div>
        ) : (
          <small className="turn-trace-row-empty">已处理：{approval.decision}</small>
        )}
      </div>
    </div>
  );
}

function TraceTokenUsage({ tokenUsage }: { tokenUsage?: TurnTokenUsage }) {
  if (!tokenUsage) return null;
  const cacheHitRate = tokenUsage.cacheRead !== undefined && tokenUsage.inputTokens > 0
    ? `${(tokenUsage.cacheRead / tokenUsage.inputTokens * 100).toFixed(0)}%`
    : undefined;
  const tokenDisplayParts = [
    `↑ ${tokenUsage.inputTokens.toLocaleString()}`,
    `↓ ${tokenUsage.outputTokens.toLocaleString()}`,
    `∑ ${tokenUsage.totalTokens.toLocaleString()}`,
    tokenUsage.cacheRead !== undefined ? `缓存命中 ${tokenUsage.cacheRead.toLocaleString()}` : null,
    cacheHitRate ? `(${cacheHitRate})` : null,
    tokenUsage.cacheCreation !== undefined ? `缓存写入 ${tokenUsage.cacheCreation.toLocaleString()}` : null,
  ].filter(Boolean);
  return (
    <span
      className="turn-trace-toggle-tokens"
      title={`输入 ${tokenUsage.inputTokens.toLocaleString()} · 输出 ${tokenUsage.outputTokens.toLocaleString()} · 总计 ${tokenUsage.totalTokens.toLocaleString()}${tokenUsage.cacheRead !== undefined ? ` · 缓存命中 ${tokenUsage.cacheRead.toLocaleString()}` : ""}${tokenUsage.cacheCreation !== undefined ? ` · 缓存写入 ${tokenUsage.cacheCreation.toLocaleString()}` : ""}`}
    >
      {tokenDisplayParts.map((part, i) => (
        <span
          key={`${part}-${i}`}
          className="turn-trace-toggle-token-value"
        >
          {part}
        </span>
      ))}
    </span>
  );
}

function TraceThoughtText({ text }: { text: string }) {
  const blocks = formatTraceThoughtText(text);
  if (blocks.length === 0) return null;

  return (
    <div className="turn-trace-reasoning">
      {blocks.map((block, index) => (
        block.kind === "truncation" ? (
          <small className="turn-trace-reasoning-truncated" key={`${block.kind}-${index}`}>{block.text}</small>
        ) : (
          <p className="turn-trace-reasoning-paragraph" key={`${block.kind}-${index}`}>{block.text}</p>
        )
      ))}
    </div>
  );
}

function composeTurnTraceRows(
  items: ThinkingTraceItem[],
  toolCards: ToolTraceCardModel[],
  approvals: Approval[] = [],
): TurnTraceRow[] {
  const thoughtRows: TurnTraceRow[] = items.map((item, index) => ({
    type: "thought",
    id: `thought:${item.id}`,
    kind: item.kind,
    status: item.status,
    label: modelProcessItemLabel(item, items.slice(0, index)),
    title: item.title,
    detail: item.detail,
    createdAt: item.createdAt,
  }));
  return [
    ...thoughtRows,
    ...toolCards.map(toolTraceCardToTimelineRow),
    ...approvals.map(approvalToTimelineRow),
  ].sort(compareTurnTraceRows);
}

function compareTurnTraceRows(a: TurnTraceRow, b: TurnTraceRow) {
  return (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id);
}

function toolTraceCardToTimelineRow(card: ToolTraceCardModel): Extract<TurnTraceRow, { type: "tool" }> {
  return {
    type: "tool",
    id: `tool:${card.id}`,
    status: card.status,
    kind: card.kind,
    label: toolTraceRowLabel(card),
    detail: toolTraceRowDetail(card),
    outputPreview: card.outputPreview,
    progress: card.progress,
    createdAt: card.startedAt,
    completedAt: card.completedAt,
  };
}

function approvalToTimelineRow(approval: Approval): Extract<TurnTraceRow, { type: "approval" }> {
  return {
    type: "approval",
    id: `approval:${approval.id}`,
    status: approval.decision === "rejected" ? "rejected" : approval.decision ? "completed" : "waiting_approval",
    label: `审批：${approval.toolName}`,
    title: approval.toolName,
    detail: approval.summary,
    approval,
    createdAt: approval.createdAt,
  };
}

function isProminentToolTrace(card: ToolTraceCardModel) {
  return ["running", "waiting_approval", "error", "cancelled", "rejected"].includes(card.status);
}

function toolTraceRowLabel(card: ToolTraceCardModel) {
  const prefix = toolTraceActionPrefix(card.status);
  if (card.name === "read_file") return `${prefix}读取文件`;
  if (card.name === "list_files") return `${prefix}列出文件`;
  if (card.name === "write_file") return `${prefix}写入文件`;
  if (card.name === "edit_file") return `${prefix}编辑文件`;
  if (card.name === "search" || card.name === "grep" || card.name === "glob") return `${prefix}搜索`;
  if (card.name === "shell") return `${prefix}运行命令`;
  if (card.name === "mcp_call") return `${prefix}调用 MCP`;
  if (card.name.startsWith("git_")) return `${prefix}执行 Git`;
  if (card.name === "task_update") return `${prefix}更新任务`;
  return card.title || `${prefix}调用工具`;
}

function toolTraceActionPrefix(status: ToolTraceCardModel["status"]) {
  if (status === "running" || status === "pending") return "正在";
  if (status === "waiting_approval") return "等待审批：";
  if (status === "error") return "调用失败：";
  if (status === "cancelled") return "已取消：";
  if (status === "rejected") return "已拒绝：";
  return "已";
}

function toolTraceRowDetail(card: ToolTraceCardModel) {
  if (card.inputSummary) return card.inputSummary;
  if (card.progress.length > 0) return card.progress.at(-1);
  if (card.outputPreview && isProminentToolTrace(card)) return card.outputPreview.slice(0, 120);
  return undefined;
}

function toolTraceStatusLabel(status: ToolTraceCardModel["status"]) {
  if (status === "running") return "运行中";
  if (status === "waiting_approval") return "等待审批";
  if (status === "error") return "失败";
  if (status === "cancelled") return "已取消";
  if (status === "rejected") return "已拒绝";
  if (status === "pending") return "等待中";
  return "完成";
}

function compactModelProcessItems(items: ThinkingTraceItem[], limit = TRACE_THOUGHT_VISIBLE_LIMIT) {
  if (items.length <= limit) return { items, hiddenCount: 0 };

  const importantItems = items.filter((item) => item.status === "running" || item.status === "pending" || item.status === "error");
  const selected = new Set<string>();
  const selectedImportantItems = importantItems.slice(-limit);

  for (const item of selectedImportantItems) {
    selected.add(item.id);
  }

  const remainingSlots = Math.max(0, limit - selectedImportantItems.length);
  let selectedRecentCount = 0;
  for (const item of [...items].reverse()) {
    if (selectedRecentCount >= remainingSlots) break;
    if (selected.has(item.id)) continue;
    selected.add(item.id);
    selectedRecentCount += 1;
  }

  const visibleItems = items.filter((item) => selected.has(item.id)).slice(-limit);
  return { items: visibleItems, hiddenCount: items.length - visibleItems.length };
}

function modelProcessItemLabel(item: ThinkingTraceItem, previousItems: ThinkingTraceItem[]) {
  const sameKindIndex = previousItems.filter((previous) => previous.kind === item.kind).length + 1;
  if (item.kind === "reasoning") return `思考 ${sameKindIndex}`;
  if (item.kind === "note") return `进度 ${sameKindIndex}`;
  if (item.kind === "tool") return `工具 ${sameKindIndex}`;
  return `步骤 ${sameKindIndex}`;
}

function traceStatusLabel(status: ThinkingTraceItem["status"]) {
  if (status === "running") return "运行中";
  if (status === "error") return "失败";
  if (status === "pending") return "等待中";
  return "完成";
}

function thinkingTraceHeadline(section: ThinkingTraceSection) {
  if (section.status === "running") return "处理中...";
  if (section.status === "error") return "处理失败";
  if (section.status === "pending") return "等待处理";
  return section.durationLabel ? `已处理 ${section.durationLabel}` : "已处理";
}

function tokenUsageByTurnFromDetail(detail?: ThreadDetail) {
  if (!detail) return {};
  return Object.fromEntries(
    detail.turns
      .filter((turn) => turn.tokenUsage)
      .map((turn) => [turn.id, turn.tokenUsage!]),
  );
}

function readStoredExpandedWorkspaceIds() {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_EXPANDED_WORKSPACES_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
    );
  } catch {
    return {};
  }
}

function persistExpandedWorkspaceIds(expandedWorkspaceIds: Record<string, boolean>) {
  window.localStorage.setItem(
    SIDEBAR_EXPANDED_WORKSPACES_STORAGE_KEY,
    JSON.stringify(expandedWorkspaceIds),
  );
}

function readStoredProjectTreeCollapsed() {
  return window.localStorage.getItem(PROJECT_TREE_COLLAPSED_STORAGE_KEY) === "true";
}

function persistProjectTreeCollapsed(collapsed: boolean) {
  window.localStorage.setItem(PROJECT_TREE_COLLAPSED_STORAGE_KEY, String(collapsed));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const AUTO_SCROLL_BOTTOM_THRESHOLD = 56;

function isNearScrollBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= AUTO_SCROLL_BOTTOM_THRESHOLD;
}

function scrollElementToBottom(element: HTMLElement | null, behavior: ScrollBehavior = "auto") {
  if (!element) return;
  element.scrollTo({ top: element.scrollHeight, behavior });
}

function readInitialAgentSelection() {
  const params = new URLSearchParams(window.location.search);
  return {
    workspaceId: params.get("workspaceId") || undefined,
    threadId: params.get("threadId") || undefined,
  };
}

function shouldReloadThreadAfterAgentEvent(event: AgentEvent) {
  return ![
    "message.delta",
    "message.replaced",
    "progress.note",
    "task.updated",
    "tool.delta",
    "tool.progress",
    "tool.output.delta",
  ].includes(event.event);
}

function applyEvent(current: ThreadDetail | undefined, event: AgentEvent): ThreadDetail | undefined {
  if (!current) return current;
  if (event.event === "message.completed" && event.itemId) {
    const nextItem = event.payload as AgentItem;
    if (!nextItem?.id) return current;
    const exists = current.items.some((item) => item.id === nextItem.id);
    return {
      ...current,
      items: exists
        ? current.items.map((item) => (item.id === nextItem.id ? nextItem : item))
        : [...current.items, nextItem],
    };
  }
  if (event.event === "message.delta" && event.itemId) {
    const delta = (event.payload as { delta?: string })?.delta || "";
    if (!delta) return current;

    const index = current.items.findIndex((item) => item.id === event.itemId);
    if (index < 0) return current;

    const oldItem = current.items[index];
    const newContent = oldItem.content + delta;
    if (newContent === oldItem.content) return current;

    const newItem = { ...oldItem, content: newContent, status: "running" as const };
    const nextItems = [...current.items];
    nextItems[index] = newItem;

    return { ...current, items: nextItems };
  }
  if (event.event === "message.replaced" && event.itemId) {
    const content = (event.payload as { content?: string })?.content ?? "";
    return {
      ...current,
      items: current.items.map((item) =>
        item.id === event.itemId ? { ...item, content } : item,
      ),
    };
  }
  if (event.event === "turn.queued") {
    const queued = event.payload as ThreadDetail["queue"][number];
    return { ...current, queue: [...current.queue, queued] };
  }
  if (event.event === "turn.started") {
    const turn = event.payload as ThreadDetail["turns"][number];
    return {
      ...current,
      thread: { ...current.thread, status: "running" },
      turns: [...current.turns, turn],
    };
  }
  if (event.event === "turn.completed" || event.event === "turn.failed") {
    const payload = event.payload as { status?: string } | undefined;
    const nextStatus = payload?.status === "interrupted" ? "interrupted" : "idle";
    return { ...current, thread: { ...current.thread, status: nextStatus }, queue: [] };
  }
  if (event.event === "progress.note") {
    const note = event.payload as ThreadDetail["progressNotes"][number];
    if (!note?.id) return current;
    const currentNotes = current.progressNotes || [];
    const exists = currentNotes.some((item) => item.id === note.id);
    return {
      ...current,
      progressNotes: exists
        ? currentNotes.map((item) => (item.id === note.id ? note : item))
        : [...currentNotes, note],
    };
  }
  return current;
}
