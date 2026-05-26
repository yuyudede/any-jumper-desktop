export type ResolvedThemeMode = "light" | "dark";

export const SHIKI_LIGHT_THEME = "github-light-high-contrast";
export const SHIKI_DARK_THEME = "github-dark";

export function resolveThemeMode(
  explicitTheme: string | null | undefined,
  systemPrefersDark: boolean,
): ResolvedThemeMode {
  if (explicitTheme === "light" || explicitTheme === "dark") {
    return explicitTheme;
  }
  return systemPrefersDark ? "dark" : "light";
}

export function currentThemeMode(): ResolvedThemeMode {
  return resolveThemeMode(
    document.documentElement.dataset.theme,
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );
}

export function isCurrentThemeDark() {
  return currentThemeMode() === "dark";
}

export function shikiThemeForMode(mode: ResolvedThemeMode) {
  return mode === "dark" ? SHIKI_DARK_THEME : SHIKI_LIGHT_THEME;
}

export function currentShikiTheme() {
  return shikiThemeForMode(currentThemeMode());
}
