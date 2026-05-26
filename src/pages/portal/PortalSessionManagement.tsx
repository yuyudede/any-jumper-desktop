import { Archive, ArchiveRestore, ExternalLink, Pencil, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { WorkbenchSection } from "../../components/Workbench";
import { desktopApi, errorMessage } from "../../services/desktopApi";
import type {
  ActivityItem,
  AgentThread,
  ThreadArchiveFilter,
  UsageSessionSummary,
  Workspace,
} from "../../types";

interface PortalSessionManagementProps {
  workspaces: Workspace[];
  pushActivity: (title: string, status?: ActivityItem["status"], detail?: string) => void;
}

export default function PortalSessionManagement({ workspaces, pushActivity }: PortalSessionManagementProps) {
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [usageByThread, setUsageByThread] = useState<Record<string, UsageSessionSummary>>({});
  const [workspaceId, setWorkspaceId] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<ThreadArchiveFilter>("active");
  const [model, setModel] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const workspaceById = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces],
  );
  const workspaceOptions = useMemo(
    () => [
      { label: "全部 Workspace", value: "" },
      ...workspaces.map((workspace) => ({ label: workspace.name, value: workspace.id })),
    ],
    [workspaces],
  );
  const modelOptions = useMemo(() => {
    const models = new Set<string>();
    for (const thread of threads) {
      models.add(thread.model);
      for (const item of usageByThread[thread.id]?.modelBreakdown || []) models.add(item.model);
    }
    return [{ label: "全部模型", value: "" }, ...Array.from(models).sort().map((name) => ({ label: name, value: name }))];
  }, [threads, usageByThread]);

  const visibleThreads = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return threads.filter((thread) => {
      const usage = usageByThread[thread.id];
      const workspace = workspaceById.get(thread.workspaceId);
      if (workspaceId && thread.workspaceId !== workspaceId) return false;
      if (archiveFilter === "active" && thread.archived) return false;
      if (archiveFilter === "archived" && !thread.archived) return false;
      if (model && thread.model !== model && !usage?.modelBreakdown.some((item) => item.model === model)) return false;
      if (!keyword) return true;
      const haystack = [
        thread.title,
        thread.id,
        thread.model,
        workspace?.name,
        workspace?.rootPath,
        usage?.primaryModel,
        ...(usage?.modelBreakdown.map((item) => item.model) || []),
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(keyword);
    });
  }, [archiveFilter, model, query, threads, usageByThread, workspaceById, workspaceId]);

  useEffect(() => {
    void loadSessions();
  }, []);

  async function loadSessions() {
    setLoading(true);
    setError(undefined);
    try {
      const [nextThreads, usage] = await Promise.all([
        desktopApi.threadList(undefined, "all"),
        desktopApi.usageDashboard({ source: "any_jumper" }),
      ]);
      setThreads(nextThreads);
      setUsageByThread(Object.fromEntries(
        usage.sessionBreakdown
          .filter((session) => session.sessionId)
          .map((session) => [session.sessionId!, session]),
      ));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function openThread(thread: AgentThread) {
    await desktopApi.portalOpenChat(thread.workspaceId, thread.id);
    pushActivity("打开 Portal 会话", "success", thread.title);
  }

  async function renameThread(thread: AgentThread) {
    const nextTitle = window.prompt("重命名会话", thread.title);
    if (nextTitle === null || nextTitle.trim() === thread.title) return;
    try {
      const updated = await desktopApi.threadNameSet(thread.id, nextTitle);
      setThreads((current) => current.map((item) => item.id === updated.id ? updated : item));
      pushActivity("重命名会话", "success", updated.title);
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      pushActivity("重命名会话", "error", message);
    }
  }

  async function setArchived(thread: AgentThread, archived: boolean) {
    try {
      if (archived) await desktopApi.threadArchive(thread.id);
      else await desktopApi.threadUnarchive(thread.id);
      setThreads((current) => current.map((item) => item.id === thread.id ? { ...item, archived, updatedAt: Date.now() } : item));
      pushActivity(archived ? "归档会话" : "取消归档会话", "success", thread.title);
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      pushActivity(archived ? "归档会话" : "取消归档会话", "error", message);
    }
  }

  return (
    <div className="portal-child-panel portal-session-panel" role="tabpanel" aria-label="Sessions">
      <WorkbenchSection
        title="Sessions"
        description="只管理 Any Jumper threads，支持打开、重命名、归档和取消归档。"
      >
        <div className="portal-toolbar">
          <label className="field-stack">
            <span>Workspace</span>
            <Select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} options={workspaceOptions} />
          </label>
          <label className="field-stack">
            <span>状态</span>
            <Select
              value={archiveFilter}
              onChange={(event) => setArchiveFilter(event.target.value as ThreadArchiveFilter)}
              options={[
                { label: "活跃", value: "active" },
                { label: "已归档", value: "archived" },
                { label: "全部", value: "all" },
              ]}
            />
          </label>
          <label className="field-stack">
            <span>模型</span>
            <Select value={model} onChange={(event) => setModel(event.target.value)} options={modelOptions} />
          </label>
          <label className="field-stack portal-search-field">
            <span>关键词</span>
            <div className="portal-search-input">
              <Search size={14} />
              <Input value={query} placeholder="标题 / 模型 / 路径" onChange={(event) => setQuery(event.target.value)} />
            </div>
          </label>
          <div className="portal-toolbar-actions">
            <Button type="button" variant="outline" disabled={loading} onClick={() => void loadSessions()}>
              刷新
            </Button>
          </div>
        </div>
        {error ? <div className="inline-alert is-warning"><strong>读取会话失败</strong><span>{error}</span></div> : null}
      </WorkbenchSection>

      <WorkbenchSection title="Any Jumper Threads" description="外部 CLI 日志不会出现在这里，也不会提供管理按钮。">
        <div className="portal-thread-list">
          {visibleThreads.map((thread) => {
            const workspace = workspaceById.get(thread.workspaceId);
            const usage = usageByThread[thread.id];
            return (
              <details className="portal-thread-row" key={thread.id}>
                <summary>
                  <div className="portal-primary-cell">
                    <strong>{thread.title}</strong>
                    <span>
                      {workspace?.name || thread.workspaceId} · {formatDateTime(thread.updatedAt)} · {formatInteger(usage?.realTotalTokens || 0)} token
                    </span>
                  </div>
                  <div className="portal-thread-meta">
                    <Badge tone={thread.archived ? "muted" : "default"}>{thread.archived ? "已归档" : "活跃"}</Badge>
                    <Badge tone="default">{modelBadge(usage?.primaryModel || thread.model, usage?.modelCount || 1)}</Badge>
                  </div>
                  <div className="portal-thread-actions">
                    <Button type="button" size="sm" variant="outline" onClick={(event) => { event.preventDefault(); void openThread(thread); }}>
                      <ExternalLink size={14} /> 打开
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={(event) => { event.preventDefault(); void renameThread(thread); }}>
                      <Pencil size={14} /> 重命名
                    </Button>
                    {thread.archived ? (
                      <Button type="button" size="sm" variant="outline" onClick={(event) => { event.preventDefault(); void setArchived(thread, false); }}>
                        <ArchiveRestore size={14} /> 取消归档
                      </Button>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={(event) => { event.preventDefault(); void setArchived(thread, true); }}>
                        <Archive size={14} /> 归档
                      </Button>
                    )}
                  </div>
                </summary>
                <div className="usage-model-details">
                  {(usage?.modelBreakdown || [{
                    model: thread.model,
                    realTotalTokens: 0,
                    inputTokens: 0,
                    outputTokens: 0,
                    cacheCreationTokens: 0,
                    cacheReadTokens: 0,
                  }]).map((item) => (
                    <div className="usage-model-detail" key={item.model}>
                      <span>{item.model}</span>
                      <span>{formatInteger(item.realTotalTokens)} token</span>
                      <span>
                        输入 {formatInteger(item.inputTokens)} · 输出 {formatInteger(item.outputTokens)}
                        · 写入 {formatInteger(item.cacheCreationTokens)} · 命中 {formatInteger(item.cacheReadTokens)}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
          {visibleThreads.length === 0 ? <div className="portal-empty-state">{loading ? "读取中..." : "暂无会话"}</div> : null}
        </div>
      </WorkbenchSection>
    </div>
  );
}

function modelBadge(model: string, count: number) {
  return count > 1 ? `${model} +${count - 1}` : model;
}

function formatInteger(value: number) {
  return Math.max(0, Math.trunc(value || 0)).toLocaleString();
}

function formatDateTime(value: number) {
  if (!value) return "未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}
