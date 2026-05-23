# P1-08: 思考过程折叠面板

## 目标

将 AI 的思考/推理过程包装为可折叠面板：流式输出时自动展开，结束后自动折叠，并显示耗时。

## 当前现状 (any-jumper-desktop)

推理内容通过 thinking trace 单独展示，没有折叠/展开的交互和计时。

## Proma 参考方案

`apps/electron/src/renderer/components/ai-elements/reasoning.tsx`:

### 组件体系

```
<Reasoning isStreaming={isStreaming}>
  <ReasoningTrigger getThinkingMessage={...}>
    [Brain图标] 思考中... (脉冲动画)  [Chevron]
    // 或
    [Brain图标] 思考了 23 秒  [Chevron]
  </ReasoningTrigger>
  <ReasoningContent>
    {推理 Markdown 内容}
  </ReasoningContent>
</Reasoning>
```

### 行为逻辑

| 状态 | 行为 |
|---|---|
| 流式输出中 | 面板自动展开，显示 `思考中...` 脉冲动画 |
| 流式结束 | 持续追踪时间，1s 后自动折叠 |
| 折叠后 | 显示 `思考了 N 秒` |
| 手动点击 | 展开/收起，Chevron 旋转 180° |
| 自动折叠仅一次 | `hasAutoClosed` 状态标记 |

### 动画

**CollapsibleContent 展开/收起**：
```css
data-[state=closed]:animate-out data-[state=open]:animate-in
data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2
```

**Chevron 旋转**：
```tsx
className={cn(isOpen ? 'rotate-180' : 'rotate-0', 'transition-transform')}
```

### 上下文传递

使用 React Context (`ReasoningContext`) 传递 `isStreaming`, `isOpen`, `duration` 给子组件。

## 实施要点

1. 新建 `Reasoning`、`ReasoningTrigger`、`ReasoningContent` 三个组件
2. 支持受控/非受控两种模式（`open` prop）
3. 追踪流式开始/结束时间计算 duration
4. 流式结束后 1s 自动折叠（仅一次）
5. 使用 shadcn/ui Collapsible 基础组件
6. 内容区使用 react-markdown 渲染

## 涉及文件

- 新建 `src/components/message/Reasoning.tsx`
- 可能需要 `src/components/ui/collapsible.tsx`（如尚未存在）
- `src/pages/AgentPage.tsx` — 集成到消息渲染中
