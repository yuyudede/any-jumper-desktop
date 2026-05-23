# P2-12: 工具结果专用渲染器

## 目标

为不同类型的工具调用结果设计专用渲染器，替代当前的通用 ResultBlock 展示。

## 当前现状 (any-jumper-desktop)

`ToolTraceCard` + `ResultBlock` 通用渲染所有工具结果，缺乏类型化的差异化展示。

## Proma 参考方案

`apps/electron/src/renderer/components/agent/tool-result-renderers/`:

### 渲染器矩阵

| 渲染器 | 目标工具 | 展示策略 |
|---|---|---|
| `bash-result.tsx` | Bash | 终端风格：深色背景、`$` 命令回显、stderr 红色高亮 |
| `edit-result.tsx` | Edit | Diff 展示修改内容 |
| `glob-result.tsx` | Glob | 文件名列表 |
| `grep-result.tsx` | Grep | 代码搜索结果（文件路径 + 行号 + 匹配行） |
| `read-result.tsx` | Read | 文件内容 + 语法高亮 |
| `write-result.tsx` | Write | 文件写入确认 + 内容预览 |
| `web-fetch-result.tsx` | WebFetch | 网页标题 + 摘要 + URL |
| `web-search-result.tsx` | WebSearch | 搜索结果列表（标题 + 摘要 + 链接） |
| `task-get-result.tsx` | Task | 任务详情卡片 |
| `task-list-result.tsx` | TaskList | 任务列表 |
| `collapsible-result.tsx` | 通用 | 可折叠结果容器 |

### Bash 终端渲染器（最值得借鉴）

```tsx
<div className="rounded-md font-mono text-[12px] leading-relaxed bg-zinc-900 text-zinc-100 p-3">
  {/* 命令回显 */}
  <div className="text-zinc-500 mb-2 select-none">
    <span className="text-green-400">$</span> {command}
  </div>
  {/* stderr 红色高亮 */}
  {lines.map((line) => (
    <div className={cn(isStderr && 'text-red-400')}>{line}</div>
  ))}
</div>
```

**stderr 检测逻辑**：
```ts
function classifyLine(line: string): 'stderr' | 'normal' {
  if (line.startsWith('error:') || line.startsWith('fatal:')
    || line.includes('traceback') || line.includes('exception')) {
    return 'stderr'
  }
  return 'normal'
}
```

### CollapsibleResult

```tsx
<CollapsibleResult
  title="Bash: npm install"
  isError={exitCode !== 0}
  defaultOpen={isError}
>
  <BashResultRenderer result={stdout} />
</CollapsibleResult>
```

## 实施要点

1. 创建渲染器注册表，根据工具名自动选择渲染器
2. 优先实现 Bash 终端风格（使用频率最高）
3. CollapsibleResult 作为通用包装器
4. 保留 fallback 到现有 ResultBlock 的机制
5. 错误状态自动展开

## 涉及文件

- 新建 `src/components/tool-results/` 目录
- 新建 `src/components/tool-results/BashResult.tsx`
- 新建 `src/components/tool-results/CollapsibleResult.tsx`
- 新建 `src/components/tool-results/registry.ts` — 渲染器注册
- 修改 `src/components/ToolTraceCard.tsx` — 使用注册表分发
