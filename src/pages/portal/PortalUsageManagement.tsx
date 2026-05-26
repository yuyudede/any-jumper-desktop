import { Activity, CalendarDays, Database, DollarSign, Layers, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { WorkbenchSection } from "../../components/Workbench";
import { desktopApi, errorMessage } from "../../services/desktopApi";
import type {
  ActivityItem,
  UsageDashboardData,
  UsageDashboardRequest,
  UsageSource,
  Workspace,
} from "../../types";
import {
  buildUsageTrendAxisTicks,
  buildUsageTrendPoints,
  buildUsageTrendYAxis,
  smoothUsageTrendPath,
} from "../../utils/usageStats";

interface PortalUsageManagementProps {
  workspaces: Workspace[];
  pushActivity: (title: string, status?: ActivityItem["status"], detail?: string) => void;
}

const emptyDashboard: UsageDashboardData = {
  summary: {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    freshInputTokens: 0,
    realTotalTokens: 0,
    cacheHitRate: 0,
    eventCount: 0,
    sessionCount: 0,
    modelCount: 0,
  },
  modelBreakdown: [],
  sessionBreakdown: [],
  events: [],
  syncState: [],
};

const sourceOptions: Array<{ label: string; value: UsageSource | "all" }> = [
  { label: "全部", value: "all" },
  { label: "Any Jumper", value: "any_jumper" },
  { label: "Claude Code", value: "claude_code" },
  { label: "Codex", value: "codex_cli" },
];

const rangeOptions = [
  { label: "今天", value: "today" },
  { label: "昨天", value: "yesterday" },
  { label: "近 7 天", value: "last7" },
  { label: "近 30 天", value: "last30" },
  { label: "本周", value: "thisWeek" },
  { label: "本月", value: "thisMonth" },
  { label: "全部", value: "all" },
];

export default function PortalUsageManagement({ workspaces, pushActivity }: PortalUsageManagementProps) {
  const [data, setData] = useState<UsageDashboardData>(emptyDashboard);
  const [source, setSource] = useState<UsageDashboardRequest["source"]>("all");
  const [workspaceId, setWorkspaceId] = useState("");
  const [model, setModel] = useState("");
  const [fromDate, setFromDate] = useState(() => dateInputValue(startOfToday()));
  const [toDate, setToDate] = useState(() => dateInputValue(new Date()));
  const [rangePreset, setRangePreset] = useState("today");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string>();

  const modelOptions = useMemo(() => {
    const names = Array.from(new Set(data.events.map((event) => event.model).filter(Boolean))).sort();
    return [{ label: "全部模型", value: "" }, ...names.map((name) => ({ label: name, value: name }))];
  }, [data.events]);

  const workspaceOptions = useMemo(
    () => [
      { label: "全部 Workspace", value: "" },
      ...workspaces.map((workspace) => ({ label: workspace.name, value: workspace.id })),
    ],
    [workspaces],
  );
  const trendPoints = useMemo(() => buildUsageTrendPoints(data.events, dateStart(fromDate), dateEnd(toDate)), [data.events, fromDate, toDate]);
  const totalTokenValue = data.summary.realTotalTokens;
  const cacheTokenTotal = data.summary.cacheReadTokens + data.summary.cacheCreationTokens;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 160);
    return () => window.clearTimeout(timer);
  }, [source, workspaceId, model, fromDate, toDate, query]);

  async function loadDashboard() {
    setLoading(true);
    setError(undefined);
    try {
      const request: UsageDashboardRequest = {
        source,
        workspaceId: workspaceId || undefined,
        model: model || undefined,
        query: query.trim() || undefined,
        from: dateStart(fromDate),
        to: dateEnd(toDate),
      };
      setData(await desktopApi.usageDashboard(request));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function syncExternalLogs() {
    setSyncing(true);
    setError(undefined);
    try {
      const result = await desktopApi.usageSyncExternal();
      pushActivity("同步本机用量日志", "success", `导入 ${result.importedCount} 条`);
      await loadDashboard();
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      pushActivity("同步本机用量日志", "error", message);
    } finally {
      setSyncing(false);
    }
  }

  function applyRangePreset(value: string) {
    setRangePreset(value);
    const range = rangeForPreset(value);
    setFromDate(range.from);
    setToDate(range.to);
  }

  return (
    <div className="portal-child-panel portal-usage-panel" role="tabpanel" aria-label="Usage">
      <WorkbenchSection
        title="Usage"
        description="按来源、Provider、模型、Workspace 和事件归一化展示本机可见的 token 用量。"
      >
        <div className="usage-dashboard-shell">
          <div className="usage-dashboard-topbar">
            <div className="usage-source-tabs" role="tablist" aria-label="用量来源">
              {sourceOptions.map((option) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={(source || "all") === option.value}
                  className={`usage-source-tab ${(source || "all") === option.value ? "is-active" : ""}`}
                  key={option.value}
                  onClick={() => setSource(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="usage-dashboard-actions">
              <span className="usage-refresh-hint"><RefreshCw size={13} /> 手动刷新</span>
              <Button type="button" variant="outline" disabled={loading} onClick={() => void loadDashboard()}>
                <RefreshCw size={14} /> 刷新
              </Button>
              <Button type="button" disabled={syncing} onClick={() => void syncExternalLogs()}>
                <RefreshCw size={14} /> {syncing ? "同步中..." : "同步本机日志"}
              </Button>
            </div>
          </div>

          <div className="usage-filter-grid">
            <label className="field-stack">
              <span>Workspace</span>
              <Select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} options={workspaceOptions} />
            </label>
            <label className="field-stack">
              <span>模型</span>
              <Select value={model} onChange={(event) => setModel(event.target.value)} options={modelOptions} />
            </label>
            <label className="field-stack">
              <span>开始日期</span>
              <Input type="date" value={fromDate} onChange={(event) => { setRangePreset("custom"); setFromDate(event.target.value); }} />
            </label>
            <label className="field-stack">
              <span>结束日期</span>
              <Input type="date" value={toDate} onChange={(event) => { setRangePreset("custom"); setToDate(event.target.value); }} />
            </label>
            <label className="field-stack portal-search-field">
              <span>关键词</span>
              <div className="portal-search-input">
                <Search size={14} />
                <Input value={query} placeholder="会话 / 模型 / 路径" onChange={(event) => setQuery(event.target.value)} />
              </div>
            </label>
          </div>

          <div className="usage-range-tabs" aria-label="日期范围快捷选择">
            {rangeOptions.map((option) => (
              <button
                type="button"
                className={`usage-range-tab ${rangePreset === option.value ? "is-active" : ""}`}
                key={option.value}
                onClick={() => applyRangePreset(option.value)}
              >
                <CalendarDays size={13} />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {error ? <div className="inline-alert is-warning"><strong>读取用量失败</strong><span>{error}</span></div> : null}

        <div className="usage-summary-grid">
          <Metric label="总请求数" value={formatInteger(data.summary.eventCount)} icon={<Activity size={18} />} tone="blue" />
          <Metric label="总成本" value="未配置" detail="无价格表，不展示精确成本" icon={<DollarSign size={18} />} tone="green" />
          <Metric label="真实总 Token" value={formatInteger(totalTokenValue)} detail={`Input ${formatCompact(data.summary.inputTokens)} · Output ${formatCompact(data.summary.outputTokens)} · Cache ${formatCompact(cacheTokenTotal)}`} icon={<Layers size={18} />} tone="purple" />
          <Metric label="缓存 Token" value={formatInteger(cacheTokenTotal)} detail={`创建 ${formatCompact(data.summary.cacheCreationTokens)} · 命中 ${formatCompact(data.summary.cacheReadTokens)}`} icon={<Database size={18} />} tone="orange" />
        </div>
      </WorkbenchSection>

      <WorkbenchSection title="分时用量" description={`${rangePresetLabel(rangePreset)}，按时间段展示新增 token。`}>
        <UsageTrendChart points={trendPoints} />
      </WorkbenchSection>

      <WorkbenchSection title="模型 Breakdown" description="同一来源、Provider、模型和 Workspace 会被合并，保留会话数和缓存口径。">
        <div className="portal-table-wrap">
          <table className="portal-data-table">
            <thead>
              <tr>
                <th>模型</th>
                <th>来源</th>
                <th>会话数</th>
                <th>真实总 token</th>
                <th>输入 / 输出 / 缓存</th>
                <th>缓存命中率</th>
              </tr>
            </thead>
            <tbody>
              {data.modelBreakdown.map((row) => (
                <tr key={`${row.source}:${row.providerId}:${row.model}:${row.workspaceId || ""}`}>
                  <td>
                    <div className="portal-primary-cell">
                      <strong>{row.modelLabel || row.model}</strong>
                      <span>{row.providerLabel || row.providerId || row.providerKind || "未知 Provider"}</span>
                    </div>
                  </td>
                  <td>{sourceLabel(row.source)}</td>
                  <td>{row.sessionCount}</td>
                  <td>{formatInteger(row.realTotalTokens)}</td>
                  <td>{formatTokenParts(row)}</td>
                  <td>{formatPercent(row.cacheHitRate)}</td>
                </tr>
              ))}
              {data.modelBreakdown.length === 0 ? <EmptyRow colSpan={6} text={loading ? "读取中..." : "暂无用量数据"} /> : null}
            </tbody>
          </table>
        </div>
      </WorkbenchSection>

      <WorkbenchSection title="明细" description="保留每条事件的原始模型名，便于排查历史模型切换。">
        <div className="portal-table-wrap">
          <table className="portal-data-table">
            <thead>
              <tr>
                <th>时间</th>
                <th>来源</th>
                <th>Workspace / Session</th>
                <th>Provider / Model</th>
                <th>Token 明细</th>
              </tr>
            </thead>
            <tbody>
              {data.events.slice(0, 250).map((event) => (
                <tr key={event.id}>
                  <td>{formatDateTime(event.occurredAt)}</td>
                  <td>{sourceLabel(event.source)}</td>
                  <td>
                    <div className="portal-primary-cell">
                      <strong>{event.workspaceName || "外部日志"}</strong>
                      <span>{event.sessionTitle || event.sessionId || "未知会话"}</span>
                    </div>
                  </td>
                  <td>
                    <div className="portal-primary-cell">
                      <strong>{event.model}</strong>
                      <span>{event.providerLabel || event.providerId || event.providerKind || "未知 Provider"}</span>
                    </div>
                  </td>
                  <td>{formatTokenParts(event)}</td>
                </tr>
              ))}
              {data.events.length === 0 ? <EmptyRow colSpan={5} text={loading ? "读取中..." : "暂无明细"} /> : null}
            </tbody>
          </table>
        </div>
      </WorkbenchSection>

      {data.syncState.some((state) => state.errorMessage) ? (
        <WorkbenchSection title="同步状态" description="单个日志文件出错不会中断 Portal，错误会保留在这里。">
          <div className="usage-sync-errors">
            {data.syncState.filter((state) => state.errorMessage).map((state) => (
              <div className="inline-alert is-warning" key={`${state.source}:${state.filePath}`}>
                <strong>{sourceLabel(state.source)}</strong>
                <span>{state.filePath} · {state.errorMessage}</span>
              </div>
            ))}
          </div>
        </WorkbenchSection>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: ReactNode;
  tone: "blue" | "green" | "purple" | "orange";
}) {
  return (
    <div className="usage-metric">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
      <i className={`usage-metric-icon is-${tone}`}>{icon}</i>
    </div>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="portal-empty-state">{text}</div>
      </td>
    </tr>
  );
}

function dateStart(value: string) {
  if (!value) return undefined;
  const time = new Date(`${value}T00:00:00`).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function dateEnd(value: string) {
  if (!value) return undefined;
  const time = new Date(`${value}T23:59:59.999`).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rangeForPreset(value: string) {
  const now = new Date();
  const today = startOfToday();
  const end = dateInputValue(now);
  if (value === "all") return { from: "", to: "" };
  if (value === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const day = dateInputValue(yesterday);
    return { from: day, to: day };
  }
  if (value === "last7") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { from: dateInputValue(from), to: end };
  }
  if (value === "last30") {
    const from = new Date(today);
    from.setDate(from.getDate() - 29);
    return { from: dateInputValue(from), to: end };
  }
  if (value === "thisWeek") {
    const from = new Date(today);
    const day = from.getDay() || 7;
    from.setDate(from.getDate() - day + 1);
    return { from: dateInputValue(from), to: end };
  }
  if (value === "thisMonth") {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: dateInputValue(from), to: end };
  }
  return { from: dateInputValue(today), to: end };
}

function sourceLabel(source: UsageSource) {
  return source === "any_jumper" ? "Any Jumper" : source === "claude_code" ? "Claude Code" : "Codex CLI";
}

function formatTokenParts(row: {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}) {
  return `输入 ${formatInteger(row.inputTokens)} · 输出 ${formatInteger(row.outputTokens)} · 写入 ${formatInteger(row.cacheCreationTokens)} · 命中 ${formatInteger(row.cacheReadTokens)}`;
}

function formatInteger(value: number) {
  return Math.max(0, Math.trunc(value || 0)).toLocaleString();
}

function formatCompact(value: number) {
  const safe = Math.max(0, Math.trunc(value || 0));
  if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1)}m`;
  if (safe >= 1_000) return `${(safe / 1_000).toFixed(1)}k`;
  return String(safe);
}

function formatPercent(value: number) {
  return `${((Number.isFinite(value) ? value : 0) * 100).toFixed(1)}%`;
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

function rangePresetLabel(value: string) {
  const label = rangeOptions.find((option) => option.value === value)?.label;
  return label ? `当前范围：${label}` : "当前范围：自定义";
}

function UsageTrendChart({ points }: { points: ReturnType<typeof buildUsageTrendPoints> }) {
  if (points.length === 0) return <div className="portal-empty-state">暂无分时用量数据</div>;
  const valueMax = Math.max(...points.flatMap((point) => [point.input, point.output, point.cacheRead, point.cacheCreation]), 1);
  const yAxis = buildUsageTrendYAxis(valueMax);
  const xTicks = buildUsageTrendAxisTicks(points, 8);
  const width = 1000;
  const height = 240;
  const padLeft = 52;
  const padRight = 28;
  const padTop = 24;
  const padBottom = 42;
  const baseline = height - padBottom;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const y = (value: number) => baseline - (value / yAxis.max) * plotHeight;
  const xForIndex = (index: number) => padLeft + (index / Math.max(1, points.length - 1)) * plotWidth;
  const seriesPath = (key: "input" | "output" | "cacheRead" | "cacheCreation") => smoothUsageTrendPath(
    points.map((point, index) => ({ x: xForIndex(index), y: y(point[key]) })),
  );
  const areaPath = `${seriesPath("input")} L ${width - padRight},${baseline} L ${padLeft},${baseline} Z`;
  return (
    <div className="usage-trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="分时用量图">
        <defs>
          <linearGradient id="usageTrendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <text x={padLeft} y={14} className="usage-chart-unit">单位：{yAxis.unitLabel}</text>
        {yAxis.ticks.map((tick) => (
          <g key={tick.value}>
            <line x1={padLeft} x2={width - padRight} y1={y(tick.value)} y2={y(tick.value)} className="usage-chart-grid" />
            <text x={10} y={y(tick.value) + 4} className="usage-chart-label">{tick.label}</text>
          </g>
        ))}
        {xTicks.map((tick) => {
          const tickX = padLeft + tick.position * plotWidth;
          const textAnchor = tick.position <= 0 ? "start" : tick.position >= 1 ? "end" : "middle";
          return (
            <g key={tick.pointIndex}>
              <line x1={tickX} x2={tickX} y1={padTop} y2={baseline} className="usage-chart-grid is-x" />
              <line x1={tickX} x2={tickX} y1={baseline} y2={baseline + 6} className="usage-chart-axis-tick" />
              <circle cx={tickX} cy={baseline} r={3} className="usage-chart-axis-node" />
              <text x={tickX} y={height - 12} textAnchor={textAnchor} className="usage-chart-label usage-chart-x-label">{formatDateTime(tick.at)}</text>
            </g>
          );
        })}
        <line x1={padLeft} x2={width - padRight} y1={baseline} y2={baseline} className="usage-chart-axis" />
        <path d={areaPath} className="usage-chart-area" />
        <path d={seriesPath("input")} className="usage-chart-line is-input" />
        <path d={seriesPath("cacheRead")} className="usage-chart-line is-cache-read" />
        <path d={seriesPath("cacheCreation")} className="usage-chart-line is-cache-creation" />
        <path d={seriesPath("output")} className="usage-chart-line is-output" />
      </svg>
      <div className="usage-chart-legend">
        <span className="is-input">输入</span>
        <span className="is-output">输出</span>
        <span className="is-cache-creation">缓存创建</span>
        <span className="is-cache-read">缓存命中</span>
      </div>
    </div>
  );
}
