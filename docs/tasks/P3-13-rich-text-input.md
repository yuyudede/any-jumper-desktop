# P3-13: 富文本输入升级

## 目标

将当前 Textarea 输入框升级为支持语法高亮和 mention 建议的富文本编辑器。

## 当前现状 (any-jumper-desktop)

使用基础 `<Textarea>` 组件，不支持语法高亮、mention 建议或快捷键格式化。

## Proma 参考方案

`apps/electron/src/renderer/components/ai-elements/rich-text-input.tsx`:

### 技术栈

- **TipTap** 编辑器框架
- **扩展**：StarterKit + Placeholder + Underline + Link + CodeBlockLowlight + Mention
- **Mention 类型**：`@file:`, `/skill:`, `#mcp:`, `&session:`
- **Markdown 转换**：`htmlToMarkdown` 和 `markdownToHtml`

### 功能

| 功能 | 说明 |
|---|---|
| 语法高亮代码块 | CodeBlockLowlight 扩展 |
| Mention 建议 | @ 触发文件建议，/ 触发 Skill，# 触发 MCP，& 触发会话 |
| 自动扩高 | 根据内容行数自动调整高度（最少3行，最多15行） |
| 快捷键 | Enter 提交，Shift+Enter 换行，代码块内 Enter 换行例外 |
| IME 处理 | compositionstart/end 事件防止 IME 输入误触发提交 |
| 收起按钮 | 内容超 4 行时显示展开/收起按钮 |
| Placeholder | 未聚焦时显示提示文字 |

### Mention 建议列表

每个 mention 类型有独立的建议提供器：
- `file-mention-suggestion.tsx` — 文件路径建议（基于当前工作区）
- `mention-suggestions.tsx` — Skill / MCP / Session 建议

### 架构

```tsx
// 编辑器实例
const editor = useEditor({
  extensions: [
    StarterKit,
    Placeholder.configure({ placeholder: '输入消息...' }),
    CodeBlockLowlight.configure({ lowlight }),
    Mention.configure({
      suggestion: createFileMentionSuggestion(...),     // @ 触发
    }),
    Mention.configure({
      suggestion: createSkillMentionSuggestion(...),     // / 触发
    }),
    // ...
  ],
})

// Markdown 互转
const markdown = htmlToMarkdown(editor.getHTML())
```

## 实施要点

1. 安装 `@tiptap/react`、`@tiptap/starter-kit`、`@tiptap/extension-code-block-lowlight` 等
2. 实现 `htmlToMarkdown` / `markdownToHtml` 转换
3. 建议列表从现有配置（模型、MCP、Skill 等）动态生成
4. 自动扩高使用 `ResizeObserver` 监听内容区高度
5. 保持向后兼容：现有 Textarea 模式作为 fallback

## 涉及文件

- 新建 `src/components/input/RichTextInput.tsx`
- 新建 `src/components/input/mention-suggestions.tsx`
- 新建 `src/lib/markdown-rich-text.ts` — Markdown ↔ HTML 转换
- `src/pages/AgentPage.tsx` — 替换 Textarea
