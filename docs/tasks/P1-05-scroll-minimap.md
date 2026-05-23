# P1-05: 消息导航迷你地图

## 目标

在消息区域右侧添加紧凑的消息导航视图，悬浮展开消息列表预览，支持搜索和拖拽跳转。

## 当前现状 (any-jumper-desktop)

无此功能，长对话中难以快速定位历史消息。

## Proma 参考方案

`apps/electron/src/renderer/components/ai-elements/scroll-minimap.tsx`:

### 核心设计

```
┌──────────────────────────────────┬──┬─┐
│                                  │▓▓│░│ ← 迷你地图横杠 (每条消息一个)
│  消息区域                        │▓▓│░│   ● 视口内=高亮色
│                                  │▓▓│░│   ● 视口外=半透明
│                                  │▓▓│░│
│                                  │▓▓│░│
│                                  │▓▓│█│ ← 可拖拽滚动条滑块
│                                  │▓▓│░│
│                                  │▓▓│░│
└──────────────────────────────────┴──┴─┘
   鼠标悬浮 → 弹出消息预览面板 [280px 宽]
```

### 交互时序

1. 鼠标悬浮在右侧横杠区域 ≥ 180ms → 弹出面板（防止掠过时闪烁）
2. 面板含搜索框 + 消息列表
3. 点击消息条目 → 平滑滚动到目标位置
4. 鼠标离开 → 40ms 后开始关闭动画 → 80ms 后移除面板
5. 面板内鼠标进入 → 取消关闭（防止用户想操作面板时误关）

### 面板内容

- 标题栏：「消息导航」+ 可见数/总数 (如 "3/12")
- 搜索框：实时过滤消息
- 消息列表：头像/模型图标 + Markdown 预览 (最多3行) + 搜索关键词高亮
- 空搜索状态：「未找到匹配消息」

### 滚动条

- 轨道点击 → 直接跳转
- 滑块拖拽 → 丝滑跟随
- 拖拽时自动停止 StickToBottom 自动滚动

### 数据来源

```ts
interface MinimapItem {
  id: string
  role: 'user' | 'assistant' | 'status'
  preview: string     // 消息前 200 字符
  avatar?: string     // 用户头像
  model?: string      // 模型名（用于显示模型 logo）
}
```

## 实施要点

1. 需要 `useStickToBottomContext`（依赖 P0-04）
2. 使用 `ResizeObserver` + scroll 事件追踪可见消息（`data-message-id` 标记）
3. 180ms 打开延迟 + 40ms/80ms 关闭两级延迟
4. 拖拽时锁定 `userSelect: 'none'` + `cursor: 'grabbing'`
5. 搜索过滤用正则高亮匹配词
6. 最少 1 条消息 + 内容可滚动时才显示

## 涉及文件

- 新建 `src/components/conversation/ScrollMinimap.tsx`
- `src/components/conversation/Conversation.tsx` — 集成到 Conversation 内部
- 消息渲染需要 `data-message-id` 属性标记
