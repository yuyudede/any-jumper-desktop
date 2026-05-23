# P2-10: 文件浏览器组件

## 目标

实现完整的文件树组件，支持懒加载展开、多选操作、内联重命名、自动定位。

## 当前现状 (any-jumper-desktop)

无文件树浏览功能。文件操作通过 ToolTraceCard 展示工具调用结果。

## Proma 参考方案

`apps/electron/src/renderer/components/file-browser/FileBrowser.tsx`:

### 功能矩阵

| 功能 | 说明 |
|---|---|
| 懒加载展开 | 点击文件夹时才加载子项 (调用 `listDirectory`) |
| Chevron 动画 | `rotate-90` + `transition-transform duration-150` |
| 缩进引导线 | `border-l` 虚线连接父子节点 |
| Cmd/Ctrl+Click 多选 | `Set<string>` 管理选中路径 |
| 右键/三点菜单 | 添加到聊天、在文件夹显示、重命名、移动、删除 |
| 内联重命名 | 原位 `<input>` 编辑，智能选中文件名（不含后缀） |
| 删除确认 | AlertDialog 确认，支持多选批量删除 |
| 移动文件 | 调用系统文件夹选择对话框 |
| Sticky Header | 展开的目录在滚动时 `position: sticky` 固定 |
| 面包屑 | 显示根路径最后两段 (`.../parent/current`) |
| 工具栏 | 刷新按钮 + 在 Finder 打开按钮 |
| 空目录提示 | "空文件夹" / "目录为空" |
| FileTypeIcon | 根据扩展名显示彩色文件类型图标 |

### 自动定位 (Auto-reveal)

Agent 写入文件时触发 `fileBrowserAutoRevealAtom`：
1. 路径的祖先目录自动展开（必要时加载子项）
2. 目标行 `scrollIntoView({ behavior: 'smooth', block: 'center' })`
3. 1.2s 高亮脉冲 CSS 动画 (`file-browser-row-flash`)

### 最近修改标记

60s 内被 Agent 修改的文件：
- `recentlyModifiedPathsAtom` 记录路径 + 时间戳
- 匹配的行左侧显示蓝色圆点 (`.bg-primary/80`, size=1.5)

### 空目录延迟重试

首次展开空目录 800ms 后重试一次（应对 Agent 正在写入文件的时序问题）

### FileTypeIcon

根据扩展名显示不同颜色的图标：
```tsx
<FileTypeIcon name="app.tsx" isDirectory={false} />
// → 根据 .tsx 显示蓝色 TypeScript 图标
```

## 实施要点

1. 需要后端提供 `listDirectory`、`deleteFile`、`renameFile`、`moveFile` 等 IPC 方法
2. 多选使用 `Set<string>` 管理，Cmd/Ctrl+Click 添加/移除
3. 点击空白区域清空选中
4. 重命名时智能选中文件名不含后缀的部分
5. 删除/移动支持批量操作
6. Sticky Header 用 `position: sticky` + `zIndex` 递减（最多 4 层）

## 涉及文件

- 新建 `src/components/file-browser/FileBrowser.tsx`
- 新建 `src/components/file-browser/FileTreeItem.tsx`
- 新建 `src/components/file-browser/FileTypeIcon.tsx`
- `electron/` — IPC 方法实现
