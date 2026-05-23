# P0-03: 消息组件原语化拆分

## 目标

将 `AgentPage.tsx` 中内联的消息展示逻辑拆分为独立的、可复用的组件原语。

## 当前现状 (any-jumper-desktop)

`src/pages/AgentPage.tsx` — 超大型单文件（100+ 行 import），消息渲染、操作按钮、头像、加载状态等全部内联在同一组件中。

## Proma 参考方案

`apps/electron/src/renderer/components/ai-elements/message.tsx` 定义了完整的消息组件体系：

### 组件清单

| 组件 | 职责 | 优先级 |
|---|---|---|
| `Message` | 根容器，`from` 属性自动区分 user/assistant 布局 | **必须** |
| `MessageHeader` | 头像 + 模型名 + 时间，user 消息自动隐藏 | **必须** |
| `MessageContent` | 内容区域，user 消息浅色气泡背景 | **必须** |
| `MessageResponse` | react-markdown 渲染，支持自定义 remark 插件 | **必须** |
| `MessageActions` | 操作按钮容器（hover 渐显） | 推荐 |
| `MessageAction` | 单个操作按钮（可选 Tooltip 包装） | 推荐 |
| `UserMessageContent` | 超过 4 行自动折叠 + 渐变遮罩展开 | 推荐 |
| `MessageLoading` | 加载动画 + 已用时间追踪 | 推荐 |
| `MessageStopped` | "已停止生成" 状态标记 | 可选 |
| `StreamingIndicator` | 呼吸脉冲点 | 可选 |
| `MessageAttachments` | 图片 (lightbox) + 文件附件展示 | 可选 |

### 拆分后的文件结构建议

```
src/components/message/
├── Message.tsx            # Message + MessageHeader + MessageContent
├── MessageResponse.tsx    # react-markdown 封装（复用 MarkdownRenderer）
├── MessageActions.tsx     # MessageActions + MessageAction
├── UserMessageContent.tsx # 可折叠用户消息
├── MessageLoading.tsx     # 加载动画 + 计时
├── MessageStopped.tsx     # 停止状态
├── StreamingIndicator.tsx # 呼吸脉冲点
├── MessageAttachments.tsx # 附件展示
└── index.ts
```

## 实施要点

1. 从 AgentPage.tsx 提取消息渲染部分，不改变现有行为
2. 保持现有语义化 CSS 类名
3. UserMessageContent 的折叠逻辑：`useEffect` 检测 `scrollHeight > lineHeight * 4`
4. MessageLoading 的计时：`setInterval` 每 100ms 更新

## 涉及文件

- `src/pages/AgentPage.tsx` — 提取消息渲染逻辑
- 新建 `src/components/message/*.tsx`
