# 展示层优化任务总览

> 通过对 Proma 项目的对比分析，梳理出以下可落地的展示层优化任务。
> 每个任务独立一个文档，包含：目标、Proma 参考方案、当前 any-jumper-desktop 现状、实施要点。

## P0 — 高影响低成本，建议立即采用

| # | 任务 | 文件 | 说明 |
|---|---|---|---|
| 1 | 代码块流式渲染优化 | [P0-01-codeblock-streaming.md](P0-01-codeblock-streaming.md) | Token 级逐行 + React.memo + 80ms 节流 |
| 2 | Mermaid 渲染策略重构 | [P0-02-mermaid-rendering.md](P0-02-mermaid-rendering.md) | 双层叠加 + 防抖 + 竞态保护，保留现有主题 |
| 3 | 消息组件原语化拆分 | [P0-03-message-components.md](P0-03-message-components.md) | 从 AgentPage 拆分独立消息组件 |
| 4 | 对话滚动体验优化 | [P0-04-conversation-scroll.md](P0-04-conversation-scroll.md) | stick-to-bottom + 滚动到底部按钮 |

## P1 — 显著差异化功能

| # | 任务 | 文件 | 说明 |
|---|---|---|---|
| 5 | 消息导航迷你地图 | [P1-05-scroll-minimap.md](P1-05-scroll-minimap.md) | 右侧横杠预览 + 搜索 + 可拖拽滚动条 |
| 6 | 悬浮用户消息回看 | [P1-06-sticky-user-message.md](P1-06-sticky-user-message.md) | 滚出视口的用户消息顶部悬浮显示 |
| 7 | 文件路径芯片 | [P1-07-file-path-chip.md](P1-07-file-path-chip.md) | 行内代码中识别文件路径，点击打开 |
| 8 | 思考过程折叠面板 | [P1-08-reasoning-collapsible.md](P1-08-reasoning-collapsible.md) | 流式自动展开、结束 1s 折叠、计时 |

## P2 — 布局与交互增强

| # | 任务 | 文件 | 说明 |
|---|---|---|---|
| 9 | 侧边栏折叠 Mini Rail | [P2-09-sidebar-collapse.md](P2-09-sidebar-collapse.md) | 60px 纯图标模式，hover 展开 |
| 10 | 文件浏览器组件 | [P2-10-file-browser.md](P2-10-file-browser.md) | 文件树 + 多选 + 操作菜单 + 自动定位 |
| 11 | 内联文件预览面板 | [P2-11-preview-panel.md](P2-11-preview-panel.md) | 嵌入右侧的 Diff 预览 + 独立窗口 |
| 12 | 工具结果专用渲染器 | [P2-12-tool-result-renderers.md](P2-12-tool-result-renderers.md) | Bash 终端风格等各类型专用渲染 |

## P3 — 锦上添花

| # | 任务 | 文件 | 说明 |
|---|---|---|---|
| 13 | 富文本输入升级 | [P3-13-rich-text-input.md](P3-13-rich-text-input.md) | TipTap 集成，mention 建议 |
| 14 | 面板拖拽分割线 | [P3-14-resizable-panels.md](P3-14-resizable-panels.md) | 面板宽度/高度可拖拽调整 |
| 15 | 会话归档系统 | [P3-15-conversation-archive.md](P3-15-conversation-archive.md) | active/archived 双视图 + 置顶 |

---

## Proma 值得保留的 any-jumper-desktop 亮点

以下现有能力在优化时应保留：
- **Mermaid 主题**：140+ 行极致精细的语义化调色板
- **Shiki v4**：最新代码高亮 + transformer 支持
- **theme.css**：完善的 CSS 设计 Token 体系
- **Radix 原语**：直接使用 Radix 底层组件
