# 左侧栏完全折叠设计

日期：2026-05-24

## 背景

Any Jumper Desktop 当前的 Agent 页面在左侧栏收起后仍保留 60px 的 mini rail。mini rail 提供 Agent-Bridge、Model-Config、Portal、Plugin、Project 和主题切换入口，但它仍会占用主内容区横向空间，也让“收起侧栏”在视觉上更像切换成窄导航栏。

用户已确认采用 B 方案：去除左侧栏窄栏样式，收起后直接完全折叠。

## 目标

- 左侧栏收起后不再渲染或显示 mini rail。
- 收起状态不再保留 60px 功能侧栏列，主内容区在避开 macOS 红绿灯安全区后占满可用宽度。
- 顶部状态栏中的左侧栏按钮继续作为展开入口。
- 展开状态保留现有侧栏内容、宽度和拖拽调整能力。
- 紧凑窗口下也不再自动降级为 mini rail。
- 收起后会话主题、状态 pill 和模型信息不得与 macOS 红绿灯按钮重叠。

## 非目标

- 不重排 Agent-Bridge、Model-Config、Portal、Plugin 等完整侧栏入口。
- 不新增浮动抽屉、悬浮导航或快捷键体系。
- 不改变右侧面板、底部终端、会话选择或项目树的数据逻辑。
- 不修改主题配色或整体视觉语言。

## 用户体验

展开状态保持现状：左侧栏显示功能入口、Project 树、当前路径和主题按钮，用户可以拖拽调整宽度。

收起状态变化为完全隐藏左侧栏：

- 不显示左侧功能侧栏和 mini rail。
- 保留 `--window-control-safe-width` 作为左上角系统窗口控制安全留白；这个留白只用于避开红绿灯，不承载任何侧栏入口。
- 侧栏 resize handle 不显示。
- 主内容区从窗口安全区之后直接铺开，确保会话主题第一行不会进入红绿灯按钮区域。
- 用户通过顶部状态栏的 `PanelLeftOpen` 按钮展开侧栏。

紧凑窗口下不再强制显示 60px mini rail。窗口变窄时，侧栏收起行为仍与桌面宽屏一致；已展开的侧栏按现有响应式规则处理，但不会产生新的窄栏模式。

## 组件与样式设计

`src/pages/AgentPage.tsx`：

- 删除 `agent-mini-rail` 结构及相关按钮。
- `--agent-sidebar-width` 只表达展开宽度，不再在折叠时写入 `60px`。
- 保留 `sidebarCollapsed` 状态、顶部切换按钮和折叠时隐藏 `ResizeHandle` 的行为。

`src/styles/theme.css`：

- `.agent-workbench.is-sidebar-collapsed` 的列定义改为 `var(--window-control-safe-width) minmax(0, 1fr)` 或等价布局：左列只作为 macOS window-control 安全区，不显示侧栏内容。
- 折叠状态下 `.agent-sidebar` 隐藏，不参与布局、不接收交互。
- 折叠状态下 `.agent-status-strip` / `.agent-status-copy` 需要保持在安全区右侧，避免标题、运行状态 badge、模型 meta 与红绿灯重叠。
- 删除 `.agent-mini-rail*` 相关样式与 tooltip 样式。
- 更新 `@media (max-width: 1180px)` 中对 mini rail 的强制显示规则，避免紧凑窗口继续保留窄栏。

## 测试

更新现有字符串型布局测试：

- `src/pages/AgentPage.messageLayout.test.ts` 中 mini rail 相关断言改为完全折叠断言。
- `src/app/App.navigation.test.ts` 中侧栏导航顺序和顶部按钮断言继续保留，但不再要求 `agent-mini-rail-theme-toggle`。

重点验证：

- 折叠状态不包含 `60px` 侧栏列。
- 折叠状态不渲染 mini rail。
- 折叠状态仍保留 `--window-control-safe-width`，并验证标题区域不会压到 macOS 红绿灯安全区。
- 折叠时不渲染 resize handle。
- 展开按钮仍显示正确 icon、label 和 `aria-pressed`。
- 紧凑窗口样式不再强制显示 mini rail。

## 风险与处理

完全折叠会牺牲收起状态下的快速导航入口。这个风险由顶部左侧栏展开按钮承担：用户需要先展开侧栏再进入 Agent-Bridge、Model、Portal 或 Plugin。由于本次目标明确是“收起后完全折叠”，不新增第二套入口，以避免又形成新的窄导航层。
