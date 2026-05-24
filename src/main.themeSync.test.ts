import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("renderer theme synchronization", () => {
  it("keeps secondary windows such as Portal capsule in sync with theme changes", () => {
    const source = readProjectFile("src/main.tsx");

    expect(source).toContain('const THEME_STORAGE_KEY = "any-jumper-theme"');
    expect(source).toContain('window.addEventListener("storage", syncStoredTheme)');
    expect(source).toContain("event.key !== THEME_STORAGE_KEY");
    expect(source).toContain("setThemeMode(nextTheme)");
    expect(source).toContain('media?.addEventListener("change", syncSystemTheme)');
    expect(source).toContain("document.documentElement.dataset.theme = themeMode");
    expect(source).toContain("window.localStorage.setItem(THEME_STORAGE_KEY, themeMode)");
  });
});
