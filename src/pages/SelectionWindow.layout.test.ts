import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("SelectionWindow layout", () => {
  it("routes a standalone Selection window and keeps the two-phase UI", () => {
    const appSource = readProjectFile("src/app/App.tsx");
    const source = readProjectFile("src/pages/SelectionWindow.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(appSource).toContain('get("selection") === "window"');
    expect(appSource).toContain("<SelectionWindow");
    expect(source).toContain("selection-liquid-bar");
    expect(source).toContain("selection-result-panel");
    expect(source).toContain("selectionRunAction");
    expect(source).toContain("onSelectionEvent");
    expect(source).toContain("let selectionSubscriptionDisposed = false");
    expect(source).toContain("nextUnsubscribe()");
    expect(source).toContain("wheel");
    expect(source).toContain("ArrowRight");
    expect(source).toContain("ArrowLeft");
    expect(source).toContain("prefers-reduced-motion");
    expect(css).toContain(".selection-window-root");
    expect(css).toContain("backdrop-filter");
    expect(css).toContain(".selection-liquid-bar");
    expect(css).toContain(".selection-result-panel");
    expect(css).toContain("selection-panel-open");
    expect(css).toContain("selection-bar-in");
    expect(css).toContain("saturate(1.8)");
    expect(css).toContain("color-mix");
  });
});
