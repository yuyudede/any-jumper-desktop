# Codex-like 主会话工作台页面复刻设计

日期：2026-05-21

## 背景

Any Jumper Desktop 当前已经是 Electron + React + Vite + Ant Design 桌面端，主进程内已有 DeepAgents runtime、SQLite 存储、MCP、Skills、Plugins、Git 操作、审批和模型配置能力。本次目标不是替换后台，而是先把主会话工作台做成接近 Codex Desktop 的页面体验。

设计边界：复刻交互结构、布局密度、视觉层级和工作流体验；不复制 OpenAI/Codex 的商标、图标、专有品牌资产和闭源实现。产品仍保持 Any Jumper 身份，后台仍走现有 `desktopApi` 和 Electron 主进程。

## 目标

- 将 `AgentPage` 改造成 Codex-like 三栏工作台：左侧项目/会话，中间 transcript + composer，右侧执行/工具/Git/扩展检查栏。
- 保留现有能力入口：工作区管理、会话创建/切换/重命名/归档、发送/排队/停止、分叉、重试、编辑重跑、模型切换、权限模式、文件附件、审批、工具调用、Git diff/status、MCP/Skills/Plugins 展示。
- 优先完成主会话页面的高保真视觉和交互，不在第一版改造 `ModelPage`。
- 现有 IPC 命令、数据类型、SQLite schema、DeepAgents runtime 不在本阶段调整。

## 非目标

- 不接入官方 Codex App Server。
- 不实现 Codex 云任务、GitHub PR 创建、ChatGPT 账号登录或官方 Codex 同步。
- 不重写 agent runtime、沙箱、权限系统或 MCP 调度。
- 不复制 OpenAI 品牌资产。
- 不把模型配置页、全局设置页纳入第一阶段。

## 用户体验设计

主界面采用三栏布局：

- 左侧栏：应用标识、工作区选择、工作区操作、新建会话、会话列表、会话更多操作。视觉上更接近 Codex 的紧凑导航栏，减少说明性文字，突出当前项目和当前会话。
- 中间栏：顶部状态条、对话 transcript、底部 composer。用户消息靠右成气泡，助手消息走共享内容轨道；thinking trace 保持可折叠时间线；composer 保持多行输入、附件、权限、模型和发送按钮。
- 右侧栏：保留可拖拽宽度和可折叠能力，内容改造成 Codex-like inspector。第一版包含 Flow、Git、Ext 三个 tab，对应现有执行步骤/审批/工具调用、Git 状态/diff、MCP/Skills/Plugins。

空状态要显得像产品界面而不是调试面板：

- 没有工作区：中间显示选择/创建工作区入口。
- 没有会话：中间显示新建会话入口。
- 缺 API Key：composer 附近和模型 drawer 中保留明确警示。
- 等待审批：右侧 Flow tab 给出突出审批卡片。

## 架构设计

第一阶段以 renderer 重构为主：

- `src/pages/AgentPage.tsx` 继续作为容器，保留现有数据加载、事件订阅和动作函数。
- 将大块 JSX 逐步拆出轻量组件，优先围绕布局边界拆分：
  - `AgentSidebar`：工作区和会话列表。
  - `AgentTranscript`：消息、thinking trace、session actions。
  - `AgentComposer`：输入框和 composer actions。
  - `AgentInspector`：Flow/Git/Ext tabs。
- `src/styles/theme.css` 更新视觉 token、三栏布局、暗色优先样式和响应式规则。
- 保持 `desktopApi` API 不变，避免主进程联动风险。

数据流保持现状：

- `workspaceList`、`threadList`、`threadRead` 驱动左侧和 transcript。
- `turnStart`、`turnEnqueue`、`turnSteer`、`turnInterrupt` 驱动 composer 行为。
- `onAgentEvent` 继续刷新 thread detail。
- `gitStatus`、`gitDiff`、`mcpList`、`skillList`、`pluginList` 驱动右侧栏。
- `approvalResolve` 处理工具审批。

## 组件行为

- 左侧工作区和会话行必须支持点击、键盘 Enter/Space、hover actions、当前项高亮。
- 中间状态条保留当前会话标题、运行状态、模型、队列、审批和工具调用统计。
- composer 继续支持 Enter 发送、Shift+Enter 换行，发送中禁用重复提交。
- 右侧 inspector 保留拖拽调整宽度、双击恢复默认宽度、收起/展开。
- 小屏响应式：窄屏下隐藏右侧 inspector，左侧栏压缩宽度，中间 composer 不溢出。

## 样式方向

- 暗色优先，保持浅色主题可用。
- 使用克制的中性色、细边框、紧凑间距、低圆角，避免营销页式卡片堆叠。
- 主工作台不使用大面积装饰图形或渐变背景。
- 图标继续使用现有 `@ant-design/icons`，不新增图标库。
- 所有按钮和标签文本必须在窄屏下不溢出。

## 错误处理

沿用现有错误处理：

- IPC 错误通过 `errorMessage` / `errorDetail` 转为用户可见 message 或 alert。
- 模型 Key 缺失走现有 `modelKeyMissing` 提示。
- 工作区、线程、Git、MCP 等加载失败继续通过 `message.error` 和 activity 状态提示。

本阶段不新增后台错误类型。

## 测试策略

- 保留并更新现有静态布局测试：
  - `AgentPage.messageLayout.test.ts`
  - `App.navigation.test.ts`
- 新增或更新针对主页面结构的测试，覆盖：
  - 三栏工作台关键 class 存在。
  - 不重新引入全局 top bar / side-nav。
  - assistant 消息仍不强制 full-width。
  - thinking trace 仍为可折叠结构。
- 运行：
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- 如启动本地 Electron 可行，再用应用实际窗口做一次视觉检查。

## 交付顺序

1. 提取或整理 `AgentPage` 内部布局组件，保持行为不变。
2. 调整主三栏 JSX 结构和 class 命名。
3. 更新 `theme.css` 的 Codex-like 工作台样式。
4. 补齐空状态和响应式规则。
5. 更新测试并运行验证。

## 风险与缓解

- `AgentPage.tsx` 较大，直接重构容易引入行为回归。缓解：先拆视觉边界，不改核心状态和动作函数。
- CSS 体量较大，新增样式可能影响旧页面。缓解：尽量以 `agent-` / `codex-` 范围选择器包裹。
- Electron 视觉验证可能受本地环境影响。缓解：至少完成 typecheck/test/build，能启动时再做手动视觉检查。
- 视觉“像 Codex”的标准主观。缓解：以三栏结构、暗色密度、composer、inspector、会话列表为第一版验收重点。

## 验收标准

- 打开应用默认进入 Codex-like 主会话工作台。
- 可以创建/选择工作区和会话。
- 可以发送消息，运行中状态、停止、队列和审批仍工作。
- 可以查看工具调用、审批、Git 状态、MCP/Skills/Plugins。
- 模型切换 drawer 仍可打开并使用现有模型配置。
- 窄屏下主要内容不重叠、不溢出。
- `pnpm typecheck`、`pnpm test`、`pnpm build` 通过。
