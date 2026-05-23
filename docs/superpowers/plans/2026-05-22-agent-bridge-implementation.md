# Agent Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Any Jumper Desktop 内置浏览器扩展桥接服务，让外部 AI agent 通过 `POST http://127.0.0.1:9528/rpc` 调用浏览器能力。

**Architecture:** Electron 主进程新增 `AgentBridgeService`，负责 HTTP/WebSocket loopback 服务、RPC 转发、状态统计和日志。渲染进程通过现有 IPC 读取状态和控制服务，Agent 页面左侧新增 `agent-bridge` 标签入口，点击后把中间主对话区域切换为 Agent Bridge 面板。

**Tech Stack:** Electron main、Node `http`/`crypto`、React、TypeScript、Vitest、Chrome MV3 扩展。

---

## 文件结构

- 创建 `electron/agentBridge.ts`：主进程 Agent Bridge 服务，包含 HTTP 路由、WebSocket 握手/帧解析、RPC 转发、状态和日志。
- 修改 `electron/main.ts`：初始化 `AgentBridgeService`，接入 IPC 命令和窗口事件广播。
- 修改 `electron/preload.ts`：增加 `agent-bridge-event` 订阅。
- 修改 `src/vite-env.d.ts`：补充 preload 暴露类型。
- 修改 `src/types/index.ts`：增加 Agent Bridge 状态、日志、RPC 类型。
- 修改 `src/services/desktopApi.ts`：封装 bridge IPC API。
- 修改 `src/pages/AgentPage.tsx`：左侧新增 `agent-bridge` 标签入口，中间主区域增加 Agent Bridge 面板。
- 修改 `src/styles/theme.css`：补充左侧标签和中间 Agent Bridge 面板日志样式。
- 修改 `src/app/App.navigation.test.ts`：增加源码级 UI 位置测试。
- 创建 `electron/agentBridge.test.ts`：测试日志截断、状态统计、无扩展连接 RPC 错误。
- 修改浏览器扩展 `background.js`：修复 `scripting.execute` 返回值，补充 Chrome Web Store 受限页面判断。

---

### Task 1: 主进程服务测试

**Files:**
- Create: `electron/agentBridge.test.ts`
- Create: `electron/agentBridge.ts`

- [ ] **Step 1: 写失败测试**

测试内容：

```ts
import { describe, expect, it } from "vitest";
import { AgentBridgeService } from "./agentBridge";

describe("AgentBridgeService", () => {
  it("trims logs to the configured limit", () => {
    const bridge = new AgentBridgeService({ autoStart: false, maxLogs: 3 });
    bridge.addLog("info", "one");
    bridge.addLog("info", "two");
    bridge.addLog("info", "three");
    bridge.addLog("info", "four");

    expect(bridge.status().logs.map((log) => log.message)).toEqual(["two", "three", "four"]);
  });

  it("returns a clear rpc error when no extension is connected", async () => {
    const bridge = new AgentBridgeService({ autoStart: false });
    const response = await bridge.rpc({ method: "tabs.list", params: { query: {} } });

    expect(response.ok).toBe(false);
    expect(response.error).toContain("没有浏览器扩展连接");
    expect(bridge.status().errorCount).toBe(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run electron/agentBridge.test.ts`

Expected: FAIL，原因是 `./agentBridge` 尚不存在。

- [ ] **Step 3: 实现最小服务骨架**

实现 `AgentBridgeService` 的构造、`addLog()`、`status()`、`rpc()` 无连接错误路径。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm vitest run electron/agentBridge.test.ts`

Expected: PASS。

---

### Task 2: HTTP/WebSocket 桥接服务

**Files:**
- Modify: `electron/agentBridge.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: 增加失败测试**

在 `electron/agentBridge.test.ts` 增加：

```ts
it("exposes loopback health while listening", async () => {
  const bridge = new AgentBridgeService({ port: 0, maxLogs: 10 });
  await bridge.start();
  const status = bridge.status();
  expect(status.listening).toBe(true);
  expect(status.port).toBeGreaterThan(0);
  await bridge.stop();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run electron/agentBridge.test.ts`

Expected: FAIL，原因是 `start()`/`stop()` 或端口监听尚未实现。

- [ ] **Step 3: 实现 HTTP 服务**

用 Node `http.createServer()` 实现 `GET /health`、`GET /logs`、`POST /rpc`，并实现 `start()`、`stop()`、`restart()`。

- [ ] **Step 4: 实现最小 WebSocket 服务**

用 HTTP `upgrade` 完成 WebSocket 握手，支持文本帧收发、close 帧处理、连接计数和事件日志。RPC 使用 pending map 按 `id` 等待扩展响应。

- [ ] **Step 5: 接入 Electron main**

在 `electron/main.ts` 初始化 `agentBridge`，应用 ready 后启动；IPC 增加 `agent_bridge_status`、`agent_bridge_restart`、`agent_bridge_clear_logs`、`agent_bridge_rpc`。

- [ ] **Step 6: 运行测试和类型检查**

Run:

```bash
pnpm vitest run electron/agentBridge.test.ts
pnpm typecheck
```

Expected: PASS。

---

### Task 3: 前端 API 与 UI 测试

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/services/desktopApi.ts`
- Modify: `electron/preload.ts`
- Modify: `src/vite-env.d.ts`
- Modify: `src/app/App.navigation.test.ts`

- [ ] **Step 1: 写失败测试**

在 `src/app/App.navigation.test.ts` 增加：

```ts
it("places the agent bridge entry above project and conversation sections", () => {
  const source = readProjectFile("src/pages/AgentPage.tsx");
  const bridgeIndex = source.indexOf("agent-bridge");
  const projectIndex = source.indexOf("<div className=\"panel-title\">项目</div>");
  const threadIndex = source.indexOf("<div className=\"panel-title\">会话</div>");

  expect(bridgeIndex).toBeGreaterThan(-1);
  expect(bridgeIndex).toBeLessThan(projectIndex);
  expect(bridgeIndex).toBeLessThan(threadIndex);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm vitest run src/app/App.navigation.test.ts`

Expected: FAIL，原因是左侧入口尚不存在。

- [ ] **Step 3: 增加类型与 desktopApi**

增加 Agent Bridge 类型和 `desktopApi.agentBridgeStatus()` 等封装。

- [ ] **Step 4: 运行类型检查**

Run: `pnpm typecheck`

Expected: 如果 UI 尚未接入，类型可以通过或只暴露未使用 API。

---

### Task 4: Agent 页面 UI 集成

**Files:**
- Modify: `src/pages/AgentPage.tsx`
- Modify: `src/styles/theme.css`

- [ ] **Step 1: 实现左侧标签入口**

在 `项目` 区块上方新增 `agent-bridge` 按钮。按钮只显示图标和文字，不展示摘要、数字、状态或日志。点击后把中间主区域切到 `bridge` 视图。

- [ ] **Step 2: 实现中间 Agent Bridge 面板**

新增 `BridgeMainPanel`，在中间主对话区域展示健康状态、操作按钮和完整日志列表。右侧 Inspector 继续只保留 `Flow / Git / Ext`。

- [ ] **Step 3: 接入 bridge 状态事件**

AgentPage 初始化时读取 `agentBridgeStatus()`，订阅 `onAgentBridgeEvent()`，重启/清空日志后刷新状态。

- [ ] **Step 4: 补充样式**

新增 `.agent-bridge-entry`、`.bridge-health-grid`、`.bridge-log-list`、`.bridge-log-entry` 等样式，保持现有灰阶桌面应用风格。

- [ ] **Step 5: 运行 UI 源码测试**

Run: `pnpm vitest run src/app/App.navigation.test.ts`

Expected: PASS。

---

### Task 5: 浏览器扩展可靠性修复

**Files:**
- Modify: `/Users/yude/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_x8yl41zoy3ya22_4df5/msg/file/2026-05/browser-extension/background.js`

- [ ] **Step 1: 修复 `runFunction` 返回值**

把 `new Function(wrapped)` 改为能返回 wrapped 表达式结果的形式，确保函数式代码和函数体代码都返回结果。

- [ ] **Step 2: 增加 Chrome Web Store 受限 URL**

把 `https://chromewebstore.google.com/` 和 `https://chrome.google.com/webstore/` 纳入 `isRestrictedUrl()` 判断。

- [ ] **Step 3: 运行语法检查**

Run:

```bash
node --check background.js
node --check popup.js
```

Expected: PASS。

---

### Task 6: 全量验证

**Files:**
- No new files.

- [ ] **Step 1: 运行测试**

Run: `pnpm test`

Expected: PASS。

- [ ] **Step 2: 运行类型检查和构建**

Run:

```bash
pnpm typecheck
pnpm build:main
pnpm build:renderer
```

Expected: PASS。

- [ ] **Step 3: 启动开发应用**

Run: `pnpm dev`

Expected: Electron 应用启动，`GET http://127.0.0.1:9528/health` 返回 JSON。

- [ ] **Step 4: 手动 RPC 验证**

加载扩展后运行：

```bash
curl -s http://127.0.0.1:9528/rpc \
  -H 'content-type: application/json' \
  -d '{"method":"tabs.list","params":{"query":{}}}'
```

Expected: 返回 `{ "ok": true, "result": { "tabs": [...] } }`。

---

## 自审结果

- 覆盖设计文档的主进程服务、HTTP/WebSocket、IPC、左侧标签、中间 Agent Bridge 面板、扩展修复和验证要求。
- 当前项目目录不是 git 仓库，无法执行计划中的提交动作；实现时以测试和构建输出作为检查点。
- 没有保留待定项。
