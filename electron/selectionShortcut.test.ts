import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("Selection shortcut wiring", () => {
  it("registers a global shortcut and opens a dedicated Selection window", () => {
    const source = readProjectFile("electron/main.ts");
    const preload = readProjectFile("electron/preload.ts");

    expect(source).toContain("selectionWindow");
    expect(source).toContain("registeredSelectionShortcut");
    expect(source).toContain("selectionShortcut()");
    expect(source).toContain("registerSelectionShortcut");
    expect(source).toContain("showSelectionWindow");
    expect(source).toContain("createSelectionWindow");
    expect(source).toContain('query.set("selection", "window")');
    expect(source).toContain("selection_window_show");
    expect(source).toContain("selection_window_hide");
    expect(source).toContain("selection_shortcut_reregister");
    expect(source).toContain("readSelectedText");
    expect(source).toContain("clipboard.readText");
    expect(source).toContain("globalShortcut.register(shortcut");
    expect(source).toContain("selection-event");
    expect(preload).toContain("onSelectionEvent");
  });
});
