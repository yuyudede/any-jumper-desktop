# Goal: Any Jumper Desktop 展示层优化

## 背景

基于对 Proma（同级项目）展示层的对比分析，any-jumper-desktop 在消息渲染、流式优化、布局系统、文件预览等方面存在明显差距。本 Goal 以 Proma 的优秀实践为参考，分阶段提升 any-jumper-desktop 的展示体验。

## 核心目标

提升 AI 对话类桌面应用的展示体验，对标 Proma 的用户体验水平。

## 成功指标

- [ ] 流式输出时代码块不再闪烁或跳动
- [ ] Mermaid 图表在流式输入时保持稳定不重排
- [ ] 长对话中用户可以在 3 秒内定位到任意历史消息
- [ ] Agent 修改文件后，文件树能自动定位并高亮目标文件
- [ ] 消息组件从 AgentPage.tsx 中独立出来，每个组件 < 300 行

---

## Milestone 1: 核心展示流畅度（P0，预计 2-3 天）

### 1.1 代码块流式渲染优化
- **目标**：Token 级逐行渲染，流式输出时不闪烁
- **方案**：`highlightToTokens` + React.memo 每行 + 80ms 节流
- **参考**：[P0-01-codeblock-streaming.md](tasks/P0-01-codeblock-streaming.md)
- **涉及**：`src/components/MarkdownRenderer.tsx`

### 1.2 Mermaid 渲染策略重构
- **目标**：源码优先、SVG 覆盖淡入，零布局跳动
- **方案**：双层叠加 + 350ms 防抖 + generation 竞态保护
- **保留**：现有 140+ 行精细 Mermaid 主题配置
- **参考**：[P0-02-mermaid-rendering.md](tasks/P0-02-mermaid-rendering.md)
- **涉及**：`src/components/MarkdownRenderer.tsx`

### 1.3 消息组件原语化拆分
- **目标**：从 AgentPage.tsx 拆出独立可复用的消息组件
- **产出**：`Message`, `MessageHeader`, `MessageContent`, `MessageResponse`, `MessageActions`, `UserMessageContent`, `MessageLoading`
- **参考**：[P0-03-message-components.md](tasks/P0-03-message-components.md)
- **涉及**：`src/pages/AgentPage.tsx` + 新建 `src/components/message/`

### 1.4 对话滚动体验优化
- **目标**：智能自动滚动 + 滚动到底部按钮
- **方案**：集成 `use-stick-to-bottom` 库
- **参考**：[P0-04-conversation-scroll.md](tasks/P0-04-conversation-scroll.md)
- **涉及**：新建 `src/components/conversation/`

---

## Milestone 2: 差异化交互体验（P1，预计 3-4 天）

### 2.1 消息导航迷你地图
- **目标**：右侧横杠预览 + 悬停消息列表 + 可拖拽滚动条
- **方案**：ScrollMinimap 组件，180ms 延迟展开，搜索过滤
- **依赖**：M1.4 (use-stick-to-bottom)
- **参考**：[P1-05-scroll-minimap.md](tasks/P1-05-scroll-minimap.md)

### 2.2 悬浮用户消息回看
- **目标**：用户消息滚出视口时顶部显示精简悬浮条
- **方案**：StickyUserMessage，毛玻璃背景，点击回滚
- **依赖**：M1.4 (use-stick-to-bottom), M1.3 (UserMessageContent)
- **参考**：[P1-06-sticky-user-message.md](tasks/P1-06-sticky-user-message.md)

### 2.3 文件路径芯片
- **目标**：消息中自动识别文件路径，渲染为可点击芯片
- **方案**：FilePathChip + BasePathsContext
- **依赖**：M1.3 (MessageResponse)
- **参考**：[P1-07-file-path-chip.md](tasks/P1-07-file-path-chip.md)

### 2.4 思考过程折叠面板
- **目标**：推理内容自动折叠 + 计时 + 流式自动展开
- **方案**：Reasoning / ReasoningTrigger / ReasoningContent
- **依赖**：M1.3 (消息组件)
- **参考**：[P1-08-reasoning-collapsible.md](tasks/P1-08-reasoning-collapsible.md)

---

## Milestone 3: 布局与工具增强（P2，预计 4-5 天）

### 3.1 侧边栏折叠 Mini Rail
- **目标**：60px 纯图标模式，释放屏幕空间
- **方案**：折叠/展开动画 + 最近会话入口 + Tooltip
- **参考**：[P2-09-sidebar-collapse.md](tasks/P2-09-sidebar-collapse.md)

### 3.2 文件浏览器组件
- **目标**：完整文件树，懒加载、多选、重命名、自动定位
- **方案**：FileBrowser + FileTreeItem + FileTypeIcon
- **参考**：[P2-10-file-browser.md](tasks/P2-10-file-browser.md)

### 3.3 内联文件预览面板
- **目标**：右侧 Diff 预览，Split/Unified 双模式，可独立窗口
- **方案**：PreviewPanel + DiffView + DiffChangesList
- **依赖**：M3.2 (FileBrowser)
- **参考**：[P2-11-preview-panel.md](tasks/P2-11-preview-panel.md)

### 3.4 工具结果专用渲染器
- **目标**：为 Bash/Edit/Read/Write 等设计专用渲染器
- **方案**：渲染器注册表 + Bash 终端风格优先
- **依赖**：M1.3 (结果展示组件)
- **参考**：[P2-12-tool-result-renderers.md](tasks/P2-12-tool-result-renderers.md)

---

## Milestone 4: 锦上添花（P3，按需实施）

### 4.1 富文本输入升级
- **目标**：TipTap 集成，支持语法高亮和 mention 建议
- **参考**：[P3-13-rich-text-input.md](tasks/P3-13-rich-text-input.md)

### 4.2 面板拖拽分割线
- **目标**：所有面板尺寸可拖拽调整
- **参考**：[P3-14-resizable-panels.md](tasks/P3-14-resizable-panels.md)

### 4.3 会话归档与置顶
- **目标**：active/archived 双视图 + Pin 置顶 + 日期分组
- **参考**：[P3-15-conversation-archive.md](tasks/P3-15-conversation-archive.md)

---

## 依赖关系图

```
M1.3 消息组件 ──┬── M2.3 文件路径芯片
               ├── M2.4 思考折叠面板
               └── M3.4 工具结果渲染器

M1.4 滚动体验 ──┬── M2.1 迷你地图
               └── M2.2 悬浮消息

M3.2 文件浏览器 ──── M3.3 预览面板

M1.1 代码块 ──── 独立
M1.2 Mermaid ── 独立
M3.1 Mini Rail ─ 独立

M4.* ────────── 按需实施
```

## 不变原则

- 保留现有 Mermaid 精细主题配置
- 保留 Shiki v4 + transformer
- 保留 theme.css 设计 Token 体系
- 保留现有 vitest 测试覆盖
- 不改变后端 IPC 协议（仅在前端层面优化）
