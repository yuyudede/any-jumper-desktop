# P2-11: 内联文件预览面板

## 目标

在 Agent 视图右侧添加文件预览面板，自动跟随 Agent 修改的文件展示 Diff，支持弹出为独立窗口。

## 当前现状 (any-jumper-desktop)

`GitDiffViewer` 独立展示 Git diff，不支持内联预览或独立窗口。

## Proma 参考方案

### 整体架构

```
AgentView
├── LeftSidebar
├── MainArea (消息区域)
│   └── PreviewPanel (内联)
└── RightSidePanel
    └── SidePanel
        ├── Tab: 工作区文件 (FileBrowser)
        └── Tab: 代码改动 (DiffChangesList)
```

### PreviewPanel

`apps/electron/src/renderer/components/diff/PreviewPanel.tsx`:

嵌入 AgentView 右侧，始终显示当前选中文件的 diff：
- 顶部栏：文件名 + 弹出独立窗口按钮 + 关闭按钮
- 内容区：DiffTabContent（Split/Unified 双模式）
- 关闭时隐藏面板（通过 `previewPanelOpenMapAtom` 控制）

```tsx
<PreviewPanel sessionId={sessionId}>
  {/* 顶部栏 */}
  <div className="flex items-center h-[34px] px-3 border-b">
    <span>{fileName}</span>
    <button onClick={openDetached}>[Maximize2 图标]</button>
    <button onClick={closePanel}>[X 图标]</button>
  </div>
  {/* Diff 内容 */}
  <DiffTabContent readOnly filePath={...} />
</PreviewPanel>
```

### DiffView

`apps/electron/src/renderer/components/diff/DiffView.tsx`:

使用 `@pierre/diffs` 库：
- Split / Unified 双视图模式
- 超过 5000 行降级为纯文本预览
- CSS 变量控制配色（addition/deletion bg）
- 自定义滚动条样式
- theme 跟随系统亮/暗

### SidePanel (DiffChangesList)

`apps/electron/src/renderer/components/agent/SidePanel.tsx`:

右侧面板有两个 Tab：
1. **工作区文件**：FileBrowser 组件
2. **代码改动**：DiffChangesList — 列出所有变更文件，点击文件在 PreviewPanel 中显示 Diff

### DetachedPreviewApp

独立窗口预览：
- 通过 `window.electronAPI.openDetachedPreview()` 打开
- 独立的 Electron BrowserWindow
- 包含完整的 DiffView + Markdown 预览

## 实施要点

1. PreviewPanel 嵌入在消息区域右侧（与消息区域并排）
2. 使用 atom 管理每个 session 的预览状态（打开/关闭、当前文件）
3. 文件浏览器中选中文件时触发预览
4. Agent 修改文件时自动切换到最新修改的文件
5. 独立窗口通过 Electron IPC 创建

## 涉及文件

- 新建 `src/components/preview/PreviewPanel.tsx`
- 新建 `src/components/diff/DiffView.tsx`（重构现有 GitDiffViewer）
- 新建 `src/components/diff/DiffChangesList.tsx`
- `src/components/file-browser/FileBrowser.tsx` — 添加 onFilePreview 回调
- `electron/` — openDetachedPreview IPC
