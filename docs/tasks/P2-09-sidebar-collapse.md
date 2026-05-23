# P2-09: 侧边栏折叠 Mini Rail

## 目标

侧边栏支持折叠为 60px 纯图标模式，释放屏幕空间，保留核心导航入口。

## 当前现状 (any-jumper-desktop)

侧边栏固定宽度，无折叠模式。

## Proma 参考方案

`apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`:

### 两种状态

**展开状态 (240px)**：
```
┌─────────────────────┐
│ [macOS 拖拽区 30px]  │
│                     │
│ Chat │ Agent  ←模式切换│
│                     │
│ [折叠按钮]           │
│                     │
│ ┌─────────────────┐ │
│ │ + 新对话 (虚线边框) │ │
│ ├─────────────────┤ │
│ │ 🔍 搜索          │ │
│ └─────────────────┘ │
│                     │
│ 📌 置顶对话    [▼]  │
│ ├ 对话标题1         │
│ └ 对话标题2         │
│                     │
│ 今天                │
│ ├ 对话A             │
│ ├ 对话B             │
│ 昨天                │
│ └ 对话C             │
│                     │
│ 📦 已归档 (3)       │
│                     │
│ [用户头像] 用户名 ⚙  │
└─────────────────────┘
```

**折叠状态 (60px, Mini Rail)**：
```
┌──────┐
│ [拖拽区]│
│      │
│ [展开]│ ← 点击恢复
│ ──── │
│ [Bot]│ ← Agent 模式
│ [Chat]│ ← Chat 模式
│ ──── │
│ [+]  │ ← 新建
│ [🔍] │ ← 搜索
│ ──── │
│ [A]  │ ← 最近会话1 (首字母)
│ [B]  │ ← 最近会话2
│ [C]  │
│ [D]  │
│ [E]  │
│ ──── │
│ [头像]│ ← 设置
└──────┘
```

### 关键交互

- **折叠按钮**：`PanelLeftClose` → `PanelLeftOpen` (快捷键 `⌘B`)
- **Tooltip**：所有图标都有 `Tooltip side="right"` 显示标签
- **最近会话**：最多显示 5 个，首字母显示，active 高亮
- **状态条**：左侧竖条指示 running (蓝闪烁) / blocked (橙) / completed (绿)
- **动画**：`transition-[width] duration-300`

### 折叠 Rail 的布局细节

```tsx
<div style={{ width: 60, flexShrink: 0 }} className="flex flex-col items-center">
  {/* macOS 拖拽区 */}
  {/* 展开按钮 */}
  {/* 分隔线 */}
  {/* 模式切换 (Bot/Chat 图标) */}
  {/* 分隔线 */}
  {/* 新建/搜索按钮 (虚线边框) */}
  {/* 分隔线 */}
  {/* 最近5个会话 (首字母 + 左侧状态条) */}
  {/* 分隔线 */}
  {/* 用户头像 + 设置 */}
</div>
```

### 虚线边框按钮风格

```tsx
className="border border-dashed border-[hsl(var(--dashed-border))]
           hover:border-[hsl(var(--dashed-border-hover))]"
```

## 实施要点

1. 使用 atom 管理 `sidebarCollapsed` 状态
2. 折叠时宽度 60px，展开时 240px，动画 `transition-[width] duration-300`
3. 折叠 mode 下所有图标按钮 size=10 (42px 点按区域，图标 18px)
4. 最近会话列表依赖于现有的会话数据
5. 快捷键 `⌘B` / `Ctrl+B` 切换折叠

## 涉及文件

- 新建/重构侧边栏组件
- `src/pages/AgentPage.tsx` — 布局调整支持折叠侧边栏
