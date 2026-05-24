import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("Portal shortcut wiring", () => {
  it("registers a global shortcut and opens a dedicated Portal capsule window", () => {
    const source = readProjectFile("electron/main.ts");
    const preload = readProjectFile("electron/preload.ts");
    const appSource = readProjectFile("src/app/App.tsx");

    expect(source).toContain("globalShortcut");
    expect(source).toContain("requestSingleInstanceLock");
    expect(source).toContain("gotSingleInstanceLock");
    expect(source).toContain('app.on("second-instance"');
    expect(source).toContain("focusMainWindow");
    expect(source).toContain("activatingPortalWindow");
    expect(source).toContain("shouldSkipMainActivation");
    expect(source).toContain("if (shouldSkipMainActivation()) return;");
    expect(source).toContain("registerPortalShortcut");
    expect(source).toContain("mainWindowShortcut");
    expect(source).toContain("registeredMainWindowShortcut");
    expect(source).toContain("registerMainWindowShortcut");
    expect(source).toContain("registerGlobalShortcuts");
    expect(source).toContain("toggleMainWindow");
    expect(source).toContain("return registerGlobalShortcuts()");
    expect(source).toContain('win.on("minimize" as any, (event: { preventDefault(): void }) => {');
    expect(source).toContain("event.preventDefault();");
    expect(source).toContain("win.hide();");
    expect(source).toContain("createPortalWindow");
    expect(source).toContain("if (portalWindow && !portalWindow.isDestroyed()) return portalWindow;");
    expect(source).toContain('query.set("portal", "capsule")');
    expect(source).toContain("mainWindows");
    expect(source).toContain("hasShadow: false");
    expect(source).toContain("resizable: true");
    expect(source).toContain("findMainWindow");
    expect(source).toContain("portal_window_set_always_on_top");
    expect(source).toContain("portalWindowPinned");
    expect(source).toContain("applyPortalWindowPin");
    expect(source).toContain('setAlwaysOnTop(pinned, pinned ? "screen-saver" : "normal")');
    expect(source).toContain("setVisibleOnAllWorkspaces(pinned, { visibleOnFullScreen: pinned })");
    expect(source).toContain("moveTop()");
    expect(source).toContain("setAlwaysOnTop");
    expect(source).toContain("portal_shortcut_reregister");
    expect(preload).toContain("portalInvoke");
    expect(appSource).toContain("<PortalCapsule");
  });
});
