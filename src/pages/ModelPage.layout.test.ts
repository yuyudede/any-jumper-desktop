import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("ModelPage settings layout", () => {
  it("uses compact settings-page framing instead of a marketing hero", () => {
    const source = readProjectFile("src/pages/ModelPage.tsx");

    expect(source).toContain('className="is-settings-page"');
    expect(source).toContain('eyebrow="Provider 管理"');
    expect(source).toContain('title="模型配置"');
    expect(source).not.toContain('title="模型 Provider 工作台"');
    expect(source).not.toContain('className="workbench-hero-actions"');
  });

  it("caps the settings title and aligns actions with the header", () => {
    const css = readProjectFile("src/styles/theme.css");
    const titleBlock =
      css.match(/\.workbench-page\.is-settings-page\s+\.workbench-hero-copy h2\s*\{(?<body>[^}]*)\}/)
        ?.groups?.body ?? "";
    const headerBlock =
      css.match(/\.workbench-page\.is-settings-page\s+\.workbench-hero\s*\{(?<body>[^}]*)\}/)
        ?.groups?.body ?? "";

    expect(titleBlock).toContain("font-size: 24px;");
    expect(titleBlock).toContain("line-height: 1.24;");
    expect(titleBlock).not.toContain("clamp(");
    expect(headerBlock).toContain("align-items: flex-end;");
  });

  it("keeps plugin management out of ModelPage and exposes new-session defaults", () => {
    const source = readProjectFile("src/pages/ModelPage.tsx");

    expect(source).toContain('title="新会话默认模型"');
    expect(source).toContain("defaultNewSessionProviderId");
    expect(source).toContain("defaultNewSessionModel");
    expect(source).toContain("desktopApi.saveSettings");
    expect(source).not.toContain("renderPlugins");
    expect(source).not.toContain('TabsTrigger value="market"');
    expect(source).not.toContain("desktopApi.pluginList");
  });
});
