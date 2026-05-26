import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("PortalPage settings layout", () => {
  it("uses independent Portal settings instead of new-session defaults", () => {
    const source = readProjectFile("src/pages/PortalPage.tsx");
    const desktopApi = readProjectFile("src/services/desktopApi.ts");
    const electronMain = readProjectFile("electron/main.ts");

    expect(source).toContain('title="Portal"');
    expect(source).toContain("portalShortcut");
    expect(source).toContain("portalDefaultWorkspaceId");
    expect(source).toContain("portalDefaultProviderId");
    expect(source).toContain("portalDefaultModel");
    expect(source).toContain("portalReasoningEffort");
    expect(source).toContain("mainWindowShortcut");
    expect(source).toContain('type PortalSubTab = "usage" | "sessions" | "quickAsk" | "mainApp";');
    expect(source).toContain('useState<PortalSubTab>("usage")');
    expect(source).toContain("recordingShortcutTarget");
    expect(source).toContain("开始录入");
    expect(source).toContain("取消录入");
    expect(source).toContain("快捷键注册失败");
    expect(source).toContain("portalSubTab");
    expect(source).toContain("portal-sub-tabs");
    const labels = Array.from(source.matchAll(/label: "([^"]+)"/g)).map((match) => match[1]);
    expect(labels.slice(0, 4)).toEqual(["Usage", "Sessions", "Quick Ask", "Main App"]);
    expect(source.indexOf('id: "usage"')).toBeLessThan(source.indexOf('id: "sessions"'));
    expect(source.indexOf('id: "sessions"')).toBeLessThan(source.indexOf('id: "quickAsk"'));
    expect(source.indexOf('id: "quickAsk"')).toBeLessThan(source.indexOf('id: "mainApp"'));
    expect(source).toContain('label: "Main App"');
    expect(source).toContain("PortalUsageManagement");
    expect(source).toContain("PortalSessionManagement");
    const usagePage = readProjectFile("src/pages/portal/PortalUsageManagement.tsx");
    expect(usagePage).toContain("const totalTokenValue = data.summary.realTotalTokens;");
    expect(usagePage).not.toContain("const requestTokenTotal = data.summary.inputTokens + data.summary.outputTokens;");
    expect(usagePage).toContain('Metric label="真实总 Token"');
    expect(source).toContain("function PortalQuickAskSettings");
    expect(source).toContain("function PortalMainAppSettings");
    expect(source).toContain("显示/隐藏主应用");
    expect(source).toContain("portal-child-actions");
    expect(source).not.toContain('contextItems={[');
    expect(source).not.toContain('{ label: "功能"');
    expect(source).not.toContain('eyebrow="Quick Ask"');
    expect(source).toContain("desktopApi.saveSettings");
    expect(desktopApi).toContain("usageDashboard(request");
    expect(desktopApi).toContain('invoke<UsageDashboardData>("usage_dashboard"');
    expect(desktopApi).toContain("usageSyncExternal()");
    expect(desktopApi).toContain('invoke<UsageSyncResult>("usage_sync_external"');
    expect(desktopApi).toContain("threadUnarchive(threadId: string)");
    expect(electronMain).toContain("CREATE TABLE IF NOT EXISTS external_usage_events");
    expect(electronMain).toContain("workspace_path TEXT");
    expect(electronMain).toContain("workspace_name TEXT");
    expect(electronMain).toContain('this.ensureColumn("external_usage_events", "workspace_path", "TEXT");');
    expect(electronMain).toContain('this.ensureColumn("external_usage_events", "workspace_name", "TEXT");');
    expect(electronMain).toContain("event.workspacePath ?? null");
    expect(electronMain).toContain("workspacePath: row.workspace_path");
    expect(electronMain).toContain("workspaceMatchesUsageEvent");
    expect(electronMain).toContain("CREATE TABLE IF NOT EXISTS external_usage_sync_state");
    expect(electronMain).toContain('case "usage_dashboard": return storage.usageDashboard(args.request);');
    expect(electronMain).toContain('case "usage_sync_external": return storage.syncExternalUsage();');
    expect(electronMain).toContain('case "thread_unarchive": return storage.unarchiveThread(args.threadId);');
    expect(electronMain).toContain("t.model AS turn_model");
    expect(electronMain).toContain("claudeCodeUsageEventsFromJsonl");
    expect(electronMain).toContain("codexUsageEventsFromJsonl");
    expect(source).not.toContain("defaultNewSessionProviderId");
    expect(source).not.toContain("defaultNewSessionModel");
  });
});
