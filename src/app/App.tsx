import { useEffect, useState } from "react";
import AgentPage from "../pages/AgentPage";
import { desktopApi } from "../services/desktopApi";
import type { ActivityItem, AppSettings } from "../types";
import type { ThemeMode } from "../main";

const defaultSettings: AppSettings = {
  gitCommand: "git",
};

interface AppProps {
  themeMode: ThemeMode;
  onToggleTheme: () => void;
}

export default function App({ themeMode, onToggleTheme }: AppProps) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isWindowFocused, setIsWindowFocused] = useState(() => {
    if (typeof document === "undefined" || typeof document.hasFocus !== "function") return true;
    return document.hasFocus();
  });

  useEffect(() => {
    void refreshSettings();
  }, []);

  useEffect(() => {
    const handleFocus = () => setIsWindowFocused(true);
    const handleBlur = () => setIsWindowFocused(false);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    setIsWindowFocused(document.hasFocus());

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  async function refreshSettings() {
    try {
      const next = await desktopApi.getSettings();
      setSettings(next);
    } catch (error) {
      console.error(error);
    }
  }

  function pushActivity(
    _title: string,
    _status: ActivityItem["status"] = "running",
    _detail?: string,
  ) {
    // The standalone activity rail was removed with the global shell.
  }

  function clearActivity() {
    // Kept for AgentPage compatibility after merging the shell navigation.
  }

  const shellClassName = [
    "app-shell",
    "is-agent-active",
    isWindowFocused ? "" : "is-window-inactive",
  ].filter(Boolean).join(" ");

  return (
    <div className={shellClassName}>
      <div className="app-titlebar" aria-hidden="true">
        <div className="app-traffic-lights-placeholder">
          <span />
          <span />
          <span />
        </div>
      </div>
      <div className="workspace is-agent-workspace">
        <main className="content-grid is-agent-grid">
          <section className="main-panel">
            <AgentPage
              settings={settings}
              themeMode={themeMode}
              pushActivity={pushActivity}
              clearActivity={clearActivity}
              onToggleTheme={onToggleTheme}
            />
          </section>
        </main>
      </div>
    </div>
  );
}
