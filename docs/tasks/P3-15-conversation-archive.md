# P3-15: 会话归档与置顶系统

## 目标

为 Chat 对话和 Agent 会话添加置顶和归档功能，配合 active/archived 双视图管理。

## 当前现状 (any-jumper-desktop)

无归档/置顶功能，所有会话平铺在列表中。

## Proma 参考方案

`apps/electron/src/renderer/components/app-shell/LeftSidebar.tsx`:

### 数据模型

```ts
interface ConversationMeta {
  id: string
  title: string
  pinned: boolean       // 是否置顶
  archived: boolean     // 是否归档
  updatedAt: number     // 最后更新时间
}
```

### UI 结构

**Active 视图**：
```
📌 置顶对话 (可展开/收起) [▼]
  ├ 对话A ⭐ ← pinned
  └ 对话B ⭐

今天
  ├ 对话C
  ├ 对话D
昨天
  └ 对话E

📦 已归档 (3) ← 底部入口，点击切换视图
```

**Archived 视图**：
```
← 返回活跃对话 ← 顶部返回按钮

已归档对话
  ├ 对话X
  ├ 对话Y
  └ 对话Z
```

### 右键菜单 (ContextMenu)

```
┌─────────────────┐
│ ⭐ 置顶 / 取消置顶│
│ ✏️ 重命名       │
│ 📦 归档 / 取消归档│
│ ─────────────── │
│ 🗑️ 删除 (红色)   │
└─────────────────┘
```

### 交互细节

- **置顶**：标记后显示在列表顶部专区，Pin 图标在标题旁
- **归档**：自动关闭对应标签页，从活跃列表移除
- **置顶自动取消归档**：归档会话被置顶时显示 toast "已取消归档并置顶"
- **双击重命名**：双击列表项进入编辑模式
- **三点菜单**：hover 时可见（`opacity-0` → `group-hover:visible`），始终占位避免跳动

### 日期分组

```ts
function groupByDate(items) {
  // 按 updatedAt 分为 今天 / 昨天 / 更早 三组
  const todayStart = new Date().setHours(0,0,0,0)
  const yesterdayStart = todayStart - 86400000
  // ...
}
```

### 归档入口

```tsx
{archivedCount > 0 && (
  <button onClick={() => setViewMode('archived')}
    className="flex items-center gap-2 text-foreground/40
               hover:bg-foreground/[0.04] hover:text-foreground/60">
    <Archive size={13} />
    <span>已归档 ({archivedCount})</span>
  </button>
)}
```

### 窗口聚焦同步

```tsx
// 窗口失去焦点后重新获得焦点时，重新加载列表
window.addEventListener('focus', () => {
  listConversations().then(setConversations)
  listAgentSessions().then(setAgentSessions)
})
```

## 实施要点

1. 后端需要 `togglePin` / `toggleArchive` API
2. 使用 `viewMode: 'active' | 'archived'` atom 管理视图状态
3. 归档时自动关闭对应标签页并清理 per-session atoms
4. 日期分组逻辑纯前端计算
5. 右键菜单复用 ContextMenu 组件

## 涉及文件

- `src/components/sidebar/` — 侧边栏重构
- `electron/` — togglePin / toggleArchive IPC
- `src/atoms/` — viewMode atom
