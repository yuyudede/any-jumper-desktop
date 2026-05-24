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

    expect(source).toContain('title="Portal"');
    expect(source).toContain("portalShortcut");
    expect(source).toContain("portalDefaultWorkspaceId");
    expect(source).toContain("portalDefaultProviderId");
    expect(source).toContain("portalDefaultModel");
    expect(source).toContain("portalReasoningEffort");
    expect(source).toContain("mainWindowShortcut");
    expect(source).toContain('type PortalSubTab = "quickAsk" | "mainApp";');
    expect(source).toContain("recordingShortcutTarget");
    expect(source).toContain("开始录入");
    expect(source).toContain("取消录入");
    expect(source).toContain("快捷键注册失败");
    expect(source).toContain("portalSubTab");
    expect(source).toContain("portal-sub-tabs");
    expect(source).toContain('label: "Main App"');
    expect(source).toContain("function PortalQuickAskSettings");
    expect(source).toContain("function PortalMainAppSettings");
    expect(source).toContain("显示/隐藏主应用");
    expect(source).toContain("portal-child-actions");
    expect(source).not.toContain('contextItems={[');
    expect(source).not.toContain('{ label: "功能"');
    expect(source).not.toContain('eyebrow="Quick Ask"');
    expect(source).toContain("desktopApi.saveSettings");
    expect(source).not.toContain("defaultNewSessionProviderId");
    expect(source).not.toContain("defaultNewSessionModel");
  });
});
