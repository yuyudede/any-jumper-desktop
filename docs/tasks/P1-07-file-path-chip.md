# P1-07: 文件路径芯片 (FilePathChip)

## 目标

在消息中的行内代码自动检测绝对/相对文件路径，渲染为可点击的芯片，点击在文件管理器中打开。

## 当前现状 (any-jumper-desktop)

行内代码仅显示为灰色背景的 `<code>` 标签，没有路径识别或点击功能。

## Proma 参考方案

`apps/electron/src/renderer/components/ai-elements/message.tsx:463-504` — `MarkdownInlineCode`:

### 检测逻辑

```ts
// 绝对路径：Unix (/xxx) 或 Windows (C:\xxx 或 \\xxx)
function isAbsoluteFilePath(text: string): boolean { ... }

// 相对路径：以 ./ 或 ../ 开头
function isRelativeFilePath(text: string): boolean { ... }
```

### 渲染效果

```tsx
<FilePathChip
  filePath={text.trim()}
  basePaths={[工作目录, 附加目录1, ...]}
/>
// → 点击时依次在 basePaths 中查找，第一个存在的路径在文件管理器中打开
```

### FilePathChip 组件

`apps/electron/src/renderer/components/ai-elements/file-path-chip.tsx`:

```
┌──────────────────────────────┐
│ [文件图标] src/utils/foo.ts  │  ← 可点击芯片
└──────────────────────────────┘
  - bg-primary/10, text-primary
  - 文件图标 + 文件名
  - hover: 下划线
  - 点击 → electronAPI.openFile(resolvedPath)
```

### BasePaths 上下文

通过 React Context (`BasePathsContext`) 传递工作目录和附加目录：

```tsx
<BasePathsProvider basePaths={[sessionPath, ...additionalPaths]}>
  <MessageResponse ... />
</BasePathsProvider>
```

## 实施要点

1. 新建 `FilePathChip` 组件
2. 在 `MarkdownRenderer` 的行内代码渲染中插入检测逻辑
3. 需要通用 `BasePathsContext` 提供路径解析上下文
4. 检测逻辑需要处理常规文本中的行内代码（非 code block）
5. 如果路径不存在，回退为普通 `<code>` 显示

## 涉及文件

- 新建 `src/components/message/FilePathChip.tsx`
- 新建 `src/components/message/BasePathsContext.tsx`
- `src/components/MarkdownRenderer.tsx` — 行内代码检测
