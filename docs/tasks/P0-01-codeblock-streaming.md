# P0-01: 代码块流式渲染优化

## 目标

将代码块从"每次内容变化全量 re-render HTML"改为"Token 级逐行稳定渲染"，消除流式输出时的闪烁和性能问题。

## 当前现状 (any-jumper-desktop)

`MarkdownRenderer.tsx:216-273` — `useShikiHtml` 使用 `codeToHtml` 生成完整 HTML 字符串，通过 `dangerouslySetInnerHTML` 注入。每次代码变化都触发完整的异步高亮 → DOM 重建。

```ts
// 当前：全量 HTML 渲染
const result = await codeToHtml(code, { lang, theme });
setHtml(result);
// → dangerouslySetInnerHTML={{ __html: html }}
```

## Proma 参考方案

`packages/ui/src/code-block/CodeBlock.tsx`:

**核心策略**：
1. `highlightToTokens` 获取结构化 token，逐行渲染为 React 元素
2. React.memo 包裹 `CodeLine`，稳定的行级 key → reconciliation 只更新变化的行
3. 80ms 节流，避免每个 token 都触发高亮
4. 异步兜底：首次挂载高亮器未就绪时，异步初始化

```ts
// Proma 方案关键结构
const CodeLine = React.memo(({ tokens, rawLine }) => (
  <span className="line">
    {tokens.map((token, i) => (
      <span key={i} style={token.color ? { color: token.color } : undefined}>
        {token.content}
      </span>
    ))}
    {tokenLen < rawLine.length && <span>{rawLine.slice(tokenLen)}</span>}
  </span>
))

// 主组件中：
{rawLines.map((rawLine, i) => (
  <React.Fragment key={i}>
    {i > 0 && '\n'}
    <CodeLine tokens={tokenResult?.lines[i] ?? []} rawLine={rawLine} />
  </React.Fragment>
))}
```

## 实施要点

1. 在 `@proma/core` 的 `shiki-service.ts` 中找到或实现 `highlightToTokens` 函数
2. 新建 `CodeLine` memo 组件
3. 80ms 节流逻辑（记录上一次更新时间）
4. 保留现有的 Shiki v4 transformer（`data-line-numbers` 等）
5. 保留现有的 `extractMeta`（语言+文件名）和复制按钮
6. 保留现有的语义化 CSS 类名（`shiki-block`, `shiki-header` 等）

## 涉及文件

- `src/components/MarkdownRenderer.tsx` — 重写 CodeBlock 部分
- 可能需要新增 `src/utils/shikiTokens.ts` — highlightToTokens 工具函数
