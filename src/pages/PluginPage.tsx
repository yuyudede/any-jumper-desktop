import {
  CheckCircle,
  Download,
  ExternalLink,
  Package,
  Pencil,
  Plus,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import { WorkbenchPage, WorkbenchSection } from "../components/Workbench";
import { desktopApi, errorMessage } from "../services/desktopApi";
import type { ActivityItem, McpServerConfig, McpServerRequest, PluginSummary, SkillSummary } from "../types";

interface PluginPageProps {
  pushActivity: (
    title: string,
    status?: ActivityItem["status"],
    detail?: string,
  ) => void;
}

interface NoticeState {
  tone: "success" | "warning" | "danger" | "muted";
  title: string;
  detail?: string;
}

interface McpServerFormState {
  name: string;
  transport: string;
  commandJson: string;
  url: string;
  envJson: string;
  headersJson: string;
  timeout: number;
}

const EMPTY_MCP_FORM: McpServerFormState = {
  name: "",
  transport: "stdio",
  commandJson: "",
  url: "",
  envJson: "",
  headersJson: "",
  timeout: 30,
};

function formToRequest(form: McpServerFormState, id?: string): McpServerRequest {
  return {
    id,
    name: form.name.trim(),
    transport: form.transport,
    commandJson: form.transport === "stdio" ? form.commandJson.trim() || undefined : undefined,
    url: form.transport === "http" ? form.url.trim() || undefined : undefined,
    envJson: form.envJson.trim() || undefined,
    headersJson: form.transport === "http" ? form.headersJson.trim() || undefined : undefined,
    timeout: form.transport === "http" ? form.timeout || undefined : undefined,
    enabled: true,
  };
}

function mcpToForm(mcp: McpServerConfig): McpServerFormState {
  return {
    name: mcp.name,
    transport: mcp.transport,
    commandJson: mcp.commandJson ?? "",
    url: mcp.url ?? "",
    envJson: mcp.envJson ?? "",
    headersJson: mcp.headersJson ?? "",
    timeout: mcp.timeout ?? 30,
  };
}

export default function PluginPage({ pushActivity }: PluginPageProps) {
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [mcps, setMcps] = useState<McpServerConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [installingPlugin, setInstallingPlugin] = useState<string>();
  const [pluginMarketSource, setPluginMarketSource] = useState("");
  const [notice, setNotice] = useState<NoticeState>();
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);
  const [editingMcp, setEditingMcp] = useState<McpServerConfig | undefined>();
  const [mcpForm, setMcpForm] = useState<McpServerFormState>({ ...EMPTY_MCP_FORM });
  const [mcpTesting, setMcpTesting] = useState(false);
  const [mcpSaving, setMcpSaving] = useState(false);

  const dedupedSkills = useMemo(() => dedupeSkills(skills), [skills]);

  useEffect(() => {
    void loadData();
  }, []);

  function showNotice(next: NoticeState) {
    setNotice(next);
    window.setTimeout(() => setNotice(undefined), 4200);
  }

  async function loadData() {
    setLoading(true);
    try {
      const [pluginList, skillList, mcpList] = await Promise.all([
        desktopApi.pluginList(),
        desktopApi.skillList(),
        desktopApi.mcpList(),
      ]);
      setPlugins(pluginList);
      setSkills(skillList);
      setMcps(mcpList);
    } catch (error) {
      showNotice({ tone: "danger", title: "列表读取失败", detail: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  }

  function openAddMcp() {
    setEditingMcp(undefined);
    setMcpForm({ ...EMPTY_MCP_FORM });
    setMcpDialogOpen(true);
  }

  function openEditMcp(mcp: McpServerConfig) {
    setEditingMcp(mcp);
    setMcpForm(mcpToForm(mcp));
    setMcpDialogOpen(true);
  }

  async function handleTestMcp() {
    if (!editingMcp) return;
    setMcpTesting(true);
    try {
      const saved = await desktopApi.mcpSave(formToRequest(mcpForm, editingMcp.id));
      const result = await desktopApi.mcpTest(saved.id);
      showNotice({
        tone: result.ok ? "success" : "danger",
        title: result.ok ? `测试成功：发现 ${result.tools} 个工具` : "测试失败",
        detail: result.error,
      });
    } catch (error) {
      showNotice({ tone: "danger", title: "测试失败", detail: errorMessage(error) });
    } finally {
      setMcpTesting(false);
    }
  }

  async function handleSaveMcp() {
    if (!mcpForm.name.trim()) {
      showNotice({ tone: "warning", title: "请输入 MCP Server 名称" });
      return;
    }
    if (mcpForm.transport === "stdio" && !mcpForm.commandJson.trim()) {
      showNotice({ tone: "warning", title: "stdio 模式请输入命令" });
      return;
    }
    if (mcpForm.transport === "http" && !mcpForm.url.trim()) {
      showNotice({ tone: "warning", title: "HTTP 模式请输入 URL" });
      return;
    }
    setMcpSaving(true);
    try {
      const saved = await desktopApi.mcpSave(formToRequest(mcpForm, editingMcp?.id));
      showNotice({ tone: "success", title: editingMcp ? "MCP Server 已更新" : "MCP Server 已添加" });
      setMcpDialogOpen(false);
      await loadData();
      pushActivity(editingMcp ? "编辑 MCP Server" : "添加 MCP Server", "success", saved.name);
    } catch (error) {
      showNotice({ tone: "danger", title: "保存失败", detail: errorMessage(error) });
    } finally {
      setMcpSaving(false);
    }
  }

  async function handleDeleteMcp(mcp: McpServerConfig) {
    if (!window.confirm(`确定要删除 MCP Server「${mcp.name}」吗？`)) return;
    try {
      await desktopApi.mcpDelete(mcp.id);
      showNotice({ tone: "success", title: `MCP Server「${mcp.name}」已删除` });
      await loadData();
      pushActivity("删除 MCP Server", "success", mcp.name);
    } catch (error) {
      showNotice({ tone: "danger", title: "删除失败", detail: errorMessage(error) });
    }
  }

  async function handleInstallPlugin() {
    const source = pluginMarketSource.trim();
    if (!source) {
      showNotice({ tone: "warning", title: "请输入插件源地址（Git URL 或本地路径）" });
      return;
    }
    setInstallingPlugin(source);
    try {
      const installed = await desktopApi.pluginInstall(source);
      showNotice({ tone: "success", title: "插件已安装", detail: installed.name });
      setPluginMarketSource("");
      await loadData();
      pushActivity("安装插件", "success", installed.name);
    } catch (error) {
      showNotice({ tone: "danger", title: "插件安装失败", detail: errorMessage(error) });
    } finally {
      setInstallingPlugin(undefined);
    }
  }

  async function handleTogglePlugin(id: string, enabled: boolean) {
    try {
      await desktopApi.pluginEnable(id, enabled);
      await loadData();
    } catch (error) {
      showNotice({ tone: "danger", title: "插件状态切换失败", detail: errorMessage(error) });
    }
  }

  return (
    <WorkbenchPage
      className="is-settings-page"
      eyebrow="Plugin 管理"
      title="Plugin"
      description="管理已安装 Plugin、已加载 Skill 和 MCP Server。"
      contextItems={[
        { label: "Plugin", value: String(plugins.length), status: "neutral" },
        { label: "Skill", value: String(dedupedSkills.length), status: "neutral" },
        { label: "MCP", value: String(mcps.length), status: "neutral" },
      ]}
    >
      {notice ? (
        <div className={`inline-alert is-${notice.tone === "danger" ? "warning" : notice.tone}`}>
          {notice.tone === "danger" ? <XCircle size={16} /> : <CheckCircle size={16} />}
          <div>
            <strong>{notice.title}</strong>
            {notice.detail ? <span>{notice.detail}</span> : null}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="mini-empty">加载中...</div>
      ) : (
        <div className="plugin-market-tables">
          <WorkbenchSection title="已安装的 Plugin" description={`${plugins.length} 个插件`}>
            {plugins.length === 0 ? (
              <div className="mini-empty">暂无已安装的 Plugin</div>
            ) : (
              <div className="provider-table plugin-market-table">
                <div className="provider-table-head">
                  <span>名称</span>
                  <span>版本</span>
                  <span>描述</span>
                  <span>路径</span>
                  <span>状态</span>
                </div>
                {plugins.map((plugin) => (
                  <div className="provider-row" key={plugin.id}>
                    <span className="provider-name-cell">
                      <Package size={14} />
                      <strong>{plugin.name}</strong>
                    </span>
                    <span className="mono-text">{plugin.version || "-"}</span>
                    <span className="desc-text">{plugin.description || "-"}</span>
                    <code className="path-text">{plugin.path}</code>
                    <span className="provider-row-actions">
                      <Badge tone={plugin.enabled ? "success" : "muted"}>
                        {plugin.enabled ? "已启用" : "已停用"}
                      </Badge>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => void handleTogglePlugin(plugin.id, !plugin.enabled)}
                      >
                        {plugin.enabled ? <XCircle size={14} /> : <CheckCircle size={14} />}
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </WorkbenchSection>

          <WorkbenchSection title="已加载的 Skill" description={`${dedupedSkills.length} 个技能`}>
            {dedupedSkills.length === 0 ? (
              <div className="mini-empty">暂无已加载的 Skill</div>
            ) : (
              <div className="provider-table plugin-market-table">
                <div className="provider-table-head">
                  <span>名称</span>
                  <span>描述</span>
                  <span>作用域</span>
                  <span>路径</span>
                  <span>状态</span>
                </div>
                {dedupedSkills.map((skill) => (
                  <div className="provider-row" key={skill.id}>
                    <span className="provider-name-cell">
                      <Wrench size={14} />
                      <strong>{skill.name}</strong>
                    </span>
                    <span className="desc-text">{skill.description || "-"}</span>
                    <span><Badge tone="default">{skill.scope}</Badge></span>
                    <code className="path-text">{skill.path}</code>
                    <span className="provider-row-actions">
                      <Badge tone={skill.enabled ? "success" : "muted"}>
                        {skill.enabled ? "已启用" : "已停用"}
                      </Badge>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </WorkbenchSection>

          <WorkbenchSection title="已配置的 MCP Server" description={`${mcps.length} 个服务`}>
            {mcps.length === 0 ? (
              <div className="mini-empty" style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
                <span>暂无已配置的 MCP Server。</span>
                <Button type="button" variant="outline" size="sm" onClick={openAddMcp}>
                  <Plus size={14} /> 添加 MCP Server
                </Button>
              </div>
            ) : (
              <>
                <div className="plugin-mcp-toolbar">
                  <Button type="button" variant="outline" size="sm" onClick={openAddMcp}>
                    <Plus size={14} /> 添加 MCP Server
                  </Button>
                </div>
                <div className="provider-table plugin-market-table plugin-market-mcp">
                  <div className="provider-table-head">
                    <span>名称</span>
                    <span>传输方式</span>
                    <span>命令/URL</span>
                    <span>状态</span>
                    <span>操作</span>
                  </div>
                  {mcps.map((mcp) => (
                    <div className="provider-row" key={mcp.id}>
                      <span className="provider-name-cell">
                        <ExternalLink size={14} />
                        <strong>{mcp.name}</strong>
                      </span>
                      <span><Badge tone="default">{mcp.transport}</Badge></span>
                      <code className="path-text">{mcp.commandJson || mcp.url || "-"}</code>
                      <span className="provider-row-actions">
                        <Badge tone={mcp.enabled ? "success" : "muted"}>
                          {mcp.enabled ? "已启用" : "已停用"}
                        </Badge>
                        <Badge tone={mcp.status === "connected" ? "success" : mcp.status === "error" ? "warning" : "muted"}>
                          {mcp.status === "connected" ? "已连接" : mcp.status === "error" ? "错误" : "未连接"}
                        </Badge>
                      </span>
                      <span className="provider-row-actions">
                        <Button type="button" variant="outline" size="icon" onClick={() => openEditMcp(mcp)}>
                          <Pencil size={14} />
                        </Button>
                        <Button type="button" variant="outline" size="icon" onClick={() => void handleDeleteMcp(mcp)}>
                          <Trash2 size={14} />
                        </Button>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </WorkbenchSection>

          <WorkbenchSection title="插件市场" description="输入 Git URL 或本地路径安装或更新插件">
            <div className="plugin-install-row">
              <Input
                className="mono-input plugin-install-input"
                value={pluginMarketSource}
                placeholder="https://github.com/user/plugin-repo 或 /path/to/plugin"
                onChange={(event) => setPluginMarketSource(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") void handleInstallPlugin(); }}
              />
              <Button type="button" disabled={installingPlugin !== undefined || !pluginMarketSource.trim()} onClick={() => void handleInstallPlugin()}>
                <Download size={15} /> {installingPlugin ? "安装中..." : "安装 / 更新"}
              </Button>
            </div>
          </WorkbenchSection>
        </div>
      )}

      {/* MCP Server 添加/编辑 Dialog */}
      <Dialog open={mcpDialogOpen} onOpenChange={setMcpDialogOpen}>
        <DialogContent className="mcp-dialog-content" style={{ maxWidth: 560 }}>
          <DialogHeader>
            <DialogTitle>{editingMcp ? "编辑 MCP Server" : "添加 MCP Server"}</DialogTitle>
          </DialogHeader>

          <div className="mcp-dialog-form" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="mcp-dialog-field" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 13, fontWeight: 500 }}>名称</label>
              <Input
                value={mcpForm.name}
                placeholder="例如：my-mcp-server"
                onChange={(e) => setMcpForm({ ...mcpForm, name: e.target.value })}
              />
            </div>

            <div className="mcp-dialog-field" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 13, fontWeight: 500 }}>传输方式</label>
              <Select
                options={[
                  { label: "stdio（标准输入输出）", value: "stdio" },
                  { label: "http（HTTP/SSE）", value: "http" },
                ]}
                value={mcpForm.transport}
                onChange={(e) => setMcpForm({ ...mcpForm, transport: e.target.value })}
              />
            </div>

            {mcpForm.transport === "stdio" ? (
              <div className="mcp-dialog-field" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 13, fontWeight: 500 }}>命令 (JSON 数组)</label>
              <Input
                value={mcpForm.commandJson}
                placeholder={'["npx", "-y", "@modelcontextprotocol/server-filesystem", "/path"]'}
                onChange={(e) => setMcpForm({ ...mcpForm, commandJson: e.target.value })}
              />
            </div>
            ) : (
              <>
                <div className="mcp-dialog-field" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 13, fontWeight: 500 }}>URL</label>
                  <Input
                    value={mcpForm.url}
                    placeholder="http://localhost:3000/mcp"
                    onChange={(e) => setMcpForm({ ...mcpForm, url: e.target.value })}
                  />
                </div>
                <div className="mcp-dialog-field" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 13, fontWeight: 500 }}>Headers (JSON, 可选)</label>
                  <Textarea
                    value={mcpForm.headersJson}
                    placeholder={'{"Authorization": "Bearer xxx"}'}
                    rows={3}
                    onChange={(e) => setMcpForm({ ...mcpForm, headersJson: e.target.value })}
                  />
                </div>
                <div className="mcp-dialog-field" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 13, fontWeight: 500 }}>超时秒数</label>
                  <Input
                    type="number"
                    value={String(mcpForm.timeout)}
                    min={5}
                    max={300}
                    onChange={(e) => setMcpForm({ ...mcpForm, timeout: Number(e.target.value) || 30 })}
                  />
                </div>
              </>
            )}

            <div className="mcp-dialog-field" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 13, fontWeight: 500 }}>环境变量 (JSON, 可选)</label>
              <Textarea
                value={mcpForm.envJson}
                placeholder='{"MY_KEY": "my_value"}'
                rows={3}
                onChange={(e) => setMcpForm({ ...mcpForm, envJson: e.target.value })}
              />
            </div>
          </div>

          <div className="mcp-dialog-footer" style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            {editingMcp ? (
              <Button type="button" variant="outline" disabled={mcpTesting} onClick={() => void handleTestMcp()}>
                {mcpTesting ? "测试中..." : "测试连接"}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setMcpDialogOpen(false)}>取消</Button>
            <Button type="button" disabled={mcpSaving} onClick={() => void handleSaveMcp()}>
              {mcpSaving ? "保存中..." : (editingMcp ? "保存更改" : "添加")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </WorkbenchPage>
  );
}

function dedupeSkills(skills: SkillSummary[]) {
  const seen = new Set<string>();
  const result: SkillSummary[] = [];
  for (const skill of skills) {
    const key = skill.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(skill);
  }
  return result;
}
