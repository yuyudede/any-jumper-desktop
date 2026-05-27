import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("Electron external link handling", () => {
  it("routes HTTP links opened from app windows to the system browser", () => {
    const source = readProjectFile("electron/main.ts");

    expect(source).toContain("function openExternalUrl(url: unknown)");
    expect(source).toContain("shell.openExternal(parsed.href)");
    expect(source).toContain('parsed.protocol === "http:" || parsed.protocol === "https:"');
    expect(source).toContain("win.webContents.setWindowOpenHandler");
    expect(source).toContain('win.webContents.on("will-navigate"');
  });
});
