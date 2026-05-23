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

  useEffect(() => {
    void refreshSettings();
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

  return (
    <div className="app-shell is-agent-active">
      <div className="app-titlebar" aria-hidden="true" />
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
