# P0-04: 对话滚动体验优化

## 目标

实现智能自动滚动：用户手动上滚查看历史时不自动拉回底部，在底部时自动跟随新内容。

## 当前现状 (any-jumper-desktop)

基础滚动处理，流式输出时可能因内容变化导致滚动位置跳动。

## Proma 参考方案

`apps/electron/src/renderer/components/ai-elements/conversation.tsx`:

使用 `use-stick-to-bottom` 库（`npm: use-stick-to-bottom`）：

```tsx
// Conversation 根容器
<StickToBottom
  className="relative flex-1 overflow-y-hidden scrollbar-none"
  initial="instant"
  resize="smooth"
  role="log"
>
  <StickToBottom.Content className="flex flex-col gap-1 py-4 px-8">
    {messages}
  </StickToBottom.Content>
</StickToBottom>

// 滚动到底部按钮
function ConversationScrollButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()
  if (isAtBottom) return null
  return (
    <Button className="absolute bottom-[26px] left-1/2 -translate-x-1/2 rounded-[17px] size-9"
      onClick={() => scrollToBottom()}>
      <ArrowDownIcon className="size-4" />
    </Button>
  )
}
```

### 配套组件

1. `Conversation` — 根容器（StickToBottom 包装）
2. `ConversationContent` — 内容区（StickToBottom.Content）
3. `ConversationScrollButton` — 不在底部时浮现的圆形向下箭头按钮
4. `ConversationEmptyState` — 空状态提示

## 实施要点

1. 安装 `use-stick-to-bottom` 包
2. 用 Conversation/ConversationContent 包装消息列表
3. 实现 ConversationScrollButton（圆形，居中，在底部时隐藏）
4. 实现 ConversationEmptyState（暂无消息提示）

## 涉及文件

- `src/components/conversation/Conversation.tsx` — 新建
- `src/pages/AgentPage.tsx` — 替换消息列表容器
