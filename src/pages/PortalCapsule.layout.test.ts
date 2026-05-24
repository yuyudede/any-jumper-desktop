import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("PortalCapsule conversation layout", () => {
  it("keeps a compact multi-turn history and exposes a clear action", () => {
    const source = readProjectFile("src/pages/PortalCapsule.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).toContain("streamingAnswer");
    expect(source).toContain("visibleConversationItems");
    expect(source).toContain("clearConversation");
    expect(source).toContain("desktopApi.threadArchive");
    expect(source).toContain("historyRef");
    expect(source).toContain("scrollTo({");
    expect(source).toContain('behavior: "smooth"');
    expect(source).toContain("focusInputSoon");
    expect(source).toContain('window.addEventListener("keydown", onKeyDown, true)');
    expect(source).toContain('window.removeEventListener("keydown", onKeyDown, true)');
    expect(source).toContain("event.stopPropagation();");
    expect(source).toContain("portal-capsule-history");
    expect(source).toContain("portal-capsule-message");
    expect(source).toContain("Clear");
    expect(source).not.toContain("portal-capsule-meta");
    expect(source).not.toContain("portal-capsule-shortcut");
    expect(source.indexOf('className="portal-capsule-history"')).toBeLessThan(source.indexOf('className="portal-capsule-input-row"'));
    expect(source).not.toContain("portal-capsule-message-role");
    expect(source).not.toContain('>You<');
    expect(source).not.toContain('>AI<');
    expect(source).not.toContain("latestAssistantAnswer");

    const inputBlock = css.match(/\.portal-capsule-input\.shadcn-textarea\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const rootBlock = css.match(/\.portal-capsule-root\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const capsuleBlock = css.match(/\.portal-capsule\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const historyBlock = css.match(/\.portal-capsule-history\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const messageBlock = css.match(/\.portal-capsule-message\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(rootBlock).toContain("box-sizing: border-box;");
    expect(rootBlock).toContain("padding: 0;");
    expect(rootBlock).not.toContain("padding: 12px;");
    expect(capsuleBlock).toContain("width: 100%;");
    expect(capsuleBlock).toContain("height: 100%;");
    expect(capsuleBlock).toContain("box-shadow: none;");
    expect(capsuleBlock).not.toContain("width: min(640px");
    expect(capsuleBlock).not.toContain("0 22px 60px");
    expect(inputBlock).toContain("font-size: 13px;");
    expect(inputBlock).toContain("min-height: 44px;");
    expect(historyBlock).toContain("flex: 1 1 auto;");
    expect(historyBlock).toContain("min-height: 0;");
    expect(historyBlock).toContain("overflow: auto;");
    expect(css).toContain(".portal-capsule-input-row {\n  gap: 7px;\n  margin-top: auto;");
    expect(messageBlock).toContain("font-size: 12px;");
    expect(css).not.toContain(".portal-capsule-message-role");
    expect(css).not.toContain(".portal-capsule-meta");
    expect(css).not.toContain(".portal-capsule-shortcut");
    expect(source).toContain("disabled={loading}");
    expect(source).not.toContain("disabled={loading || busy}");
  });
});
