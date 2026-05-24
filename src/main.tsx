import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import "./styles/theme.css";
import { notifyThemeChange } from "./components/MarkdownRenderer";

export type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "any-jumper-theme";

function normalizeTheme(value: string | null): ThemeMode | undefined {
  return value === "light" || value === "dark" ? value : undefined;
}

function systemTheme(): ThemeMode {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function preferredTheme(): ThemeMode {
  return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY)) ?? systemTheme();
}

function Root() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => preferredTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    notifyThemeChange();
  }, [themeMode]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const syncStoredTheme = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const nextTheme = normalizeTheme(event.newValue) ?? systemTheme();
      setThemeMode(nextTheme);
    };
    const syncSystemTheme = () => {
      if (normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY))) return;
      setThemeMode(systemTheme());
    };

    window.addEventListener("storage", syncStoredTheme);
    media?.addEventListener("change", syncSystemTheme);
    return () => {
      window.removeEventListener("storage", syncStoredTheme);
      media?.removeEventListener("change", syncSystemTheme);
    };
  }, []);

  return (
    <App
      themeMode={themeMode}
      onToggleTheme={() =>
        setThemeMode((value) => (value === "dark" ? "light" : "dark"))
      }
    />
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
