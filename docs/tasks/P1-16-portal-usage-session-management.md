# P1-16: Portal 用量管理与会话管理

## 背景

CC Switch 的用量面板不是读取第三方后台，而是从本机 CLI 会话日志、经过代理的请求响应、以及官方或供应商额度接口中采集数据，再落到本地 SQLite 后做归一化统计。

Any Jumper 当前已经在 `turns.token_usage_json` 中保存自身会话的 token usage，且 `turns` 表保留了每个 turn 当时使用的 `provider_id` 和 `model`。因此本任务要在 Portal 中新增两个子标签页，在 `Quick Ask` 之前提供：

1. **用量管理**：展示 Any Jumper 内部用量，并参考 CC Switch 支持本机 Codex / Claude Code 日志采集。
2. **会话管理**：管理 Any Jumper 自己的会话，支持搜索、筛选、打开、重命名、归档 / 取消归档。

## 目标

- Portal 子标签顺序调整为：`用量管理`、`会话管理`、`Quick Ask`、`Main App`。
- 用量统计按 `source + provider + model + workspace + session` 维度展示，支持 Any Jumper 和本机外部 CLI 日志来源。
- Any Jumper 和 Claude Code 都可能在同一会话内使用多个模型，页面必须能展示模型明细，不能只展示会话当前模型。
- 会话管理页复用现有 threads 数据，不做物理删除。
- 统计口径明确区分真实总 token、cache read、cache creation、fresh input 和缓存命中率。

## 非目标

- 不读取 `~/.cc-switch/cc-switch.db`，避免依赖第三方工具的私有库结构。
- 不实现账号全局账单。外部 CLI 采集只代表本机日志中可见的用量。
- 不在本任务中实现精确成本计费。没有价格表时不要展示伪精确成本；如需展示，必须标注为估算。
- 不编辑、删除或移动 Claude Code / Codex 的原始日志文件。
- 不把外部 CLI session 做成可归档 / 可重命名对象；外部日志只用于用量统计和只读会话来源展示。

## 当前代码入口

- Portal 页面：`src/pages/PortalPage.tsx`
  - 当前 `PortalSubTab = "quickAsk" | "mainApp"`。
  - 当前 tab 顺序只有 `Quick Ask` 和 `Main App`。
- Portal 布局测试：`src/pages/PortalPage.layout.test.ts`
  - 当前断言仍包含旧的 `PortalSubTab` 类型和 tab 文案。
- 类型定义：`src/types/index.ts`
  - `TurnTokenUsage` 已包含 `inputTokens`、`outputTokens`、`totalTokens`、`cacheCreation`、`cacheRead`。
  - `AgentTurn` 已包含 `providerId`、`model`、`tokenUsage`。
- Electron 数据库：`electron/main.ts`
  - `turns.token_usage_json` 已落库。
  - `threads.archived` 已存在。
  - `thread_list` 当前只返回 `archived=0`。
  - 已有 `thread_archive`、`thread_name_set`、`portal_open_chat`。
- 前端 API：`src/services/desktopApi.ts`
  - 已有 `workspaceList`、`threadList`、`threadArchive`、`threadNameSet`、`portalOpenChat`。

## 数据来源与统一模型

### Source

统一用量事件必须包含来源：

```ts
type UsageSource = "any_jumper" | "claude_code" | "codex_cli";
```

本任务先支持三类来源：

- `any_jumper`：从 Any Jumper 自己的 `turns`、`threads`、`workspaces`、`model_configs` 聚合。
- `claude_code`：扫描 `~/.claude/projects/**/*.jsonl`。
- `codex_cli`：扫描 `~/.codex/sessions/**/*.jsonl` 和 `~/.codex/archived_sessions/**/*.jsonl`。

Gemini 日志采集不在本任务范围内，但类型和 UI 不应写死成只有 Claude / Codex。

### NormalizedUsageEvent

实现时建议先在 `src/types/index.ts` 增加统一类型：

```ts
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
```

重要约束：

- Any Jumper 历史用量必须使用 `turns.model`，不能用当前 workspace 或 provider 配置反推。
- Claude Code / Codex 日志必须从每条日志里提取实际模型名，不能按文件或会话只存一个模型。
- 同一个 session 里出现多个模型时，聚合层要保留模型 breakdown。

## 统计口径

用量汇总统一派生：

```ts
freshInputTokens = inputTokens - cacheReadTokens
realTotalTokens = freshInputTokens + outputTokens + cacheCreationTokens + cacheReadTokens
cacheHitRate = cacheReadTokens / (freshInputTokens + cacheCreationTokens + cacheReadTokens)
```

约束：

- 当 `inputTokens < cacheReadTokens` 时，`freshInputTokens` 按 `inputTokens` 处理，不产生负数。
- Any Jumper 走 OpenAI-compatible provider 时，`inputTokens` 通常包含 cache read，需要按上面公式归一化。
- Claude / Anthropic 风格日志如果 input 已经是 fresh input，也要通过 `source/providerKind` 做语义判断，避免重复扣减。
- 前端展示必须明确显示 `输入`、`输出`、`缓存写入`、`缓存命中`、`真实总 token`、`缓存命中率`。

## 实现任务

### 任务 1：调整 Portal 子标签结构

涉及文件：

- `src/pages/PortalPage.tsx`
- `src/pages/PortalPage.layout.test.ts`

要求：

- 将 `PortalSubTab` 扩展为 `"usage" | "sessions" | "quickAsk" | "mainApp"`。
- `portalSubTabs` 顺序为：用量管理、会话管理、Quick Ask、Main App。
- 默认选中 `usage`。
- 将 Quick Ask 和 Main App 现有内容保持原样。
- 新建两个独立子组件：
  - `src/pages/portal/PortalUsageManagement.tsx`
  - `src/pages/portal/PortalSessionManagement.tsx`

### 任务 2：实现用量归一化工具

涉及文件：

- 新建 `src/utils/usageStats.ts`
- 新建 `src/utils/usageStats.test.ts`
- 修改 `src/types/index.ts`

要求：

- 提供 `normalizeUsageTotals(event)`，返回 fresh input、real total、cache hit rate。
- 提供 `groupUsageByModel(events)`。
- 提供 `groupUsageBySession(events)`，输出 session 的主模型和模型明细。
- 多模型会话的主模型按真实总 token 最大的模型决定。
- 所有聚合函数要对空数组、缺失 cache 字段、异常 token 数值做稳定处理。

### 任务 3：实现用量查询 IPC

涉及文件：

- `electron/main.ts`
- `src/services/desktopApi.ts`
- `src/types/index.ts`

建议 API：

```ts
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
```

要求：

- 新增 `desktopApi.usageDashboard(request)`。
- Electron 新增 `usage_dashboard` command。
- Any Jumper 内部用量查询直接从 `turns` 投影为 `NormalizedUsageEvent`，不要重复写回一份内部 usage event。
- 查询必须关联 `threads`、`workspaces`、`model_configs`，补齐 workspace 和 provider 展示信息。
- 支持按来源、workspace、model、时间范围、关键词过滤。

### 任务 4：实现外部 CLI 日志采集

涉及文件：

- `electron/main.ts`，或拆分新文件后由 main 引入。
- `src/types/index.ts`

建议新增本地表：

```sql
CREATE TABLE IF NOT EXISTS external_usage_events (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  session_id TEXT,
  file_path TEXT NOT NULL,
  event_key TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  occurred_at INTEGER NOT NULL,
  raw_json TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(source, file_path, event_key)
);

CREATE TABLE IF NOT EXISTS external_usage_sync_state (
  source TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_mtime INTEGER NOT NULL DEFAULT 0,
  file_size INTEGER NOT NULL DEFAULT 0,
  last_synced_at INTEGER NOT NULL,
  error_message TEXT,
  PRIMARY KEY(source, file_path)
);
```

要求：

- 新增 `desktopApi.usageSyncExternal()` 和 Electron `usage_sync_external` command。
- Codex 日志扫描：
  - `~/.codex/sessions/**/*.jsonl`
  - `~/.codex/archived_sessions/**/*.jsonl`
  - 优先从 `event_msg` 的 `token_count` 事件提取 `total_token_usage` delta。
  - 无法使用 delta 时，fallback 到单条事件中的 `last_token_usage`。
- Claude Code 日志扫描：
  - `~/.claude/projects/**/*.jsonl`
  - 从日志中提取 message usage、model、session id、timestamp。
  - 支持 `input_tokens`、`output_tokens`、`cache_creation_input_tokens`、`cache_read_input_tokens` 等 Anthropic 常见字段。
- 同一个文件多次同步不得重复计数。
- 文件不存在、权限不足、单行 JSON 损坏时，不能让整个 Portal 崩溃；需要记录到 sync state 并在 UI 展示简短错误。
- 外部日志采集只在用户点击同步或页面刷新时触发，不做后台常驻 watcher。

### 任务 5：实现用量管理页面

涉及文件：

- `src/pages/portal/PortalUsageManagement.tsx`
- `src/styles/theme.css`，如需要补样式。

页面要求：

- 顶部展示摘要：
  - 真实总 token
  - 输入 token
  - 输出 token
  - 缓存写入
  - 缓存命中
  - 缓存命中率
- 提供筛选：
  - 来源：全部 / Any Jumper / Claude Code / Codex CLI
  - Workspace
  - 模型
  - 时间范围
  - 关键词
- 展示模型 breakdown：
  - 模型名
  - 来源
  - 会话数
  - 真实总 token
  - 输入 / 输出 / 缓存
  - 缓存命中率
- 展示会话 breakdown：
  - 会话标题或 session id
  - source
  - workspace
  - 主模型
  - 多模型数量，例如 `Claude Sonnet 4 +2`
  - 展开后展示每个模型的 token 明细
- 展示明细表：
  - 时间
  - source
  - workspace / session
  - provider / model
  - token 明细
- 提供“同步本机日志”按钮，调用 `usageSyncExternal()` 后刷新 dashboard。

### 任务 6：实现会话管理页面

涉及文件：

- `src/pages/portal/PortalSessionManagement.tsx`
- `src/services/desktopApi.ts`
- `electron/main.ts`
- `src/types/index.ts`

要求：

- 会话管理只管理 Any Jumper 自己的 `threads`。
- `threadList` 需要支持返回 active / archived / all，或新增独立 IPC。
- 支持筛选：
  - Workspace
  - 状态：活跃 / 已归档 / 全部
  - 模型
  - 关键词
- 每个会话展示：
  - 标题
  - workspace
  - 状态
  - 更新时间
  - 主模型
  - 多模型标记和模型明细
  - 真实总 token
- 操作：
  - 打开：调用 `portalOpenChat(workspaceId, threadId)`。
  - 重命名：调用 `threadNameSet`。
  - 归档：调用 `threadArchive`。
  - 取消归档：新增 `thread_unarchive` 或等价 API。
- 不提供物理删除入口。

### 任务 7：测试与验证

涉及文件：

- `src/pages/PortalPage.layout.test.ts`
- `src/utils/usageStats.test.ts`
- 可新增 Electron 源码结构测试或 parser 单测。

至少覆盖：

- Portal tab 顺序和默认 tab。
- 旧 Quick Ask / Main App 配置仍存在。
- real total 和 cache hit rate 计算。
- cache read 不会导致 fresh input 为负数。
- 单 session 多模型时，主模型按真实总 token 最大决定。
- Any Jumper 历史统计使用 `turns.model`，不依赖当前 workspace 默认模型。
- 外部日志 parser 对重复同步幂等。
- 外部日志 parser 遇到坏 JSON 行时返回错误状态，不抛到 UI。

建议命令：

```bash
pnpm exec vitest run src/pages/PortalPage.layout.test.ts src/utils/usageStats.test.ts
pnpm typecheck
pnpm test
pnpm build
```

## 验收标准

### Portal 入口

- [ ] Portal 页面出现 4 个子标签，顺序严格为：`用量管理`、`会话管理`、`Quick Ask`、`Main App`。
- [ ] 首次进入 Portal 默认展示 `用量管理`。
- [ ] Quick Ask 和 Main App 原有配置项、保存逻辑、快捷键录入逻辑不回退。

### 用量管理

- [ ] 页面能展示 Any Jumper 内部历史用量，即使没有外部日志也不为空白崩溃。
- [ ] 页面支持按 source、workspace、model、时间范围、关键词筛选。
- [ ] 摘要中展示真实总 token、输入、输出、缓存写入、缓存命中、缓存命中率。
- [ ] 模型 breakdown 能区分同一个 provider 下的不同模型。
- [ ] 会话 breakdown 能展示同一会话的多模型明细。
- [ ] 明细表保留每条事件的原始模型名。
- [ ] 没有价格表时不展示精确成本数字。

### 外部日志采集

- [ ] 点击“同步本机日志”后能扫描 Codex 和 Claude Code 默认日志目录。
- [ ] 多次点击同步不会重复累加同一条日志。
- [ ] 日志文件缺失、权限不足、坏 JSON 行不会导致页面崩溃。
- [ ] Codex token_count 累计值能按 delta 计算，避免把累计值重复当成单次用量。
- [ ] Claude Code 的 cache read / cache creation 字段能进入统一统计。
- [ ] 外部日志产生的 session 是只读用量来源，不出现归档、重命名等管理按钮。

### 会话管理

- [ ] 页面能列出 Any Jumper active 和 archived 会话。
- [ ] 支持 workspace、状态、模型、关键词筛选。
- [ ] 支持打开、重命名、归档、取消归档。
- [ ] 不提供物理删除入口。
- [ ] 一个 Any Jumper 会话包含多个模型时，列表展示主模型和 `+N`，展开后能看到模型明细。

### 数据正确性

- [ ] 统计历史模型时使用 turn / external event 当时记录的 model，不受当前模型配置变更影响。
- [ ] cache read 不会被重复计入 fresh input。
- [ ] `realTotalTokens` 和 `cacheHitRate` 的计算和 `src/utils/usageStats.ts` 单测一致。
- [ ] Any Jumper 内部用量和外部 CLI 用量按 source 分开展示，也能在“全部”视图合并。

### 工程质量

- [ ] 新增代码通过 `pnpm typecheck`。
- [ ] 新增和既有测试通过 `pnpm test`。
- [ ] 应用通过 `pnpm build`。
- [ ] UI 不出现文本溢出、按钮抖动、卡片套卡片。
- [ ] 新文件职责清晰，PortalPage 不继续膨胀为巨型页面。

## 交给 /goal 的指令

```text
/goal 请根据 docs/tasks/P1-16-portal-usage-session-management.md 完成 Portal 用量管理与会话管理功能。

重点要求：
1. Portal 子标签顺序为：用量管理、会话管理、Quick Ask、Main App。
2. 用量管理必须支持 Any Jumper 内部用量、Codex CLI 日志、Claude Code 日志。
3. 统计必须按 source/provider/model/workspace/session 维度归一化。
4. Any Jumper 和 Claude Code 的同一会话可能使用多个模型，必须展示模型明细，不能只展示一个当前模型。
5. 会话管理只管理 Any Jumper threads，支持打开、重命名、归档、取消归档，不做物理删除。
6. 按文档中的验收标准补充测试，并运行 pnpm typecheck、pnpm test、pnpm build。
```
