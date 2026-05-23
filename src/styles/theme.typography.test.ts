import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readTheme() {
  return readFileSync(resolve(projectRoot, "src/styles/theme.css"), "utf8");
}

describe("theme typography", () => {
  it("uses one coordinated font system across chrome, navigation, and content", () => {
    const css = readTheme();

    expect(css).toContain("--font-sans:");
    expect(css).toContain(
      '--font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;',
    );
    expect(css).toContain("--font-display:");
    expect(css).toContain(
      '--font-display: "SF Pro Display", -apple-system, BlinkMacSystemFont, "PingFang SC", var(--font-sans);',
    );
    expect(css).toContain("--font-mono:");
    expect(css).toContain("--font-weight-strong:");
    expect(css).toContain("--font-weight-ui: 500;");
    expect(css).toContain("--font-weight-strong: 600;");
    expect(css).toContain("--font-weight-heading: 600;");
    expect(css).toContain("font-family: var(--font-sans);");
    expect(css).toContain("font-feature-settings:");
    expect(css).toContain("font-family: var(--font-display);");
    expect(css).toContain(".codex-project-select span,\n.codex-workspace-row-name span");
    expect(css).toContain("font-weight: var(--font-weight-strong);");
    expect(css).toContain(
      ".codex-session-title {\n  color: var(--muted);\n  font-family: var(--font-sans);\n  font-size: 12.5px;\n  font-weight: var(--font-weight-ui);",
    );
  });

  it("keeps assistant markdown output readable and close to native Codex typography", () => {
    const css = readTheme();

    expect(css).toContain(
      ".markdown-body {\n  color: var(--text);\n  font-family: var(--font-sans);\n  font-size: 14px;",
    );
    expect(css).toContain("font-weight: 420;");
    expect(css).toContain("line-height: 1.68;");
    expect(css).not.toContain("max-width: min(840px, 100%);");
    expect(css).toContain(".markdown-body strong {\n  font-weight: 600;\n}");
    expect(css).toContain(".markdown-body code {\n  font-family: var(--font-mono);\n  font-size: 12.5px;");
  });
});
