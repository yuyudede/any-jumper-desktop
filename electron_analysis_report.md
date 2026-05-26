# Any Jumper Desktop Electron 目录分析报告

## 1. 目录树概览

```
/Users/yude/Documents/workshop/any-jumper-desktop/electron/
├── agentBridge.ts           # AI代理桥接服务，实现浏览器扩展与主进程的WebSocket通信
├── agentBridge.test.ts      # 代理桥接服务的单元测试
├── gitCommitMessage.test.ts # Git提交消息生成测试
├── interrupt.test.ts        # 中断功能测试
├── main.ts                  # 主进程入口点（~145KB，包含所有核心逻辑）
├── portalShortcut.test.ts   # 快捷键功能测试
├── preload.ts               # 预加载脚本，暴露API到渲染进程
├── retryFork.test.ts        # 重试/分叉功能测试
├── skillListDedup.test.ts   # 技能列表去重测试
├── tokenUsagePersistence.test.ts # Token使用持久化测试
├── toolTrace.ts             # 工具调用追踪与执行
└── toolTrace.test.ts        # 工具追踪测试
```

**特点**：
- 单文件架构：主要业务逻辑集中在 `main.ts` 文件中（约145KB，3000+行）
- 测试覆盖：包含多个 `.test.ts` 文件，针对关键功能模块进行测试
- 无子目录：所有文件平铺在根目录下，结构扁平

## 2. 主进程入口和IPC通信

### 2.1 主进程入口 (`main.ts`)

**核心依赖**：
- **Electron**: `app`, `BrowserWindow`, `ipcMain`, `dialog`, `globalShortcut`, `safeStorage`, `shell`
- **AI框架**: `@langchain/anthropic`, `@langchain/ollama`, `@langchain/openai`, `deepagents`
- **数据库**: `better-sqlite3`
- **终端**: `node-pty`
- **工具**: `zod` (数据验证)

**主要服务类**：
1. **StorageService** - 数据库存储服务
2. **SecretService** - 安全存储API密钥
3. **SettingsService** - 应用设置管理
4. **TerminalManager** - 终端实例管理
5. **AgentRuntimeService** - AI代理运行时服务

### 2.2 IPC通信机制

**预加载脚本 (`preload.ts`)**：
```typescript
contextBridge.exposeInMainWorld("anyJumper", {
  invoke(command, args) // 通用命令调用
  onAgentEvent(handler) // 监听AI代理事件
  onAgentBridgeEvent(handler) // 监听桥接事件
  pickDirectory() // 选择目录
  pickFiles() // 选择文件
  terminalInvoke(command, args) // 终端命令调用
  portalInvoke(command, args) // 门户窗口调用
  onTerminalData(handler) // 监听终端数据
  onTerminalExit(handler) // 监听终端退出
})
```

**IPC通道**：
- `any-jumper:invoke` - 主要命令通道（支持60+命令）
- `any-jumper:pick-directory` - 目录选择对话框
- `any-jumper:pick-files` - 文件选择对话框
- `agent-event` - AI代理事件推送
- `agent-bridge-event` - 桥接服务事件推送
- `terminal-data` - 终端数据流
- `terminal-exit` - 终端退出事件

**命令路由**（`any-jumper:invoke`通道支持的命令分类）：
1. **工作区管理**: `workspace_list`, `workspace_create`, `workspace_update`, `workspace_delete`
2. **模型配置**: `model_provider_list`, `model_provider_save`, `model_provider_test`
3. **线程管理**: `thread_create`, `thread_list`, `thread_read`, `thread_fork`, `thread_archive`
4. **AI代理运行**: `turn_start`, `turn_enqueue`, `turn_steer`, `turn_interrupt`
5. **Git操作**: `git_status`, `git_diff`, `git_stage`, `git_commit`, `git_checkout`
6. **文件操作**: `list_directory`, `read_file_content`, `read_file_base64`
7. **终端管理**: `terminal_create`, `terminal_write`, `terminal_resize`, `terminal_kill`
8. **桥接服务**: `agent_bridge_status`, `agent_bridge_restart`, `agent_bridge_rpc`

## 3. 数据库/存储方案

### 3.1 SQLite数据库 (`agent.sqlite3`)

**存储路径**：`{userData}/agent.sqlite3`

**数据库表结构**：

#### 核心业务表
1. **workspaces** - 工作区配置
2. **threads** - 对话线程
3. **turns** - 对话轮次
4. **items** - 消息条目（用户消息、AI回复、工具调用结果等）

#### 配置表
5. **model_configs** - AI模型配置（支持OpenAI、Anthropic、Ollama等）
6. **agent_runtimes** - 代理运行时配置
7. **mcp_servers** - MCP服务器配置

#### 工具与扩展表
8. **tool_calls** - 工具调用记录
9. **tool_call_events** - 工具调用事件流
10. **progress_notes** - 进度提示
11. **approvals** - 工具调用审批记录
12. **skills** - 技能定义
13. **plugins** - 插件配置

#### 运行时表
14. **git_snapshots** - Git状态快照
15. **runtime_checkpoints** - 代理运行时检查点
16. **runtime_memory** - 代理运行时内存
17. **runtime_artifacts** - 代理运行时产物

### 3.2 安全存储 (`secrets.json`)

**SecretService**：
- 使用Electron的`safeStorage`进行加密存储
- 支持两种存储模式：`safe:`（加密）和`plain:`（Base64编码）
- 主要存储API密钥等敏感信息

### 3.3 应用设置 (`settings.json`)

**SettingsService**：
- 存储用户偏好设置
- 包含Git命令路径、默认模型等配置

## 4. AI代理相关逻辑

### 4.1 代理运行时架构

**DeepAgents Runtime**：
- 使用`deepagents`库创建AI代理
- 支持多模型提供商：OpenAI、Anthropic、Ollama、DeepSeek
- 内嵌官方`createDeepAgent`实现在Electron主进程内

**代理创建流程**：
```typescript
const agent = createDeepAgent({
  model, // 语言模型实例
  tools: [/* 20+内置工具 */], // 包括git、shell、文件操作等
  backend: createHostBackend(toolCtx, files), // 宿主后端
  skills: [...], // 技能列表
  systemPrompt: "...", // 系统提示词
  subagents: [/* 子代理定义 */] // 支持子代理协作
})
```

### 4.2 工具系统

**内置工具类别**：
1. **Git工具**: `git_status`, `git_diff`, `git_stage`, `git_commit`, `git_checkout`
2. **Shell工具**: 在工作区执行shell命令
3. **文件工具**: `read_file`, `write_file`, `edit_file`, `list_files`, `glob`
4. **搜索工具**: `search`, `grep`
5. **MCP工具**: 动态加载的MCP服务器工具
6. **任务工具**: `task_update`, `progress_note`
7. **待办工具**: `write_todos` (用于任务规划)

**工具执行流程**：
1. 工具调用请求 → 权限检查 → 审批流程（如需要）
2. 工具执行 → 结果记录 → 事件推送
3. 支持工具取消和中断

### 4.3 代理桥接服务 (`agentBridge.ts`)

**AgentBridgeService**：
- HTTP/WebSocket服务器（默认端口9528）
- 支持浏览器扩展连接
- 提供RPC接口供外部调用
- 实时状态监控和日志记录

**功能特性**：
- 连接管理：支持多个浏览器扩展同时连接
- RPC通信：支持远程过程调用
- 健康检查：`/health`端点
- 日志记录：支持最多200条日志

### 4.4 代理事件系统

**事件类型**：
- `message.delta` - 消息增量更新
- `message.replaced` - 消息替换
- `tool.delta` - 工具调用增量
- `agent-event` - 通用代理事件

**事件推送**：
- 通过`webContents.send`推送到渲染进程
- 支持多窗口广播
- 实时流式响应

### 4.5 权限管理

**权限模式**：
1. **readOnly** - 只读模式
2. **workspaceWrite** - 工作区写入模式
3. **fullAccess** - 完全访问模式

**审批机制**：
- 高风险操作需要用户审批
- 支持审批超时和取消
- 审批结果记录到数据库

## 5. 技术亮点

1. **单文件架构**：将复杂业务逻辑集中在单个文件中，便于维护和部署
2. **类型安全**：使用TypeScript和Zod进行数据验证
3. **实时通信**：WebSocket + IPC实现高效通信
4. **安全存储**：使用Electron安全存储API保护敏感信息
5. **扩展性**：支持MCP服务器、插件和技能扩展
6. **流式处理**：支持AI模型流式输出和实时更新

## 6. 潜在改进点

1. **代码组织**：考虑将大型`main.ts`拆分为多个模块
2. **测试覆盖**：增加集成测试和端到端测试
3. **错误处理**：统一错误处理机制
4. **性能优化**：数据库查询优化和缓存机制
5. **文档完善**：增加API文档和开发者指南

---

**分析时间**：2024年
**文件大小**：main.ts (~145KB), agentBridge.ts (~15KB)
**代码行数**：约3500行（主文件）
**依赖项**：20+ npm包