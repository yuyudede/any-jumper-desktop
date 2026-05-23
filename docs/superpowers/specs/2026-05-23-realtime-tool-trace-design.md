# 聊天流实时工具调用卡片设计

日期：2026-05-23

## 背景

Any Jumper Desktop 当前已经有 DeepAgents runtime、`ToolService.invoke`、`tool_calls` 表、`onAgentEvent` 实时事件、右侧工具调用 Inspector，以及 `thinkingTrace` 流程面板。现有工具调用更多作为后台记录和右侧调试信息存在，聊天信息流中看不到类似 Codex 的“我正在运行什么、输出到哪里、是否成功”的细节卡片。

本次目标是在聊天信息流中统一展示所有 agent 工具调用。展示风格采用用户确认的 A 方案：Codex-like 紧凑卡片，工具执行时插入到 assistant turn 内，运行中实时更新，完成后折叠为清晰摘要。

## 目标

- 所有宿主工具调用都在聊天信息流中可见，而不是只出现在右侧 Inspector。
- 所有工具都走统一实时事件协议：开始、进度、输出增量、完成、审批、取消。
- `shell`、`git`、`mcp_call` 这类耗时工具实时追加输出。
- `read_file`、`search`、`list_files`、`glob`、`write_file`、`edit_file` 这类快速或大输出工具实时展示阶段、数量、路径和摘要，完成后提供可展开预览。
- 右侧 Inspector 继续保留完整 JSON 调试视图。
- 已完成会话重新打开后，工具卡片仍能从持久化数据恢复摘要和最终输出预览。

## 非目标

- 不在第一版实现完整终端模拟器；工具卡片只是结构化执行记录，不替代底部交互终端。
- 不把完整大文件内容或海量搜索结果默认刷进聊天流。
- 不改变模型 provider、DeepAgents 选择工具的策略。
- 不重写 MCP 服务管理、Git 业务逻辑或文件读写权限逻辑。
- 不复制 Codex 品牌资产，只复用类似的信息架构和紧凑执行卡片体验。

## 工具范围

第一版覆盖当前 `ToolService.execute` 中的宿主工具：

- 文件与搜索：`list_files`、`read_file`、`search`、`grep`、`glob`
- 写入与编辑：`write_file`、`edit_file`
- 命令执行：`shell`
- Git：`git_status`、`git_diff`、`git_stage`、`git_commit`、`git_checkout`、`git_pull`、`git_push`
- 外部能力：`mcp_call`
- 任务进度：`task_update`

后续新增工具只要通过同一个 reporter 发事件，就能自动获得聊天流卡片。

## 用户体验

每个 assistant turn 的消息内容区按时间顺序展示：

1. 可选的 model process 摘要。
2. 工具调用卡片组。
3. assistant 最终回复文本。

工具卡片标题采用自然语言摘要：

- `已运行 pnpm test`
- `正在运行 pnpm dist`
- `已读取 src/pages/AgentPage.tsx`
- `已搜索 "ToolService.invoke"`
- `已修改 electron/main.ts`
- `已调用 MCP jira.get_issue`
- `等待审批：git_push`

状态规则：

- 运行中的卡片默认展开。
- 等待审批、失败的卡片默认展开。
- 成功完成的历史卡片默认折叠。
- 当前 turn 中最近完成的卡片可以保持展开，避免用户错过结果。

展开内容包含：

- 工具类型：`Shell`、`Git`、`File`、`Search`、`MCP`、`Task`
- 输入摘要：命令、路径、搜索词、MCP server/tool、Git 子命令等
- 实时输出或进度列表
- 结果预览
- 耗时
- 最终状态：运行中、等待审批、成功、失败、取消

## 输出策略

所有工具都实时展示，但不是所有工具都逐字节刷屏。

`shell`：

- 使用异步进程执行。
- `stdout` 和 `stderr` 分块发送 `tool.output.delta`。
- 卡片内用 monospace 输出区展示实时日志。
- 完成后显示 exit code、耗时和成功/失败状态。

`git_*`：

- `git_pull`、`git_push`、`git_commit`、`git_checkout` 走异步执行并流式输出。
- `git_status`、`git_diff` 可以继续快速返回，但仍发 started/progress/completed 事件。
- `git_diff` 默认只在卡片中展示摘要和截断预览，完整 diff 仍保留在右侧 Git tab 或工具输出中。

`mcp_call`：

- 开始时展示 server/tool 和输入摘要。
- 调用期间展示“已发送请求”“等待响应”等 progress。
- 完成后展示 JSON 结果的格式化预览，超过限制则截断。

`read_file` / `list_files` / `glob`：

- 开始时展示路径。
- 完成时展示文件大小、返回行数、文件数量或匹配数量。
- 预览限制为少量行，不默认展示全文。

`search` / `grep`：

- 开始时展示搜索词、路径和 glob。
- 完成时展示命中数量和前几条结果。
- 结果很多时只展示摘要和前 N 条。

`write_file` / `edit_file`：

- 开始时展示目标路径。
- 完成时展示写入成功、替换次数或编辑摘要。
- 不在卡片里展示完整写入内容，避免泄漏长文本和刷屏。

`task_update`：

- 作为轻量步骤流展示，和工具卡片共享视觉风格。

## 事件协议

新增统一工具 trace 事件：

```ts
type ToolTraceEvent =
  | {
      event: "tool.started";
      threadId: string;
      turnId?: string;
      toolCallId: string;
      payload: {
        name: string;
        kind: "shell" | "git" | "file" | "search" | "mcp" | "task" | "other";
        input: unknown;
        summary: string;
        requiresApproval: boolean;
      };
    }
  | {
      event: "tool.progress";
      threadId: string;
      turnId?: string;
      toolCallId: string;
      payload: {
        message: string;
        detail?: string;
        progressKind?: "stage" | "count" | "path" | "approval";
      };
    }
  | {
      event: "tool.output.delta";
      threadId: string;
      turnId?: string;
      toolCallId: string;
      payload: {
        stream?: "stdout" | "stderr" | "result" | "preview";
        delta: string;
      };
    }
  | {
      event: "tool.completed";
      threadId: string;
      turnId?: string;
      toolCallId: string;
      payload: {
        name: string;
        status: "success" | "error" | "cancelled" | "rejected";
        output?: string;
        preview?: string;
        exitCode?: number;
      };
    };
```

`approval.requested` 继续保留，用于等待审批状态。前端将它归并到同一个 tool card。

为了兼容现有逻辑，旧的 `tool.started` 和 `tool.completed` 事件名继续使用；新增字段向后兼容。新增 `tool.progress` 和 `tool.output.delta`，逐步替换临时的 `tool.delta` 用法。

## 主进程设计

在 `ToolService.invoke` 中创建 `ToolTraceReporter`：

```ts
interface ToolTraceReporter {
  started(summary: string, kind: ToolTraceKind): void;
  progress(message: string, detail?: string): void;
  output(delta: string, stream?: "stdout" | "stderr" | "result" | "preview"): void;
  completed(status: ToolCallStatus, output?: string, metadata?: ToolCompletionMetadata): void;
}
```

`ToolService.invoke` 负责：

- 创建 `tool_calls` 记录。
- 发 `tool.started`。
- 处理审批状态并发 `approval.requested` / `tool.progress`。
- 调用具体工具实现。
- 捕获错误并发 `tool.completed`。
- 更新 `tool_calls.output` 和最终状态。

具体工具实现可以选择性调用 reporter：

- shell/git 进程每收到一段输出就调用 `reporter.output(...)`。
- file/search 工具在开始、统计、完成时调用 `reporter.progress(...)`。
- mcp_call 在请求发出和响应返回时调用 `reporter.progress(...)`。

## 持久化设计

保留现有 `tool_calls` 表作为最终事实来源：

- `status`
- `input_json`
- `output`
- `started_at`
- `completed_at`
- `requires_approval`

新增 `tool_call_events` 表，保存可恢复的轻量 trace：

```sql
CREATE TABLE IF NOT EXISTS tool_call_events (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  turn_id TEXT,
  tool_call_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  stream TEXT,
  content TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);
```

持久化策略：

- `tool.started`、`tool.progress`、`tool.completed` 全量保存。
- `tool.output.delta` 分块保存，但对单个 tool call 设置上限。
- 达到上限后继续更新内存实时 UI，但持久化只保留截断标记。
- 最终输出写入 `tool_calls.output`，单个 tool call 默认最多保存 64KB；超过后保存前 64KB 和截断标记，避免数据库无限膨胀。

`ThreadDetail` 增加 `toolCallEvents` 字段，按 `created_at` 返回。旧会话没有事件时，前端从 `tool_calls` 合成一张完成态卡片。

## 前端设计

新增类型：

- `ToolCallEvent`
- `ToolTraceCardModel`
- `ToolTraceKind`
- `ToolTraceStatus`

新增或拆分组件：

- `ToolTraceGroup`：接收当前 turn 的 tool calls 和 events，按时间排序渲染。
- `ToolTraceCard`：Codex-like 单张工具卡片。
- `ToolOutputPreview`：monospace 输出区域，支持 stdout/stderr/result 样式。
- `ToolInputSummary`：不同工具的输入摘要。

渲染位置：

- 在 `AgentPage` 的 assistant message article 内，放在 markdown 内容之前。
- 只渲染当前 message 所属 turn 的工具卡片。
- user message 不展示工具卡片。

现有 `thinkingTrace` 继续用于“模型过程摘要”；工具详情迁移到 `ToolTraceGroup`。右侧 Inspector 的工具调用列表保留完整 JSON 和原始输出。

## 前端状态归并

新增 reducer：

```ts
reduceToolTraceByTurn(current, event)
```

职责：

- `tool.started` 创建卡片。
- `tool.progress` 追加阶段记录。
- `tool.output.delta` 追加输出片段。
- `approval.requested` 标记等待审批。
- `tool.completed` 更新最终状态、耗时和预览。
- `turn.completed` 将仍在运行的卡片收尾。

`applyEvent` 继续负责 `ThreadDetail` 的轻量更新，同时支持插入 `toolCallEvents`。如果事件量过大，前端只保留卡片预览窗口，避免 React 渲染压力。

## 截断与安全

卡片预览限制：

- 单个工具卡片默认最多显示 200 行或 8KB。
- 超过后显示“输出已截断，完整内容见工具详情”。
- stderr 使用弱警示色，不直接等同失败；最终状态以 exit code 或工具异常为准。
- 文件写入内容、编辑新内容、密钥类字段不在卡片中完整展示。
- 输入参数展示前做 `redactSecrets`，隐藏 `apiKey`、`token`、`authorization`、`password` 等字段。

数据库保护：

- 单个 tool call 的 persisted delta 总量设置上限。
- `tool_calls.output` 对超长输出做截断保存，或保存摘要与截断标记。
- 后续如需要完整日志，可再引入文件型 artifact，不纳入第一版。

## 错误处理

- 工具同步抛错：卡片转为失败，显示错误摘要。
- 异步进程非零退出：卡片转为失败，保留 stdout/stderr 预览和 exit code。
- 审批拒绝：卡片转为 rejected，显示用户拒绝。
- 运行时停止 turn：正在运行的卡片转为 cancelled 或 interrupted。
- MCP 超时：卡片转为失败，显示 server/tool 和超时信息。
- 前端错过实时事件：重新读取 `thread_read` 后从 `tool_calls` 和 `tool_call_events` 恢复。

## 测试策略

主进程测试：

- `ToolTraceReporter` 发事件顺序正确。
- `shell` 输出可分块产生 `tool.output.delta`。
- file/search 工具至少产生 started/progress/completed。
- 工具失败时 status 和 output 正确保存。
- `tool_call_events` 插入、读取、截断逻辑正确。

前端测试：

- assistant 消息中会渲染 `ToolTraceGroup`。
- 运行中卡片默认展开，成功历史卡片默认折叠。
- `tool.output.delta` 会追加到对应 `toolCallId`。
- `approval.requested` 会让卡片进入等待审批状态。
- 旧会话缺少 `toolCallEvents` 时能从 `toolCalls` 合成卡片。

验证命令：

```bash
pnpm typecheck
pnpm test
pnpm build
```

手动验证：

1. 启动应用。
2. 发送需要读文件、搜索、运行 shell、调用 git 的任务。
3. 确认每个工具调用都出现在聊天流中。
4. 确认 shell/git/mcp 输出实时追加。
5. 确认 file/search 工具有阶段和摘要，不刷屏。
6. 确认失败命令显示失败状态和错误预览。
7. 刷新/重开会话后，已完成工具卡片仍能恢复。

## 交付顺序

1. 增加共享类型和 `tool_call_events` 持久化。
2. 引入 `ToolTraceReporter`，统一 `ToolService.invoke` 事件发送。
3. 改造 shell/git/mcp/file/search 工具实现，接入 reporter。
4. 扩展 `ThreadDetail` 和 `applyEvent`，让前端拿到实时与历史事件。
5. 新增 `ToolTraceGroup` / `ToolTraceCard` 组件和样式。
6. 将工具卡片插入 assistant 聊天消息流。
7. 更新测试并运行完整验证。

## 风险与缓解

- 事件量过大导致渲染卡顿。缓解：预览窗口、行数限制、批量合并 delta。
- 数据库膨胀。缓解：单 tool call 持久化上限、最终输出截断、只保存可恢复摘要。
- `AgentPage.tsx` 已经较大。缓解：工具卡片逻辑拆到独立组件和 reducer，避免继续堆在页面文件。
- 改造 `shell` 为异步流式可能影响原有 tool 返回语义。缓解：外部仍 await 最终 output，实时事件只是旁路观测。
- 所有工具统一接入可能范围较大。缓解：先建立通用协议和组件，再逐类工具接入，每类都有测试。

## 验收标准

- 聊天信息流中可以看到所有工具调用卡片。
- 工具开始执行时卡片立即出现。
- `shell`、耗时 Git 操作、`mcp_call` 有实时输出或实时阶段更新。
- file/search 类工具展示阶段、数量、路径和结果预览，不默认刷长内容。
- 成功、失败、等待审批、取消状态都能正确显示。
- 右侧工具调用 Inspector 仍可查看完整原始信息。
- 重新读取历史会话时，工具卡片可恢复。
- `pnpm typecheck`、`pnpm test`、`pnpm build` 通过。
