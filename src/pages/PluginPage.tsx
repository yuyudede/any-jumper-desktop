import {
  CheckCircle,
  Download,
  ExternalLink,
  Package,
  Wrench,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { WorkbenchPage, WorkbenchSection } from "../components/Workbench";
import { desktopApi, errorMessage } from "../services/desktopApi";
import type { ActivityItem, McpServerConfig, PluginSummary, SkillSummary } from "../types";

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

export default function PluginPage({ pushActivity }: PluginPageProps) {
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [mcps, setMcps] = useState<McpServerConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [installingPlugin, setInstallingPlugin] = useState<string>();
  const [pluginMarketSource, setPluginMarketSource] = useState("");
  const [notice, setNotice] = useState<NoticeState>();

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
      showNotice({ tone: "danger", title: "插件列表读取失败", detail: errorMessage(error) });
    } finally {
      setLoading(false);
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
              <div className="mini-empty">暂无已配置的 MCP Server</div>
            ) : (
              <div className="provider-table plugin-market-table plugin-market-mcp">
                <div className="provider-table-head">
                  <span>名称</span>
                  <span>传输方式</span>
                  <span>命令/URL</span>
                  <span>状态</span>
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
                  </div>
                ))}
              </div>
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
