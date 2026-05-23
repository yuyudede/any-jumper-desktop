import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { routes } from "./routes";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("App navigation shell", () => {
  it("keeps only AI conversation and model configuration as navigation entries", () => {
    expect(routes.map((route) => route.key)).toEqual(["agent", "model"]);
    expect(routes.map((route) => route.label)).toEqual(["AI会话", "模型配置"]);
  });

  it("does not render the global top bar", () => {
    const source = readProjectFile("src/app/App.tsx");
    const agentSource = readProjectFile("src/pages/AgentPage.tsx");

    expect(source).not.toContain('className="top-bar"');
    expect(source).not.toContain('className="side-nav"');
    expect(source).not.toContain("<TagPage");
    expect(source).not.toContain("<ConfigPage");
    expect(source).not.toContain("<ReviewPage");
    expect(agentSource).toContain("<ModelPage");
  });

  it("does not reserve a layout row for a removed top bar", () => {
    const css = readProjectFile("src/styles/theme.css");
    const workspaceBlock = css.match(/\.workspace\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(workspaceBlock).toContain("grid-template-rows: minmax(0, 1fr);");
    expect(workspaceBlock).not.toContain("48px minmax(0, 1fr)");
  });

  it("integrates the native title bar into the app chrome", () => {
    const appSource = readProjectFile("src/app/App.tsx");
    const electronSource = readProjectFile("electron/main.ts");
    const css = readProjectFile("src/styles/theme.css");

    expect(electronSource).toContain('titleBarStyle: "hiddenInset"');
    expect(electronSource).toContain("trafficLightPosition");
    expect(appSource).toContain('className="app-titlebar"');
    expect(appSource).not.toContain("app-titlebar-brand");
    expect(appSource).not.toContain("Any Jumper Desktop");
    expect(css).toContain(".app-titlebar");
    expect(css).toContain("-webkit-app-region: drag");
    expect(css).toContain("--agent-sidebar-width");
    expect(css).toContain("--window-control-height");
    expect(css).toContain("--window-control-safe-width");
    expect(css).toContain("width: var(--window-control-safe-width);");
    expect(css).toContain(".agent-status-strip");
    expect(css).toContain("-webkit-app-region: no-drag");
  });

  it("shows an inactive traffic-light placeholder when the window loses focus", () => {
    const appSource = readProjectFile("src/app/App.tsx");
    const electronSource = readProjectFile("electron/main.ts");
    const css = readProjectFile("src/styles/theme.css");

    expect(electronSource).toContain("trafficLightPosition: { x: 20, y: 20 }");
    expect(css).toContain("--window-control-x: 20px;");
    expect(css).toContain("--window-control-y: 20px;");
    expect(css).toContain("--window-control-dot-size: 12px;");
    expect(css).toContain("--window-control-dot-gap: 8px;");
    expect(appSource).toContain("isWindowFocused");
    expect(appSource).toContain("is-window-inactive");
    expect(appSource).toContain("app-traffic-lights-placeholder");
    expect(appSource).toContain('window.addEventListener("blur"');
    expect(appSource).toContain('window.addEventListener("focus"');
    expect(css).toContain(".app-traffic-lights-placeholder");
    expect(css).toContain(".app-shell.is-window-inactive .app-traffic-lights-placeholder");
    const placeholderBlock = css.match(/\.app-traffic-lights-placeholder\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    expect(placeholderBlock).toContain("top: var(--window-control-y);");
    expect(placeholderBlock).toContain("left: var(--window-control-x);");
    expect(placeholderBlock).toContain("width: calc(var(--window-control-dot-size) * 3 + var(--window-control-dot-gap) * 2);");
    expect(placeholderBlock).toContain("height: var(--window-control-dot-size);");
    expect(placeholderBlock).toContain("gap: var(--window-control-dot-gap);");
    expect(placeholderBlock).toContain("background: transparent;");
    expect(placeholderBlock).toContain("box-shadow: none;");
    expect(placeholderBlock).not.toContain("border-radius: 999px;");
    const dotBlock = css.match(/\.app-traffic-lights-placeholder span\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    expect(dotBlock).toContain("width: var(--window-control-dot-size);");
    expect(dotBlock).toContain("height: var(--window-control-dot-size);");
    expect(dotBlock).toContain("flex: 0 0 var(--window-control-dot-size);");
    expect(css).toContain("background: var(--window-control-inactive-dot);");
    expect(dotBlock).toContain("box-shadow: none;");
  });

  it("keeps the agent sidebar and terminal toggles outside the macOS window controls", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");
    const headerActionsIndex = source.indexOf('className="agent-status-actions"');
    const sidebarToggleIndex = source.indexOf("agent-sidebar-toggle agent-side-control");
    const terminalToggleIndex = source.indexOf("agent-terminal-toggle agent-side-control");
    const themeToggleIndex = source.indexOf("agent-theme-toggle");
    const composerActionsIndex = source.indexOf('className="composer-left-actions"');

    expect(source).toContain("PanelLeftOpen");
    expect(source).toContain("PanelLeftClose");
    expect(source).toContain("PanelBottomOpen");
    expect(source).toContain("PanelBottomClose");
    expect(source).not.toContain("PanelRightOpen");
    expect(source).not.toContain("PanelRightClose");
    expect(source).toContain("aria-pressed={!sidebarCollapsed}");
    expect(source).toContain("aria-pressed={terminalVisible}");
    expect(source).not.toContain("aria-pressed={!inspectorCollapsed}");
    expect(source).not.toContain('className="agent-topbar"');
    expect(headerActionsIndex).toBeGreaterThan(-1);
    expect(sidebarToggleIndex).toBeGreaterThan(headerActionsIndex);
    expect(terminalToggleIndex).toBeGreaterThan(sidebarToggleIndex);
    expect(themeToggleIndex).toBeGreaterThan(terminalToggleIndex);
    expect(themeToggleIndex).toBeLessThan(composerActionsIndex);
    expect(css).toContain("--window-control-safe-width");
    expect(css).toContain("padding-left: calc(var(--window-control-safe-width) + 12px);");
    expect(css).not.toContain(".agent-topbar");
    expect(css).not.toContain("--agent-sidebar-toggle-offset");
  });

  it("places the agent bridge entry above project and conversation sections", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const bridgeIndex = source.indexOf("agent-bridge-entry");
    const projectIndex = source.indexOf('className="agent-sidebar-head"', bridgeIndex);
    const sessionListIndex = source.indexOf('className="codex-session-list"');

    expect(bridgeIndex).toBeGreaterThan(-1);
    expect(projectIndex).toBeGreaterThan(-1);
    expect(sessionListIndex).toBeGreaterThan(-1);
    expect(bridgeIndex).toBeLessThan(projectIndex);
  });

  it("renders sessions as nested rows inside a persistent multi-project tree", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).toContain("SIDEBAR_EXPANDED_WORKSPACES_STORAGE_KEY");
    expect(source).toContain("threadsByWorkspaceId");
    expect(source).toContain("expandedWorkspaceIds");
    expect(source).toContain("workspaces.map((workspace) => {");
    expect(source).toContain("const workspaceThreads = threadsByWorkspaceId[workspace.id] || [];");
    expect(source).toContain('className="codex-project-tree"');
    expect(source).toContain('className="codex-project-row"');
    expect(source).toContain('className="codex-project-sessions"');
    expect(source).toContain("codex-session-row is-nested");
    expect(source).toContain('className="codex-session-main"');
    expect(source).toContain('className="codex-session-action"');
    expect(source).toContain("removeThread(thread)");
    expect(css).toContain(".codex-project-tree");
    expect(css).toContain(".codex-project-sessions");
    expect(css).toContain(".codex-session-row.is-nested");
    expect(css).toContain(".codex-session-action");
  });

  it("loads session rows for workspaces restored as expanded", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");

    expect(source).toContain("loadRestoredExpandedWorkspaceThreads");
    expect(source).toContain("const restoredExpandedWorkspaceIds = workspaces");
    expect(source).toContain("expandedWorkspaceIds[workspace.id] === true");
    expect(source).toContain("workspace.id !== workspaceId");
    expect(source).toContain("!hasLoadedThreadsForWorkspace(threadsByWorkspaceId, workspace.id)");
    expect(source).toContain("void loadThreads(restoredWorkspaceId, { ensureSelection: false, createIfEmpty: false })");
  });

  it("keeps project as a collapsible section instead of a navigation entry", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).toContain("PROJECT_TREE_COLLAPSED_STORAGE_KEY");
    expect(source).toContain("projectTreeCollapsed");
    expect(source).toContain('className="agent-sidebar-head"');
    expect(source).toContain('className="agent-sidebar-head-toggle"');
    expect(source).toContain("aria-expanded={!projectTreeCollapsed}");
    expect(source).toContain("onClick={toggleProjectTreeCollapsed}");
    expect(source).toContain("{!projectTreeCollapsed ? (");
    expect(source).toContain("{activeWorkspace && !projectTreeCollapsed ? (");
    expect(source).not.toContain("codex-project-section-trigger");
    expect(source).not.toContain("agent-bridge-entry codex-project");
    expect(css).toContain(".agent-sidebar-head-toggle");
    expect(css).toContain(".agent-sidebar-head-chevron");
    expect(css).toContain('.agent-sidebar-head-toggle[aria-expanded="false"] .agent-sidebar-head-chevron');
  });

  it("keeps selection subtle: no project highlight and only a small session marker", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).not.toContain("codex-project-row ${workspace.id === workspaceId");
    expect(source).not.toContain("codex-session-row is-nested ${isActive");
    expect(source).not.toContain("codex-session-dot");
    expect(css).not.toContain(".codex-project-row.is-active");
    expect(css).toContain(".codex-session-row.is-active");
    expect(css).not.toContain(".codex-session-dot");
  });

  it("uses a rounded split-shell chrome for the agent workspace", () => {
    const electronSource = readProjectFile("electron/main.ts");
    const css = readProjectFile("src/styles/theme.css");

    expect(css).toContain("--app-chrome-bg: #e6e4e0;");
    expect(css).toContain("--agent-shell-gap: 8px;");
    expect(css).toContain("--agent-window-radius: 24px;");
    expect(css).toContain(".app-shell.is-agent-active");
    expect(css).toContain("padding: var(--agent-shell-gap);");
    expect(css).toContain("background: var(--app-chrome-bg);");
    expect(css).toContain("border-radius: var(--agent-window-radius);");
    expect(css).toContain("border-radius: var(--agent-panel-radius);");
    const workbenchBlock = css.match(/\.agent-workbench\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    expect(workbenchBlock).toContain("background: transparent;");
    const resizeHandleBlock = css.match(/\.resize-handle\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    expect(resizeHandleBlock).toContain("background: transparent;");
    expect(resizeHandleBlock).not.toContain("background: var(--agent-gutter);");
    expect(electronSource).toContain("frame: false");
    expect(electronSource).toContain("transparent: true");
    expect(electronSource).toContain('backgroundColor: "#00000000"');
    expect(electronSource).toContain("hasShadow: false");
    expect(css).toMatch(/html,\s*\nbody\s*\{[\s\S]*background:\s*transparent;/);
    expect(css).toContain("overflow: hidden;");
    expect(css).toContain("app-shell");
    expect(css).toContain("box-shadow: inset 0 0 0 1px");
  });

  it("shows agent bridge in the main conversation area instead of the inspector tabs", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");

    expect(source).toContain("activeMainView");
    expect(source).toContain("<BridgeMainPanel");
    expect(source).toContain("<PluginPage");
    expect(source).not.toContain('TabsTrigger value="bridge"');
  });

  it("places Plugin as its own entry below Model-Config", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const modelIndex = source.indexOf("<span>Model-Config</span>");
    const pluginIndex = source.indexOf("<span>Plugin</span>");
    const projectIndex = source.indexOf('className="agent-sidebar-head"', pluginIndex);

    expect(modelIndex).toBeGreaterThan(-1);
    expect(pluginIndex).toBeGreaterThan(modelIndex);
    expect(projectIndex).toBeGreaterThan(pluginIndex);
    expect(source).toContain('activeMainView === "plugin"');
  });

  it("removes the inspector rail from all agent views", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).not.toContain("inspectorVisible");
    expect(source).not.toContain("inspectorCollapsed");
    expect(source).not.toContain("<AgentInspector");
    expect(source).not.toContain("agent-inspector-resizer");
    expect(source).not.toContain('activeMainView !== "chat" ? null');
    expect(css).not.toContain(".agent-inspector");
    expect(css).not.toContain("var(--agent-inspector-width");
  });

  it("does not show an inspector toggle for chat sessions", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");

    expect(source).not.toContain("agent-inspector-toggle agent-side-control");
    expect(source).not.toContain("PanelRightOpen");
    expect(source).not.toContain("PanelRightClose");
  });
});
