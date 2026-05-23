import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("MarkdownRenderer mermaid theme", () => {
  it("gives Mermaid an explicit dark-aware palette", () => {
    const source = readProjectFile("src/components/MarkdownRenderer.tsx");

    expect(source).toContain("darkMode: dark ? \"true\" : \"false\"");
    expect(source).toContain("textColor: text");
    expect(source).toContain("primaryTextColor: text");
    expect(source).toContain("lineColor: edge");
    expect(source).toContain("arrowheadColor: edge");
  });

  it("overrides Mermaid generated edge and marker strokes in dark mode", () => {
    const css = readProjectFile("src/styles/theme.css");

    expect(css).toContain('[data-theme="dark"] .mermaid-block-svg svg .flowchart-link');
    expect(css).toContain('[data-theme="dark"] .mermaid-block-svg svg marker path');
    expect(css).toContain("stroke: var(--mermaid-edge, #848d97) !important;");
    expect(css).toContain("fill: var(--mermaid-edge, #848d97) !important;");
  });
});
