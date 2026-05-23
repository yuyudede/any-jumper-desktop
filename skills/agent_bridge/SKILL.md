---
name: agent-bridge
description: Use when the user wants to control their Chrome browser, extract cookies for API calls, read page content, automate web tasks, or manage browser tabs through the Agent Bridge local service. Triggers include keywords like browser control, get cookies, read page, extract data, automate browser, manage tabs, Agent Bridge.
metadata:
  short-description: 通过本地服务控制 Chrome 浏览器
---

# Agent Bridge 浏览器控制工具

## 何时使用

当用户要求以下任一任务时使用本 skill：

- 获取浏览器中已登录网站的 Cookie（复用登录态调用 API）
- 读取当前打开的网页内容（文本、链接、表格、图片等）
- 自动化浏览器操作（点击、填写表单、滚动、提交）
- 管理浏览器标签页（打开、关闭、导航）
- 提取页面中的结构化数据（表格、列表、表单数据）
- 去除页面限制（广告、弹窗、复制限制）
- 读取页面本地存储（localStorage、sessionStorage）
- 执行页面性能监控和分析

## 前置条件

- Any Jumper Desktop 应用正在运行
- 浏览器扩展已连接（可通过 GET /health 检查 extensionCount > 0）
- 不需要特定标签页打开，只要浏览器进程在运行且登录未过期

## 调用方式

### 基础请求格式

```bash
curl -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"<方法名>","params":{...}}'
```

### 响应格式

```json
{
  "id": "请求ID",
  "ok": true/false,
  "result": { ... },
  "error": "失败时的错误信息"
}
```

## 可用方法

### 1. tabs.list - 获取所有标签页

**参数**：`{ "query": {} }`
**返回**：`{ "tabs": [{ id, url, title, active, status, ... }] }`

**示例**：
```bash
curl -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"tabs.list","params":{"query":{}}}'
```

**用途**：查看当前打开的所有标签页，从中提取域名信息。

### 2. cookies.getAll - 获取指定域名的全部 Cookie

**参数**：`{ "domain": "example.com" }`
**返回**：`[{ name, value, domain, path, secure, httpOnly, sameSite, session, expirationDate }]`

**示例**：
```bash
curl -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"cookies.getAll","params":{"domain":"bilibili.com"}}'
```

**用途**：复用浏览器登录态调用 API，无需用户输入账号密码。

**注意**：
- 不传域名参数会返回所有域名的 Cookie，但数据量大可能超时
- 核心登录态 Cookie（如 SESSDATA、bili_jct）是持久化的，浏览器关闭前一直有效
- 会话级 Cookie（标记为 session: true）在浏览器关闭后会丢失

### 3. cookies.get - 获取单个 Cookie

**参数**：`{ "url": "https://example.com", "name": "SESSDATA" }`
**返回**：`{ "cookie": { name, value, domain, ... } }`

**示例**：
```bash
curl -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"cookies.get","params":{"url":"https://bilibili.com","name":"SESSDATA"}}'
```

**用途**：获取特定网站的特定 Cookie 值。

### 4. tabs.create - 打开新标签页

**参数**：`{ "url": "https://example.com" }`
**返回**：`{ "tab": { id, url, title, ... } }`

**示例**：
```bash
curl -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"tabs.create","params":{"url":"https://github.com"}}'
```

**用途**：自动打开新网页。

### 5. tabs.update - 导航已有标签页

**参数**：`{ "tabId": 123456, "url": "https://example.com" }`

**示例**：
```bash
curl -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"tabs.update","params":{"tabId":123456,"url":"https://github.com"}}'
```

**用途**：将现有标签页导航到新 URL。

### 6. tabs.remove - 关闭标签页

**参数**：`{ "tabIds": [123456, 789012] }`

**示例**：
```bash
curl -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"tabs.remove","params":{"tabIds":[123456,789012]}}'
```

**用途**：批量关闭标签页。

### 7. scripting.execute - 在标签页中执行 JavaScript

**参数**：`{ "tabId": 123456, "code": "return document.title" }`
**返回**：`{ "results": [{ "result": { "ok": true, "value": "..." } }] }`

**注意**：
- `code` 必须是字符串
- 支持 `return` 语句
- 可以执行任意 JavaScript 代码

**示例**：
```bash
# 获取页面标题
curl -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"scripting.execute","params":{"tabId":123456,"code":"return document.title"}}'

# 获取页面纯文本
curl -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"scripting.execute","params":{"tabId":123456,"code":"return document.body.innerText"}}'

# 获取所有链接
curl -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"scripting.execute","params":{"tabId":123456,"code":"return JSON.stringify([...document.querySelectorAll(\"a\")].map(a => ({text: a.textContent.trim(), href: a.href})))"}}'
```

## 常见使用场景

### 1. 复用登录态调用 API

```bash
# 步骤1：获取 Cookie
COOKIES=$(curl -s -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"cookies.getAll","params":{"domain":"xiaomimimo.com"}}')

# 步骤2：提取 Cookie 值并构造请求头
COOKIE_STR=$(echo $COOKIES | jq -r '.result | map(.name + "=" + (.value | @uri)) | join("; ")')

# 步骤3：使用 Cookie 调用 API
curl -X GET 'https://platform.xiaomimimo.com/api/v1/tokenPlan/usage' \
  -H "Cookie: $COOKIE_STR"
```

### 2. 读取页面内容

```bash
# 获取页面标题
curl -s -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"scripting.execute","params":{"tabId":123456,"code":"return document.title"}}'

# 获取页面所有文本
curl -s -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"scripting.execute","params":{"tabId":123456,"code":"return document.body.innerText"}}'

# 提取表格数据
curl -s -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"scripting.execute","params":{"tabId":123456,"code":"return JSON.stringify([...document.querySelectorAll(\"table tr\")].map(row => [...row.cells].map(cell => cell.textContent.trim())))}}'
```

### 3. 自动化操作

```bash
# 自动点击按钮
curl -s -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"scripting.execute","params":{"tabId":123456,"code":"document.querySelector(\"#submit-btn\").click()"}}'

# 自动填写表单
curl -s -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"scripting.execute","params":{"tabId":123456,"code":"document.querySelector(\"#username\").value = \"admin\"; document.querySelector(\"#password\").value = \"123456\"; document.querySelector(\"form\").submit()"}}'

# 自动滚动到底部
curl -s -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"scripting.execute","params":{"tabId":123456,"code":"window.scrollTo(0, document.body.scrollHeight)"}}'
```

### 4. 提取结构化数据

```bash
# 提取 Open Graph 元数据
curl -s -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"scripting.execute","params":{"tabId":123456,"code":"return JSON.stringify({title: document.title, description: document.querySelector(\"meta[name=\\\"description\\\"]\")?.content, ogImage: document.querySelector(\"meta[property=\\\"og:image\\\"]\")?.content, canonical: document.querySelector(\"link[rel=\\\"canonical\\\"]\")?.href})"}}'

# 提取所有图片 URL
curl -s -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"scripting.execute","params":{"tabId":123456,"code":"return JSON.stringify([...document.querySelectorAll(\"img\")].map(img => img.src))"}}'

# 获取 localStorage 数据
curl -s -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"scripting.execute","params":{"tabId":123456,"code":"return JSON.stringify({ ...localStorage })"}}'
```

### 5. 去除页面限制

```bash
# 去除复制限制
curl -s -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"scripting.execute","params":{"tabId":123456,"code":"document.oncopy = null; document.onselectstart = null; document.oncontextmenu = null; return \"限制已去除\""}}'

# 去除广告
curl -s -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"scripting.execute","params":{"tabId":123456,"code":"document.querySelectorAll(\"[class*=\\\"ad\\\"], [id*=\\\"ad\\\"]\").forEach(el => el.remove()); return \"广告已去除\""}}'

# 去除付费弹窗
curl -s -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d '{"method":"scripting.execute","params":{"tabId":123456,"code":"document.querySelectorAll(\".modal, .paywall, .overlay\").forEach(el => el.remove()); return \"弹窗已去除\""}}'
```

## 技术原理

### 为什么不受 CORS 限制？

CORS（跨域资源共享）是浏览器的安全策略，只限制浏览器内部的 JS 发起的请求。Agent Bridge 的工作方式是：

1. 通过 RPC 从浏览器获取 Cookie
2. 用 curl / Node.js / Python 等服务端工具直接请求 API

服务端发出的 HTTP 请求不受 CORS 限制。

### Cookie 获取机制

Agent Bridge 调用的是浏览器扩展的 `chrome.cookies.getAll` API：

- **只需要浏览器进程在运行 + 扩展在运行**，不需要任何标签页打开
- `chrome.cookies.getAll` 读取的是浏览器的 Cookie Store，它是持久化存储在磁盘上的
- Cookie 的有效期取决于各网站的设置，过期后会自动清理

### 安全考虑

- Cookie 包含登录凭证，建议仅在本地信任环境中使用
- 不要将获取的 Cookie 明文暴露给不可信的第三方
- 定期检查 Cookie 的有效性，过期后需要重新获取

## 故障排除

### 1. 服务未运行

```bash
# 检查服务状态
curl -s 'http://127.0.0.1:9528/health'
```

如果返回错误，确保 Any Jumper Desktop 应用正在运行。

### 2. 浏览器扩展未连接

```bash
# 检查扩展连接数
curl -s 'http://127.0.0.1:9528/health' | jq '.extensionCount'
```

如果返回 0，检查浏览器扩展是否已启用。

### 3. Cookie 获取失败

- 确保目标域名在浏览器中有有效的登录态
- 检查域名拼写是否正确
- 尝试先访问目标网站，确保 Cookie 已生成

### 4. 脚本执行失败

- 检查标签页 ID 是否有效
- 确保 JavaScript 语法正确
- 检查页面是否已完全加载

## 最佳实践

1. **先检查服务状态**：在执行任何操作前，先调用 `/health` 确认服务正常
2. **使用具体域名**：获取 Cookie 时，使用具体域名而不是空参数
3. **处理错误响应**：检查每个请求的 `ok` 字段和 `error` 信息
4. **合理使用标签页**：及时关闭不再需要的标签页，避免资源浪费
5. **避免频繁请求**：对同一网站的请求间隔适当时间，避免被反爬虫机制拦截

## 示例工作流

### 完整的 API 调用流程

```bash
#!/bin/bash

# 1. 检查服务状态
echo "检查 Agent Bridge 状态..."
HEALTH=$(curl -s 'http://127.0.0.1:9528/health')
if [[ $(echo $HEALTH | jq -r '.listening') != "true" ]]; then
  echo "Agent Bridge 未运行，请启动 Any Jumper Desktop"
  exit 1
fi

if [[ $(echo $HEALTH | jq -r '.extensionCount') -eq 0 ]]; then
  echo "浏览器扩展未连接"
  exit 1
fi

# 2. 获取 Cookie
echo "获取 Cookie..."
DOMAIN="xiaomimimo.com"
COOKIES=$(curl -s -X POST 'http://127.0.0.1:9528/rpc' \
  -H 'Content-Type: application/json' \
  -d "{\"method\":\"cookies.getAll\",\"params\":{\"domain\":\"$DOMAIN\"}}")

if [[ $(echo $COOKIES | jq -r '.ok') != "true" ]]; then
  echo "获取 Cookie 失败: $(echo $COOKIES | jq -r '.error')"
  exit 1
fi

# 3. 构造 Cookie 字符串
COOKIE_STR=$(echo $COOKIES | jq -r '.result | map(.name + "=" + (.value | @uri)) | join("; ")')

# 4. 调用 API
echo "调用 API..."
API_RESPONSE=$(curl -s -X GET "https://platform.$DOMAIN/api/v1/tokenPlan/usage" \
  -H "Cookie: $COOKIE_STR")

echo "API 响应: $API_RESPONSE"
```

## 注意事项

1. **数据量限制**：不传域名参数的 `cookies.getAll` 会返回大量数据，可能导致超时
2. **会话级 Cookie**：标记为 `session: true` 的 Cookie 在浏览器关闭后会丢失
3. **安全性**：Cookie 包含敏感信息，妥善保管，不要泄露给第三方
4. **性能考虑**：频繁执行 JavaScript 可能影响页面性能
5. **兼容性**：某些网站可能有反自动化机制，需要特殊处理

## 相关资源

- Chrome 扩展 API 文档：https://developer.chrome.com/docs/extensions/reference/
- CORS 详解：https://developer.mozilla.org/zh-CN/docs/Web/HTTP/CORS
- Cookie 安全：https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Cookies