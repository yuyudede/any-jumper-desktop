import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import "./styles/theme.css";
import { notifyThemeChange } from "./components/MarkdownRenderer";

export type ThemeMode = "light" | "dark";

function preferredTheme(): ThemeMode {
  const saved = window.localStorage.getItem("any-jumper-theme");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function Root() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => preferredTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    window.localStorage.setItem("any-jumper-theme", themeMode);
    notifyThemeChange();
  }, [themeMode]);

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
