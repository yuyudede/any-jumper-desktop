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

  it("exposes loopback health while listening", async () => {
    const bridge = new AgentBridgeService({ port: 0, maxLogs: 10 });
    await bridge.start();
    const status = bridge.status();

    expect(status.listening).toBe(true);
    expect(status.port).toBeGreaterThan(0);

    await bridge.stop();
  });
});
