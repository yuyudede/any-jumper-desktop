import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Socket } from "node:net";

export type AgentBridgeLogLevel = "info" | "success" | "warning" | "error";

export interface AgentBridgeLogEntry {
  id: string;
  level: AgentBridgeLogLevel;
  message: string;
  detail?: string;
  createdAt: number;
}

export interface AgentBridgeRpcRequest {
  id?: string;
  method: string;
  params?: Record<string, unknown>;
}

export interface AgentBridgeRpcResponse {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface AgentBridgeStatus {
  listening: boolean;
  host: string;
  port: number;
  endpoint: string;
  extensionCount: number;
  requestCount: number;
  errorCount: number;
  lastConnectedAt?: number;
  lastHeartbeatAt?: number;
  lastError?: string;
  logs: AgentBridgeLogEntry[];
}

export interface AgentBridgeServiceOptions {
  autoStart?: boolean;
  host?: string;
  port?: number;
  maxLogs?: number;
  rpcTimeoutMs?: number;
  onStatusChange?: (status: AgentBridgeStatus) => void;
}

interface BridgeClient {
  id: string;
  socket: Socket;
  buffer: Buffer;
  connectedAt: number;
}

interface PendingRpc {
  method: string;
  timer: NodeJS.Timeout;
  resolve: (response: AgentBridgeRpcResponse) => void;
}

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 9528;
const DEFAULT_MAX_LOGS = 200;
const DEFAULT_RPC_TIMEOUT_MS = 28_000;
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

export class AgentBridgeService {
  private readonly host: string;
  private desiredPort: number;
  private actualPort: number;
  private readonly maxLogs: number;
  private readonly rpcTimeoutMs: number;
  private readonly onStatusChange?: (status: AgentBridgeStatus) => void;
  private logs: AgentBridgeLogEntry[] = [];
  private requestCount = 0;
  private errorCount = 0;
  private lastError?: string;
  private lastConnectedAt?: number;
  private lastHeartbeatAt?: number;
  private server?: Server;
  private clients = new Map<string, BridgeClient>();
  private pending = new Map<string, PendingRpc>();

  constructor(options: AgentBridgeServiceOptions = {}) {
    this.host = options.host ?? DEFAULT_HOST;
    this.desiredPort = options.port ?? DEFAULT_PORT;
    this.actualPort = this.desiredPort;
    this.maxLogs = options.maxLogs ?? DEFAULT_MAX_LOGS;
    this.rpcTimeoutMs = options.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
    this.onStatusChange = options.onStatusChange;
  }

  async start() {
    if (this.server?.listening) return;

    const server = createServer((req, res) => {
      void this.handleHttpRequest(req, res);
    });
    server.on("upgrade", (req, socket) => this.handleUpgrade(req, socket as Socket));
    server.on("error", (error) => {
      this.recordError("桥接服务异常", error instanceof Error ? error.message : String(error));
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.desiredPort, this.host);
    });

    this.server = server;
    const address = server.address();
    if (typeof address === "object" && address) {
      this.actualPort = (address as AddressInfo).port;
    }
    this.addLog("info", "Agent Bridge 服务已启动", this.status().endpoint);
    this.emitStatus();
  }

  async stop() {
    for (const client of this.clients.values()) {
      this.closeClient(client);
    }
    this.clients.clear();
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.resolve({ id, ok: false, error: "Agent Bridge 服务已停止" });
    }
    this.pending.clear();

    const server = this.server;
    this.server = undefined;
    if (!server) return;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    this.addLog("info", "Agent Bridge 服务已停止");
    this.emitStatus();
  }

  async restart() {
    await this.stop();
    await this.start();
    return this.status();
  }

  clearLogs() {
    this.logs = [];
    this.emitStatus();
  }

  addLog(level: AgentBridgeLogLevel, message: string, detail?: string) {
    this.logs.push({
      id: `bridge_log_${randomUUID().replaceAll("-", "")}`,
      level,
      message,
      detail,
      createdAt: Date.now(),
    });
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(this.logs.length - this.maxLogs);
    }
    this.emitStatus();
  }

  status(): AgentBridgeStatus {
    return {
      listening: Boolean(this.server?.listening),
      host: this.host,
      port: this.actualPort,
      endpoint: `http://${this.host}:${this.actualPort}`,
      extensionCount: this.clients.size,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      lastConnectedAt: this.lastConnectedAt,
      lastHeartbeatAt: this.lastHeartbeatAt,
      lastError: this.lastError,
      logs: [...this.logs],
    };
  }

  async rpc(request: AgentBridgeRpcRequest): Promise<AgentBridgeRpcResponse> {
    this.requestCount += 1;
    const id = request.id ?? `rpc_${randomUUID().replaceAll("-", "")}`;
    const client = this.firstClient();
    if (!client) {
      return this.failRpc(id, "没有浏览器扩展连接，请先在 Chrome 中加载并启用 Solazah Browser Bridge 扩展。", request.method);
    }
    if (!request.method || typeof request.method !== "string") {
      return this.failRpc(id, "method must be a non-empty string", JSON.stringify(request));
    }

    return new Promise<AgentBridgeRpcResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(this.failRpcSync(id, `RPC ${request.method} 超时`, `${this.rpcTimeoutMs}ms`));
      }, this.rpcTimeoutMs);
      this.pending.set(id, { method: request.method, timer, resolve });
      this.sendText(client, JSON.stringify({ id, method: request.method, params: request.params ?? {} }));
      this.addLog("info", `RPC 已转发：${request.method}`, id);
    });
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse) {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const url = new URL(req.url || "/", `http://${this.host}:${this.actualPort}`);
    try {
      if (req.method === "GET" && url.pathname === "/health") {
        writeJson(res, 200, this.status());
        return;
      }
      if (req.method === "GET" && url.pathname === "/logs") {
        writeJson(res, 200, { logs: this.status().logs });
        return;
      }
      if (req.method === "POST" && url.pathname === "/rpc") {
        const body = await readJsonBody(req);
        const response = await this.rpc(body as AgentBridgeRpcRequest);
        writeJson(res, response.ok ? 200 : 502, response);
        return;
      }
      if (req.method === "GET" && url.pathname === "/rpc") {
        writeJson(res, 200, {
          ok: true,
          usage: {
            method: "POST",
            url: "/rpc",
            body: { method: "tabs.list", params: { query: {} } },
          },
        });
        return;
      }
      writeJson(res, 404, { ok: false, error: "Not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.recordError("HTTP 请求失败", message);
      writeJson(res, 500, { ok: false, error: message });
    }
  }

  private handleUpgrade(req: IncomingMessage, socket: Socket) {
    const key = req.headers["sec-websocket-key"];
    if (typeof key !== "string") {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    const accept = createHash("sha1").update(key + WS_GUID).digest("base64");
    socket.write([
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "\r\n",
    ].join("\r\n"));

    const client: BridgeClient = {
      id: `extension_${randomUUID().replaceAll("-", "")}`,
      socket,
      buffer: Buffer.alloc(0),
      connectedAt: Date.now(),
    };
    this.clients.set(client.id, client);
    this.lastConnectedAt = client.connectedAt;
    this.addLog("success", "浏览器扩展已连接", req.headers["user-agent"] || client.id);
    this.emitStatus();

    socket.on("data", (chunk) => this.handleSocketData(client, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    socket.on("close", () => this.removeClient(client, "浏览器扩展已断开"));
    socket.on("error", (error) => this.removeClient(client, error.message));
  }

  private handleSocketData(client: BridgeClient, chunk: Buffer) {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    while (client.buffer.length >= 2) {
      const frame = readFrame(client.buffer);
      if (!frame) return;
      client.buffer = client.buffer.subarray(frame.frameLength);
      if (frame.opcode === 0x8) {
        this.removeClient(client, "浏览器扩展关闭连接");
        return;
      }
      if (frame.opcode === 0x9) {
        this.sendFrame(client, 0xA, frame.payload);
        continue;
      }
      if (frame.opcode !== 0x1) continue;
      this.handleClientMessage(client, frame.payload.toString("utf8"));
    }
  }

  private handleClientMessage(_client: BridgeClient, text: string) {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(text) as Record<string, unknown>;
    } catch {
      this.recordError("收到无效扩展消息", text.slice(0, 160));
      return;
    }
    if (typeof message.id === "string" && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id)!;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      const response = message as unknown as AgentBridgeRpcResponse;
      if (response.ok) {
        this.addLog("success", `RPC 完成：${pending.method}`, message.id);
      } else {
        this.recordError(`RPC 失败：${pending.method}`, String(response.error || "unknown error"));
      }
      pending.resolve(response);
      return;
    }
    if (typeof message.event === "string") {
      if (message.event === "bridge.heartbeat") this.lastHeartbeatAt = Date.now();
      this.addLog("info", `扩展事件：${message.event}`);
    }
  }

  private firstClient() {
    return this.clients.values().next().value as BridgeClient | undefined;
  }

  private async failRpc(id: string, message: string, detail?: string): Promise<AgentBridgeRpcResponse> {
    return this.failRpcSync(id, message, detail);
  }

  private failRpcSync(id: string, message: string, detail?: string): AgentBridgeRpcResponse {
    this.errorCount += 1;
    this.lastError = message;
    this.addLog("warning", message, detail);
    return { id, ok: false, error: message };
  }

  private recordError(message: string, detail?: string) {
    this.errorCount += 1;
    this.lastError = detail ? `${message}: ${detail}` : message;
    this.addLog("error", message, detail);
  }

  private sendText(client: BridgeClient, text: string) {
    this.sendFrame(client, 0x1, Buffer.from(text));
  }

  private sendFrame(client: BridgeClient, opcode: number, payload: Buffer) {
    try {
      client.socket.write(writeFrame(opcode, payload));
    } catch (error) {
      this.removeClient(client, error instanceof Error ? error.message : String(error));
    }
  }

  private closeClient(client: BridgeClient) {
    try {
      client.socket.write(writeFrame(0x8, Buffer.alloc(0)));
      client.socket.destroy();
    } catch {
      client.socket.destroy();
    }
  }

  private removeClient(client: BridgeClient, reason: string) {
    if (!this.clients.has(client.id)) return;
    this.clients.delete(client.id);
    this.addLog("warning", "浏览器扩展连接已关闭", reason);
    this.emitStatus();
  }

  private emitStatus() {
    this.onStatusChange?.(this.status());
  }
}

function setCorsHeaders(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > 1_000_000) throw new Error("request body is too large");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  return JSON.parse(text) as unknown;
}

function readFrame(buffer: Buffer) {
  if (buffer.length < 2) return undefined;
  const first = buffer[0];
  const second = buffer[1];
  const opcode = first & 0x0f;
  const masked = (second & 0x80) === 0x80;
  let length = second & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < offset + 2) return undefined;
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length < offset + 8) return undefined;
    const bigLength = buffer.readBigUInt64BE(offset);
    if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("websocket frame is too large");
    length = Number(bigLength);
    offset += 8;
  }
  let mask: Buffer | undefined;
  if (masked) {
    if (buffer.length < offset + 4) return undefined;
    mask = buffer.subarray(offset, offset + 4);
    offset += 4;
  }
  const frameLength = offset + length;
  if (buffer.length < frameLength) return undefined;
  const payload = Buffer.from(buffer.subarray(offset, frameLength));
  if (mask) {
    for (let i = 0; i < payload.length; i += 1) {
      payload[i] ^= mask[i % 4];
    }
  }
  return { opcode, payload, frameLength };
}

function writeFrame(opcode: number, payload: Buffer) {
  const length = payload.length;
  let header: Buffer;
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}
