# DeepSeek 400 错误修复：reasoning_content 传递问题

## 问题描述

使用 DeepSeek API 的 thinking 模式（如 `deepseek-reasoner`）时，出现以下错误：

```
400 The reasoning_content in the thinking mode must be passed back to the API.
```

## 根本原因分析

当 DeepSeek API 在 thinking 模式下返回 `reasoning_content` 字段时，该信息未被保存到对话历史中，导致后续请求无法将其传递回 API，触发 400 错误。

### 问题数据流

1. **DeepSeek API 返回**：`reasoning_content` 字段
2. **本地存储缺失**：`reasoning_content` 未保存到数据库
3. **消息历史构建**：AIMessage 不包含 `reasoning_content`
4. **API 调用失败**：DeepSeek 400 错误

## 解决方案

### 1. 数据结构更新

**AgentItem 接口** (`src/types/agent.ts`):
```typescript
export interface AgentItem {
  // ... 其他字段
  reasoningContent?: string;  // 新增字段
  // ...
}
```

**数据库表** (`electron/storage.ts`):
```sql
-- items 表添加 reasoning_content 列
ALTER TABLE items ADD COLUMN reasoning_content TEXT;
```

### 2. 数据持久化

**insertItem 函数** (`electron/storage.ts`):
```typescript
// 更新插入逻辑，保存 reasoning_content
const stmt = db.prepare(`
  INSERT INTO items (
    id, session_id, role, content, reasoning_content, 
    created_at, updated_at, parent_id, tool_name, tool_args
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

stmt.run(
  item.id,
  item.sessionId,
  item.role,
  item.content,
  item.reasoningContent,  // 新增参数
  item.createdAt,
  item.updatedAt,
  item.parentId,
  item.toolName,
  item.toolArgs
);
```

**mapItem 函数** (`electron/storage.ts`):
```typescript
// 更新读取逻辑，包含 reasoning_content
function mapItem(row: any): AgentItem {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    reasoningContent: row.reasoning_content,  // 新增字段映射
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    parentId: row.parent_id,
    toolName: row.tool_name,
    toolArgs: row.tool_args
  };
}
```

**updateItemReasoningContent 函数** (`electron/storage.ts`):
```typescript
// 新增函数：更新 reasoning_content
export function updateItemReasoningContent(itemId: string, reasoningContent: string): void {
  const stmt = db.prepare(`
    UPDATE items SET reasoning_content = ?, updated_at = ? WHERE id = ?
  `);
  
  stmt.run(reasoningContent, new Date().toISOString(), itemId);
}
```

### 3. 消息历史构建

**modelVisibleMessages 函数** (`electron/deep-agents/tools.ts`):
```typescript
// 更新消息构建逻辑，包含 reasoning_content
if (item.role === "assistant") {
  const messageOptions: any = { content: item.content };
  
  // 包含 reasoning_content 用于 DeepSeek API
  if (item.reasoningContent) {
    messageOptions.additional_kwargs = {
      reasoning_content: item.reasoningContent
    };
  }
  
  return new AIMessage(messageOptions);
}
```

### 4. 数据流优化

**runDeepAgents 函数** (`electron/deep-agents/executor.ts`):
```typescript
// 在提取 reasoning_content 后保存到 assistantItem
if (reasoningToRecord && ctx.assistantItemId) {
  storage.updateItemReasoningContent(ctx.assistantItemId, reasoningToRecord);
}
```

## 技术实现细节

### 数据库迁移

```typescript
// 自动迁移逻辑
private migrate(): void {
  // ... 其他迁移
  
  // 为 items 表添加 reasoning_content 列
  this.ensureColumn("items", "reasoning_content", "TEXT");
}
```

### 接口类型定义

```typescript
// src/types/agent.ts
export interface AgentItem {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  reasoningContent?: string;  // 思考内容（DeepSeek thinking 模式）
  createdAt: string;
  updatedAt: string;
  parentId?: string;
  toolName?: string;
  toolArgs?: string;
}
```

## 验证结果

1. **构建成功**：`pnpm build` 通过
2. **类型检查**：`pnpm typecheck` 通过
3. **数据库迁移**：自动添加 `reasoning_content` 列
4. **数据流完整**：`reasoning_content` 从 API 响应到数据库再到请求的完整链路

## 测试建议

### 1. 功能测试

```bash
# 启动开发环境
pnpm dev

# 使用 DeepSeek thinking 模型进行测试
# 模型：deepseek-reasoner
# 验证：reasoning_content 正确保存和传递
```

### 2. 错误场景测试

- 测试无 `reasoning_content` 的响应
- 测试空 `reasoning_content` 的响应
- 测试长 `reasoning_content` 的响应

### 3. 性能测试

- 监控数据库查询性能
- 验证大量对话历史的处理效率

## 监控建议

1. **错误监控**：观察是否还有 DeepSeek 400 错误
2. **性能监控**：监控数据库读写性能
3. **日志记录**：记录 `reasoning_content` 的保存和读取操作

## 相关文件

- `src/types/agent.ts` - AgentItem 接口定义
- `electron/storage.ts` - 数据库存储逻辑
- `electron/deep-agents/tools.ts` - 消息构建逻辑
- `electron/deep-agents/executor.ts` - DeepAgent 执行逻辑

## 更新历史

- **2024-XX-XX**：初始版本，解决 DeepSeek 400 错误问题