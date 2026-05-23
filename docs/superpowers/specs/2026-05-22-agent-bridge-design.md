# Agent Bridge 设计方案

## 目标

把浏览器扩展桥接能力整合进 Any Jumper Desktop，让桌面端应用直接承担本地桥接服务的角色。这样用户不需要再额外启动 Solazah Desktop 或其他主进程。

当 Any Jumper Desktop 运行时：

- 浏览器扩展主动连接 Any Jumper Desktop。
- 外部 AI agent 通过本地 HTTP RPC 调用浏览器能力。
- 用户可以在 Any Jumper Desktop 里查看桥接服务健康状态、连接状态和调用日志。

## 方案选择

采用方案 A：在 Electron 主进程内置 Agent Bridge 服务。

服务监听地址：

```text
127.0.0.1:9528
```

同一个端口提供两类入口：

- 浏览器扩展连接：`ws://127.0.0.1:9528`
- AI agent 调用：`POST http://127.0.0.1:9528/rpc`

数据流：

```text
AI agent
  -> POST /rpc
  -> Any Jumper Desktop Electron 主进程
  -> WebSocket
  -> Chrome 扩展 background.js
  -> 浏览器 tabs / page / cookies / bookmarks 等能力
```

这个方案的好处是桥接服务生命周期跟桌面端应用绑定，不需要单独管理子进程；同时 UI 可以直接读取健康状态和日志。

## UI 设计

在 Agent 页面左侧栏新增一个独立区块，名称为：

```text
agent-bridge
```

位置放在 `项目` 和 `会话` 上方，参考 Codex 左侧栏里 `插件 / 自动化` 的位置。

左侧只展示一个标签级入口，不展示摘要、数字、状态或日志。入口文案为 `agent-bridge`，视觉密度参考左侧的 `插件`、`自动化` 入口。

点击 `agent-bridge` 后，不在左侧栏展开面板，也不打开右侧 Inspector，而是直接把中间主对话区域切换为 Agent Bridge 面板。用户点击任意工作区或会话后，中间主区域切回普通对话视图。

中间 Agent Bridge 面板展示完整信息：

- 当前服务健康状态。
- 已连接扩展数量。
- 最近连接时间。
- 最近心跳时间。
- 请求总数。
- 错误总数。
- 重启服务按钮。
- 清空日志按钮。
- 复制调用示例按钮。
- 最近完整日志列表。

右侧 Inspector 继续保留现有 `Flow / Git / Ext` Tab，不承载 Agent Bridge 功能。

## 主进程设计

在 Electron 主进程中新增 `AgentBridgeService`。

职责：

- 启动和停止本地 loopback 服务。
- 接收浏览器扩展的 WebSocket 连接。
- 接收外部 AI agent 的 HTTP RPC 请求。
- 将 HTTP RPC 转发给已连接的浏览器扩展。
- 等待扩展返回结果，并把结果响应给调用方。
- 记录服务日志、请求数、错误数、连接时间和心跳时间。
- 通过 IPC 把状态变化通知渲染进程。

HTTP 接口：

```text
GET  /health
GET  /logs
POST /rpc
```

`POST /rpc` 请求体：

```json
{
  "id": "optional-request-id",
  "method": "tabs.list",
  "params": {
    "query": {}
  }
}
```

返回值沿用扩展现有协议：

```json
{
  "id": "request-id",
  "ok": true,
  "result": {}
}
```

如果没有浏览器扩展连接，`/rpc` 直接返回清晰错误，不长时间挂起。

## IPC 与前端 API

在现有 `any-jumper:invoke` 机制里新增命令：

- `agent_bridge_status`
- `agent_bridge_restart`
- `agent_bridge_clear_logs`
- `agent_bridge_rpc`

在 `desktopApi` 中封装：

- `agentBridgeStatus()`
- `agentBridgeRestart()`
- `agentBridgeClearLogs()`
- `agentBridgeRpc(method, params)`
- `onAgentBridgeEvent(handler)`

新增共享类型：

- `AgentBridgeStatus`
- `AgentBridgeLogEntry`
- `AgentBridgeRpcRequest`
- `AgentBridgeRpcResponse`

## 浏览器扩展改造

扩展仍然连接：

```text
ws://127.0.0.1:9528
```

保持现有 JSON over WebSocket 协议不变：

- 请求：`{ id, method, params? }`
- 响应：`{ id, ok, result?, error? }`
- 事件：`{ event, payload, ts }`

同时做两个小修复：

- 修复 `scripting.execute` 中函数式代码可能丢失返回值的问题。
- 把 `https://chromewebstore.google.com/` 纳入受限页面判断，避免页面脚本执行卡死。

## 日志与健康状态

日志保存在内存中，限制最大条数，避免无限增长。

日志类型：

- `info`：服务启动、扩展连接、普通事件。
- `success`：RPC 成功。
- `warning`：无扩展连接、无效请求等可恢复问题。
- `error`：端口占用、RPC 失败、WebSocket 异常。

健康状态包含：

- 服务是否正在监听。
- 监听端口。
- 扩展连接数量。
- 最近连接时间。
- 最近心跳时间。
- 请求总数。
- 错误总数。
- 最近错误信息。
- 最近日志列表。

## 错误处理

- 端口 `9528` 被占用时，UI 显示服务异常和错误原因。
- 没有扩展连接时，`/rpc` 返回明确错误。
- 每个 RPC 设置超时，超时后返回错误并记录日志。
- WebSocket 断开后更新连接状态，不影响桌面端继续运行。
- 重启服务时先释放旧 server，再重新监听端口。

## 测试与验证

自动验证：

- 运行 TypeScript 类型检查。
- 运行现有 Vitest 测试。
- 增加轻量源码测试，确认 `agent-bridge` 位于 `项目` 和 `会话` 上方。
- 增加轻量测试或可测试 helper，覆盖日志截断、状态统计和 RPC 超时行为。

手动验证：

1. 启动 Any Jumper Desktop。
2. 加载浏览器扩展。
3. 点击左侧 `agent-bridge` 标签，确认中间主对话区域切换为 Agent Bridge 面板。
4. 在中间 Agent Bridge 面板中确认服务运行状态和扩展连接状态。
5. 通过 HTTP 调用：

   ```bash
   curl -s http://127.0.0.1:9528/rpc \
     -H 'content-type: application/json' \
     -d '{"method":"tabs.list","params":{"query":{}}}'
   ```

6. 确认返回浏览器标签页结果。
7. 确认中间 Agent Bridge 面板展示完整日志。
