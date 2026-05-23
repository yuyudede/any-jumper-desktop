# P3-14: 面板拖拽分割线

## 目标

为各个面板添加可拖拽的分割线，让用户自由调整面板尺寸。

## 当前现状 (any-jumper-desktop)

所有面板宽度/高度固定，不支持拖拽调整。

## Proma 参考方案

`apps/electron/src/renderer/components/app-shell/AppShell.tsx`:

### RightSidePanel 宽度拖拽

```tsx
const MIN_WIDTH = 220
const MAX_WIDTH = 420

const handleMouseDown = (e: React.MouseEvent) => {
  // 1. 记录起始位置和宽度
  // 2. mousemove: requestAnimationFrame 计算 delta，更新宽度
  // 3. mouseup: 清理事件监听
}

// 拖拽手柄：绝对定位在主区域和右侧面板的缝隙中
<div className="absolute left-0 top-0 bottom-0 w-[8px] -translate-x-1/2
                cursor-col-resize active:bg-primary/50 transition-colors z-10"
     onMouseDown={handleMouseDown} />
```

### Agent 侧边栏上/下区高度拖拽

```tsx
const MIN_HEIGHT = 80
const MAX_RATIO = 0.7  // 最大占容器 70%

// 拖拽手柄位于两个区域之间
<div className="h-[8px] cursor-row-resize active:bg-primary/50
                flex items-center"
     onMouseDown={handleAgentTopResizeStart}>
  <div className="mx-3 w-full border-t border-muted-foreground/20" />
</div>
```

### 拖拽实现细节

```tsx
// 使用 requestAnimationFrame 节流拖拽更新
const onMouseMove = (ev: MouseEvent) => {
  if (!dragging.current) return
  if (rafId) return  // 上一帧尚未执行，跳过
  rafId = requestAnimationFrame(() => {
    rafId = 0
    const delta = startX - ev.clientX
    setPanelWidth(clamp(startWidth + delta, MIN, MAX))
  })
}

// 拖拽时锁定 body 样式
document.body.style.userSelect = 'none'
document.body.style.cursor = 'col-resize' // 或 'row-resize'
```

### 容器尺寸自适应

窗口缩放时自动 clamp 已存储的尺寸值：
```tsx
const ro = new ResizeObserver((entries) => {
  const containerHeight = entries[0].contentRect.height
  const maxH = containerHeight * 0.7
  setHeight((prev) => Math.min(prev, maxH))
})
ro.observe(container)
```

## 实施要点

1. 拖拽手柄：4-8px 宽/高，`active:bg-primary/50` 高亮反馈
2. 拖拽时光标变为 `col-resize` 或 `row-resize`
3. `requestAnimationFrame` 节流，避免高频更新
4. 拖拽时 `userSelect: 'none'` 防止文本选中
5. 尺寸用 atom 持久化，恢复上次会话的布局偏好
6. ResizeObserver 监听容器尺寸变化，自动 clamp 超限值

## 涉及文件

- `src/components/app-shell/AppShell.tsx` — 添加拖拽分割线
- `src/components/app-shell/ResizablePanel.tsx` — 可复用拖拽面板组件
- `src/atoms/` — 添加面板尺寸 atoms
