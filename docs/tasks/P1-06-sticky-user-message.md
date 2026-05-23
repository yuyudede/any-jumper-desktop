# P1-06: 悬浮用户消息回看

## 目标

当用户消息完全滚出视口顶部时，在顶部显示该消息的精简版悬浮条，点击可回滚到原始位置。

## 当前现状 (any-jumper-desktop)

无此功能，翻看历史回复时需要手动向上滚动查看自己发了什么。

## Proma 参考方案

`apps/electron/src/renderer/components/ai-elements/sticky-user-message.tsx`:

### 核心逻辑

1. 遍历所有 `[data-message-role="user"]` DOM 节点
2. 找到最后一个 `bottom < containerTop` 的节点（即视口上方最近的用户消息）
3. 匹配 `data-message-id` 到数据列表，显示对应内容
4. 点击悬浮条 → 平滑滚动回原始消息位置

### UI 表现

```
┌──────────────────────────────────────────────────┐
│ ┌──────────────────────────────────────────────┐ │
│ │ [头像] 用户名                          [↑]   │ │
│ │ 消息内容（最多两行，代码块替换为 [code]）      │ │
│ │ [文件图标] screenshot.png  [图片] photo.jpg   │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│  后续消息...                                     │
└──────────────────────────────────────────────────┘
```

**入场/退场动画**：
```tsx
isSticky
  ? 'opacity-100 translate-y-0 pointer-events-auto'
  : 'opacity-0 -translate-y-2 pointer-events-none'
// transition-all duration-150 ease-out
```

**毛玻璃背景**：`bg-background/95 backdrop-blur-sm`

### 数据输入

```ts
interface UserMessageData {
  id: string | null
  text: string
  attachments: { filename: string; isImage: boolean }[]
}
```

### 细节处理

- `stripCodeBlocks()`: 代码块替换为 `[code]` 占位，避免悬浮条过高
- `ResizeObserver` 监听内容区尺寸变化（流式输出时）
- 支持通过 atom (`stickyUserMessageEnabledAtom`) 开关此功能
- 复用 `UserAvatar` 和 `MessageResponse` 组件

## 实施要点

1. 依赖 P0-04 的 StickToBottom 上下文
2. 在消息渲染时为每条用户消息添加 `data-message-role="user"` 和 `data-message-id`
3. 使用 `ResizeObserver` + scroll 事件检测
4. 入场退场动画使用 `transition-all duration-150 ease-out`
5. 头部显示用户头像 + 用户名 + 向上箭头
6. 代码块替换为 `[code]` 占位
7. 附件显示为小 badge

## 涉及文件

- 新建 `src/components/conversation/StickyUserMessage.tsx`
- `src/components/message/` — 消息渲染添加 `data-message-role` 属性
