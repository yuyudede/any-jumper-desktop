import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("AgentPage transcript message layout", () => {
  it("does not render hover metadata bubbles for transcript messages", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");

    expect(source).not.toContain('className="message-meta"');
  });

  it("does not reveal transcript metadata on hover or focus", () => {
    const css = readProjectFile("src/styles/theme.css");

    expect(css).not.toMatch(/\.message(?::hover|:focus-within)\s+\.message-meta/);
  });

  it("keeps assistant messages on a stable shared content track", () => {
    const css = readProjectFile("src/styles/theme.css");
    const assistantBlock = css.match(/\.message-assistant,\s*\n\.message-system\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(assistantBlock).toContain("width: 100%;");
    expect(assistantBlock).toContain("max-width: min(920px, 100%);");
  });

  it("lets short user message bubbles shrink to their content", () => {
    const css = readProjectFile("src/styles/theme.css");
    const userBlock = css.match(/\.message-user\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(userBlock).toContain("width: fit-content;");
    expect(userBlock).toContain("max-width: min(720px, 82%);");
  });

  it("lets slash command suggestions escape the composer box", () => {
    const css = readProjectFile("src/styles/theme.css");
    const composerBoxBlock = css.match(/(?:^|\n)\.composer-box\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const slashPopoverBlock = css.match(/(?:^|\n)\.slash-command-popover\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const slashItemBlock = css.match(/(?:^|\n)\.slash-command-item\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(composerBoxBlock).toContain("overflow: visible;");
    expect(slashPopoverBlock).toContain("position: absolute;");
    expect(slashPopoverBlock).toContain("bottom: calc(100% + 8px);");
    expect(slashPopoverBlock).toContain("overflow-y: auto;");
    expect(slashItemBlock).toContain("flex: 0 0 auto;");
  });

  it("removes the native rectangular focus outline from the rich composer editor", () => {
    const css = readProjectFile("src/styles/theme.css");
    const richComposerBlock = css.match(/(?:^|\n)\.composer \.rich-composer-editor\.ProseMirror\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";
    const richComposerFocusBlock = css.match(/(?:^|\n)\.composer \.rich-composer-editor\.ProseMirror:focus(?:,\s*\n\.composer \.rich-composer-editor\.ProseMirror:focus-visible)?\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";

    expect(css).toContain(".composer .rich-composer-editor .ProseMirror");
    expect(richComposerBlock).toContain("outline: none;");
    expect(richComposerFocusBlock).toContain("outline: none;");
  });

  it("keeps the rich composer placeholder visually quiet", () => {
    const css = readProjectFile("src/styles/theme.css");
    const placeholderBlock = css.match(/(?:^|\n)\.composer \.rich-composer-editor\.ProseMirror p\.is-editor-empty:first-child::before\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";

    expect(css).toContain("--composer-placeholder:");
    expect(placeholderBlock).toContain("color: var(--composer-placeholder);");
    expect(placeholderBlock).toContain("font-weight: var(--font-weight-regular);");
    expect(placeholderBlock).not.toContain("var(--text-muted)");
  });

  it("gives the scroll minimap popover a translucent neutral macOS glass treatment", () => {
    const css = readProjectFile("src/styles/theme.css");
    const panelBlock = css.match(/(?:^|\n)\.scroll-minimap-panel\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";
    const panelBeforeBlock = css.match(/(?:^|\n)\.scroll-minimap-panel::before\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";

    expect(css).toContain("--scroll-minimap-glass-bg:");
    expect(css).toContain("--scroll-minimap-glass-border:");
    expect(css).toContain("rgba(255, 255, 255, 0.42)");
    expect(css).toContain("rgba(242, 246, 250, 0.31)");
    expect(css).toContain("rgba(190, 207, 222, 0.07)");
    expect(css).not.toContain("rgba(160, 168, 172, 0.58)");
    expect(css).not.toContain("rgba(132, 140, 145, 0.50)");
    expect(css).not.toContain("rgba(106, 146, 178, 0.82)");
    expect(css).not.toContain("rgba(65, 105, 136, 0.76)");
    expect(panelBlock).toContain("background: var(--scroll-minimap-glass-bg);");
    expect(panelBlock).toContain("backdrop-filter: blur(26px) saturate(150%) contrast(104%);");
    expect(panelBlock).toContain("border-radius: 22px;");
    expect(panelBlock).toContain("border: 1px solid var(--scroll-minimap-glass-border);");
    expect(panelBlock).toContain("box-shadow:");
    expect(panelBlock).toContain("overflow: hidden;");
    expect(panelBeforeBlock).toContain("background:");
    expect(panelBeforeBlock).toContain("box-shadow: inset 0 1px 0 var(--scroll-minimap-glass-inner);");
    expect(css).not.toContain(".scroll-minimap-panel::after");
    expect(css).not.toContain("linear-gradient(120deg");
    expect(css).not.toContain("linear-gradient(300deg");
  });

  it("keeps keyboard-selected slash command suggestions scrolled into view", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");

    expect(source).toContain("slashSuggestionItemRefs");
    expect(source).toContain("scrollIntoView({ block: \"nearest\"");
  });

  it("uses Tab to complete a slash skill without submitting it", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");

    expect(source).toContain("completeSuggestion(suggestions[selectedSuggestionIndex].command);");
    expect(source).toContain("setComposer(`/${cmd.trigger} `);");
    expect(source).toMatch(/event\.key === "Tab"[\s\S]*completeSuggestion/);
    expect(source).toMatch(/event\.key === "Enter"[\s\S]*applySuggestion/);
  });

  it("uses a balanced inline turn trace panel instead of a static heading", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).toContain("<TurnTracePanel");
    expect(source).toContain('aria-label="Turn trace"');
    expect(source).toContain("turn-trace-toggle");
    expect(source).toContain("Trace");
    expect(source).toContain("进度");
    expect(source).toContain("工具调用");
    expect(source).toContain("TraceTokenUsage");
    expect(source).not.toContain('variant="expanded"');
    expect(source).toContain("reasoning");
    expect(css).toContain(".turn-trace-summary");
    expect(css).toContain(".turn-trace-card");
    expect(css).toContain("max-height: min(360px, 55vh)");
    expect(css).toContain(".turn-trace-stream");
    expect(css).toContain(".turn-trace-meta-row");
    expect(css).toContain(".turn-trace-thought-text");
    expect(css).toContain(".turn-trace-tool-details");
    expect(source).not.toContain("turn-trace-current");
    expect(css).not.toContain(".turn-trace-current");
    expect(source).not.toContain("<span>时间线</span>");
    expect(css).not.toContain(".turn-trace-tokens");
    expect(source).not.toContain("Current model step");
    expect(source).not.toContain("Process note");
    expect(source).not.toContain("Model call");
    expect(css).not.toContain(".thinking-trace-title");
    expect(css).not.toMatch(/\.message\.is-empty\.message-status-running::after/);
  });

  it("keeps token usage visible in the trace header", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");
    const summaryBlock = css.match(/\.turn-trace-summary\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const tokenBlock = css.match(/\.turn-trace-toggle-tokens\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(source).toContain("<TraceTokenUsage tokenUsage={tokenUsage} />");
    expect(summaryBlock).toContain("flex: 1 1 auto;");
    expect(tokenBlock).toContain("flex-shrink: 0;");
    expect(tokenBlock).toContain("white-space: nowrap;");
    expect(tokenBlock).not.toContain("max-width:");
  });

  it("shows a live processing duration with a breathing trace header while a turn runs", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).toContain('import { turnTraceHeadline } from "../utils/turnTraceDisplay"');
    expect(source).toContain("const [traceNow, setTraceNow] = useState(() => Date.now())");
    expect(source).toContain("setInterval(() => setTraceNow(Date.now()), 1000)");
    expect(source).toContain("turnTraceHeadline(section, traceNow)");
    expect(source).toContain('section.status === "running" ? "is-live" : ""');
    expect(css).toContain("@keyframes turn-trace-breathe");
    expect(css).toContain(".turn-trace-heading.is-live");
    expect(css).toContain("animation: turn-trace-breathe");
  });

  it("restores token usage from persisted turns when reopening a thread", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");

    expect(source).toContain("tokenUsageByTurnFromDetail(next)");
    expect(source).toContain("setTokenUsageByTurn(tokenUsageByTurnFromDetail(next));");
    expect(source).toContain("function tokenUsageByTurnFromDetail(detail?: ThreadDetail)");
  });

  it("keeps routine running turn traces collapsed unless they need attention", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");

    expect(source).toContain("defaultTurnTraceExpanded(modelProcessSection, approvalCards)");
    expect(source).toContain("current[section.turnId] ?? defaultTurnTraceExpanded(section, approvals)");
    expect(source).toContain('return section.status === "error" || approvals.length > 0');
  });

  it("uses shadcn-style local primitives for the agent workbench", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const appSource = readProjectFile("src/app/App.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).not.toMatch(/from\s+["']antd["']/);
    expect(source).not.toMatch(/from\s+["']@ant-design\/icons["']/);
    expect(appSource).not.toMatch(/from\s+["']antd["']/);
    expect(source).toContain('data-ui="shadcn-agent-shell"');
    expect(source).toContain("<AgentEmptyState");
    expect(source).not.toContain("<AgentInspector");
    expect(source).toContain("../components/ui/button");
    expect(css).toContain(".shadcn-agent-shell");
    expect(css).toContain(".agent-empty-state");
    expect(css).not.toContain(".agent-inspector-panel");
  });

  it("does not show the execution steps summary in the flow inspector", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");

    expect(source).not.toContain('title="执行步骤"');
    expect(source).not.toContain('className="task-list"');
  });

  it("uses a rounded split-shell chrome for the agent workspace", () => {
    const css = readProjectFile("src/styles/theme.css");
    const workbenchBlock = css.match(/\.agent-workbench\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const shellBlock = css.match(/\.shadcn-agent-shell\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const mainPanelBlock = css.match(/\.content-grid\.is-agent-grid\s+\.main-panel\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(workbenchBlock).not.toContain("border-radius");
    expect(workbenchBlock).toContain("background: var(--panel);");
    expect(workbenchBlock).not.toContain("border:");
    expect(workbenchBlock).not.toContain("box-shadow");
    expect(mainPanelBlock).toContain("padding: 0;");
  });

  it("gives the empty chat home a restrained background with purposeful motion", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");
    const mainBeforeBlock = css.match(/\.agent-main::before\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const mainAfterBlock = css.match(/\.agent-main::after\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const reducedMotionBlock = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));

    expect(source).toMatch(/Conversation[\s\S]*is-empty-home/);
    expect(css).toContain(".agent-main::before");
    expect(css).toContain(".agent-main::after");
    expect(css).toContain(".transcript.is-empty-home");
    expect(css).toContain(".agent-empty-state::before");
    expect(css).toContain("@keyframes agent-empty-rise");
    expect(css).toContain("@keyframes agent-empty-icon-breathe");
    expect(css).toContain("--agent-empty-action-delay");
    expect(css).toContain("animation: agent-empty-rise");
    expect(css).toContain("animation: agent-empty-icon-breathe");
    expect(css).not.toContain("@keyframes agent-bg-drift");
    expect(mainBeforeBlock).not.toContain("animation:");
    expect(mainAfterBlock).not.toContain("animation:");
    expect(reducedMotionBlock).toContain(".agent-empty-state-icon");
    expect(reducedMotionBlock).toContain("animation: none !important;");
  });

  it("keeps the primary empty-state action legible on the soft home background", () => {
    const css = readProjectFile("src/styles/theme.css");

    expect(css).toContain(".agent-empty-state-actions .shadcn-button-default");
    expect(css).toContain("color: var(--panel);");
  });

  it("replaces the inspector rail with a file panel toggle for chat sessions", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).not.toContain("agent-inspector-resizer");
    expect(source).not.toContain("agent-inspector-toggle");
    expect(source).toContain("agent-right-panel-toggle agent-side-control");
    expect(source).toContain("PanelRightOpen");
    expect(source).toContain("PanelRightClose");
    expect(css).not.toContain(".agent-inspector");
    expect(css).not.toContain(".agent-inspector-resizer");
  });

  it("does not duplicate the right panel collapse button inside the panel chrome", () => {
    const panelSource = readProjectFile("src/components/RightPanel.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(panelSource).not.toContain("agent-right-panel-close");
    expect(panelSource).not.toContain("PanelRightClose");
    expect(css).not.toContain(".agent-right-panel-close");
  });

  it("keeps the status header controls as a quiet compact toolbar without theme switching", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");
    const actionsBlocks = Array.from(css.matchAll(/(?:^|\n)\.agent-status-actions\s*\{(?<body>[^}]*)\}/g));
    const actionsBlock = actionsBlocks.find((match) => match.groups?.body.includes("flex: 0 0 auto;"))
      ?.groups?.body ?? "";
    const buttonBlock = css.match(/(?:^|\n)\.agent-header-action\.shadcn-button\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";
    const selectedBlock = css.match(/(?:^|\n)\.agent-header-action\.shadcn-button(?:\.is-active|\.is-collapsed)[\s\S]*?\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";

    expect(source).toContain("agent-header-action agent-sidebar-toggle");
    expect(source).toContain("agent-header-action agent-terminal-toggle");
    expect(source).toContain("agent-header-action agent-right-panel-toggle");
    expect(source).not.toContain("agent-header-action agent-theme-toggle");
    expect(actionsBlock).toContain("gap: 2px;");
    expect(actionsBlock).toContain("padding: 3px;");
    expect(actionsBlock).toContain("border-radius: 13px;");
    expect(actionsBlock).toContain("background: color-mix(in srgb, var(--surface-glass-strong) 34%, transparent);");
    expect(actionsBlock).toContain("backdrop-filter: blur(18px) saturate(150%);");
    expect(actionsBlock).toContain("box-shadow: inset 0 1px 0 color-mix(in srgb, var(--panel) 30%, transparent);");
    expect(buttonBlock).toContain("width: 30px;");
    expect(buttonBlock).toContain("height: 30px;");
    expect(buttonBlock).toContain("border-radius: 9px;");
    expect(buttonBlock).toContain("background: transparent;");
    expect(buttonBlock).toContain("box-shadow: none;");
    expect(css).not.toContain(".agent-theme-toggle.agent-header-action::before");
    expect(selectedBlock).toContain("background: color-mix(in srgb, var(--panel-soft) 58%, transparent);");
    expect(selectedBlock).toContain("box-shadow: inset 0 1px 0 color-mix(in srgb, var(--panel) 34%, transparent);");
  });

  it("places theme switching in the lower-left sidebar area", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");
    const footBlock = css.match(/(?:^|\n)\.agent-sidebar-foot\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const footLabelBlock = css.match(/(?:^|\n)\.agent-sidebar-foot-label\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const footPathBlock = css.match(/(?:^|\n)\.agent-sidebar-foot-path\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const footCopyBlock = css.match(/(?:^|\n)\.agent-sidebar-foot-copy\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const themeButtonBlock = css.match(/(?:^|\n)\.agent-sidebar-theme-toggle\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const cornerButtonBlock = css.match(/(?:^|\n)\.agent-corner-theme-toggle\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const compactMedia = css.match(/@media\s*\(max-width:\s*1180px\)\s*\{(?<body>[\s\S]*?)@media\s*\(max-width:\s*760px\)/)
      ?.groups?.body ?? "";
    const compactCornerButtonBlock = compactMedia.match(/\.agent-corner-theme-toggle\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";

    expect(source).toContain("agent-sidebar-foot-label");
    expect(source).toContain("agent-sidebar-foot-path");
    expect(source).toContain("agent-sidebar-theme-toggle");
    expect(source).not.toContain("agent-mini-rail-theme-toggle");
    expect(source).toContain("agent-corner-theme-toggle");
    expect(source).toContain('aria-pressed={themeMode === "dark"}');
    expect(source.indexOf("agent-sidebar-theme-toggle")).toBeLessThan(source.indexOf("agent-sidebar-foot-copy"));
    expect(source).not.toContain('<span>{themeMode === "dark" ? "浅色" : "深色"}</span>');
    expect(footBlock).toContain("margin-top: auto;");
    expect(footBlock).toContain("display: grid;");
    expect(footBlock).toContain("grid-template-columns: minmax(0, 1fr) 24px;");
    expect(footBlock).toContain("grid-template-rows: 24px 24px;");
    expect(footLabelBlock).toContain("display: inline-flex;");
    expect(footLabelBlock).toContain("min-width: 0;");
    expect(footPathBlock).toContain("grid-column: 1;");
    expect(footPathBlock).toContain("grid-row: 2;");
    expect(footCopyBlock).toContain("grid-column: 2;");
    expect(footCopyBlock).toContain("grid-row: 2;");
    expect(themeButtonBlock).toContain("width: 24px;");
    expect(themeButtonBlock).toContain("height: 24px;");
    expect(themeButtonBlock).toContain("grid-column: 2;");
    expect(themeButtonBlock).toContain("grid-row: 1;");
    expect(themeButtonBlock).toContain("justify-content: center;");
    expect(themeButtonBlock).toContain("padding: 0;");
    expect(themeButtonBlock).toContain("background: transparent;");
    expect(source).not.toContain("agent-mini-rail");
    expect(css).not.toContain(".agent-mini-rail");
    expect(cornerButtonBlock).toContain("display: none;");
    expect(css).toContain("@media (max-width: 1180px)");
    expect(compactCornerButtonBlock).toContain("display: none;");
  });

  it("uses a two-column workbench so the transcript and composer keep the main track", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");
    const workbenchBlock = css.match(/\.agent-workbench\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const compactMedia = css.match(/@media\s*\(max-width:\s*1180px\)\s*\{(?<body>[\s\S]*?)@media\s*\(max-width:\s*760px\)/)?.groups?.body ?? "";
    const composerLeftBlock = css.match(/\.composer-left-actions\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(source).not.toContain("INSPECTOR_MAX_WIDTH");
    expect(source).not.toContain("inspectorWidth");
    expect(workbenchBlock).toContain("minmax(560px, 1fr)");
    expect(workbenchBlock).not.toContain("var(--agent-inspector-width");
    expect(compactMedia).not.toContain(".agent-inspector");
    expect(composerLeftBlock).toContain("display: flex;");
    expect(composerLeftBlock).toContain("flex-wrap: wrap;");
  });

  it("fully collapses the sidebar on compact windows while preserving the traffic-light safe area", () => {
    const css = readProjectFile("src/styles/theme.css");
    const compactMedia = css.match(/@media\s*\(max-width:\s*1180px\)\s*\{(?<body>[\s\S]*?)@media\s*\(max-width:\s*760px\)/)
      ?.groups?.body ?? "";
    const workbenchBlock = compactMedia.match(/\.agent-workbench\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const collapsedWorkbenchBlock = compactMedia.match(/\.agent-workbench\.is-sidebar-collapsed\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";
    const sidebarBlock = compactMedia.match(/\.agent-sidebar\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const statusStripBlock = compactMedia.match(/\.agent-status-strip\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const miniRailBlock = compactMedia.match(/\.agent-mini-rail\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const sidebarContentBlock = compactMedia.match(/\.agent-sidebar > \*:not\(\.agent-mini-rail\)\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";
    const resizeHandleBlock = compactMedia.match(/\.resize-handle-h\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(sidebarBlock).toContain("display: none;");
    expect(miniRailBlock).toBe("");
    expect(sidebarContentBlock).toBe("");
    expect(resizeHandleBlock).toContain("display: none;");
    expect(css).toContain("--window-control-safe-width: 72px;");
    expect(workbenchBlock).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(collapsedWorkbenchBlock).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(statusStripBlock).toContain("padding-left: calc(var(--window-control-safe-width) + 16px);");
    expect(workbenchBlock).not.toContain("var(--agent-sidebar-width)");
  });

  it("does not reserve the removed sidebar resize column when the sidebar is collapsed", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");
    const collapsedWorkbenchBlock = css.match(/(?:^|\n)\.agent-workbench\.is-sidebar-collapsed\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";
    const collapsedContentRowBlock = css.match(/(?:^|\n)\.agent-workbench\.is-sidebar-collapsed \.agent-content-row\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";
    const collapsedStatusStripBlock = css.match(/(?:^|\n)\.agent-workbench\.is-sidebar-collapsed \.agent-status-strip\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";

    expect(source).toContain("{!sidebarCollapsed && (\n          <ResizeHandle onResize={handleSidebarResize} />\n        )}");
    expect(collapsedWorkbenchBlock).toContain(
      "grid-template-columns: minmax(0, 1fr);",
    );
    expect(collapsedContentRowBlock).toContain("grid-column: 1;");
    expect(collapsedStatusStripBlock).toContain("padding-left: calc(var(--window-control-safe-width) + 16px);");
    expect(collapsedWorkbenchBlock).not.toContain("max(60px, var(--window-control-safe-width))");
    expect(collapsedWorkbenchBlock).not.toContain("var(--window-control-safe-width) minmax(0, 1fr)");
    expect(collapsedWorkbenchBlock).not.toContain("60px auto minmax(560px, 1fr)");
  });

  it("does not reserve a hidden right panel column on compact windows", () => {
    const css = readProjectFile("src/styles/theme.css");
    const compactMedia = css.match(/@media\s*\(max-width:\s*1180px\)\s*\{(?<body>[\s\S]*?)@media\s*\(max-width:\s*760px\)/)
      ?.groups?.body ?? "";
    const contentRowWithPanelBlock = compactMedia.match(/\.agent-content-row\.has-right-panel\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";
    const contentRowWithHostResizeBlock = compactMedia.match(/\.agent-content-row\.has-right-panel\.is-right-panel-layout-frozen\.is-host-window-resizing\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";
    const rightPanelBlock = compactMedia.match(/\.agent-right-panel\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const rightResizeBlock = compactMedia.match(/\.agent-right-resize\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(rightPanelBlock).toContain("display: none;");
    expect(rightResizeBlock).toContain("display: none;");
    expect(contentRowWithPanelBlock).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(contentRowWithPanelBlock).not.toContain("var(--agent-right-panel-width)");
    expect(contentRowWithHostResizeBlock).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(contentRowWithHostResizeBlock).toContain("width: 100%;");
  });

  it("keeps right panel resizing anchored to the right panel instead of the main track", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");
    const contentRowBlock = css.match(/(?:^|\n)\.agent-content-row\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const contentRowWithPanelBlock = css.match(/(?:^|\n)\.agent-content-row\.has-right-panel\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";
    const frozenRowBlock = css.match(/(?:^|\n)\.agent-content-row\.is-right-panel-layout-frozen\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";
    const frozenRowWithPanelBlock = css.match(/(?:^|\n)\.agent-content-row\.has-right-panel\.is-right-panel-layout-frozen\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";
    const hostFrozenRowWithPanelBlock = css.match(/(?:^|\n)\.agent-content-row\.has-right-panel\.is-right-panel-layout-frozen\.is-host-window-resizing\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";
    const mainBlock = css.match(/(?:^|\n)\.agent-content-row > \.agent-main\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";
    const resizeBlock = css.match(/(?:^|\n)\.agent-right-resize\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const panelBlock = css.match(/(?:^|\n)\.agent-right-panel\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(source).toContain("--agent-right-panel-width");
    expect(source).toContain("setRightPanelWidth(next);");
    expect(source).not.toContain("nextElementSibling as HTMLElement");
    expect(source).toContain("has-right-panel");
    expect(source).toContain("rightPanelMainFreezeWidth");
    expect(source).toContain("agentMainRef");
    expect(source).toContain("agentMainRef.current?.getBoundingClientRect().width");
    expect(source).toContain("is-right-panel-layout-frozen");
    expect(source).toContain("rightPanelHostWindowResizing");
    expect(source).toContain("is-host-window-resizing");
    expect(source).toContain("--agent-main-freeze-width");
    expect(contentRowBlock).toContain("display: grid;");
    expect(contentRowBlock).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(contentRowWithPanelBlock).toContain("grid-template-columns: minmax(0, 1fr) 6px var(--agent-right-panel-width);");
    expect(frozenRowBlock).toContain("grid-template-columns: var(--agent-main-freeze-width);");
    expect(frozenRowBlock).toContain("width: var(--agent-main-freeze-width);");
    expect(frozenRowWithPanelBlock).toContain("--agent-main-visible-width: clamp(0px, calc(100% - 6px - var(--agent-right-panel-width)), var(--agent-main-freeze-width));");
    expect(frozenRowWithPanelBlock).toContain("grid-template-columns: minmax(0, var(--agent-main-visible-width)) 6px var(--agent-right-panel-width);");
    expect(frozenRowWithPanelBlock).toContain("width: min(100%, calc(var(--agent-main-freeze-width) + 6px + var(--agent-right-panel-width)));");
    expect(hostFrozenRowWithPanelBlock).toContain("grid-template-columns: var(--agent-main-freeze-width) 6px var(--agent-right-panel-width);");
    expect(hostFrozenRowWithPanelBlock).toContain("width: calc(var(--agent-main-freeze-width) + 6px + var(--agent-right-panel-width));");
    expect(mainBlock).toContain("min-width: 0;");
    expect(resizeBlock).not.toContain("position: absolute;");
    expect(resizeBlock).toContain("width: 6px;");
    expect(panelBlock).not.toContain("position: absolute;");
    expect(panelBlock).toContain("width: var(--agent-right-panel-width);");
    expect(panelBlock).toContain("min-width: 0;");
  });

  it("toggles the right commit history dock from the branch button and scrolls its contents", () => {
    const panelSource = readProjectFile("src/components/RightPanel.tsx");
    const css = readProjectFile("src/styles/theme.css");
    const changesBlock = css.match(/(?:^|\n)\.agent-right-panel-changes\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const changeScrollBlock = css.match(/(?:^|\n)\.git-change-scroll-area\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const branchToggleBlock = css.match(/(?:^|\n)\.git-branch-toggle\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const branchPanelBlock = css.match(/(?:^|\n)\.git-branch-panel\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const branchContentBlock = css.match(/(?:^|\n)\.git-branch-panel-content\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";
    const commitListBlock = css.match(/(?:^|\n)\.git-recent-commit-list\s*\{(?<body>[^}]*)\}/)
      ?.groups?.body ?? "";

    expect(css).toContain("--agent-bottom-dock-height: 142px;");
    expect(panelSource).toContain("commitLogPanelOpen");
    expect(panelSource).toContain("handleCommitLogToggle");
    expect(panelSource).toContain("git-branch-toggle");
    expect(panelSource).toContain("aria-expanded={commitLogPanelOpen}");
    expect(panelSource).toContain("commitLogPanelOpen ? gitBranchPanel : null");
    expect(panelSource).not.toContain("gitBranchPanelCollapsed");
    expect(panelSource).not.toContain("onToggleCollapsed");
    expect(changesBlock).toContain("overflow: hidden;");
    expect(changeScrollBlock).toContain("overflow-y: auto;");
    expect(branchToggleBlock).toContain("width: 26px;");
    expect(branchPanelBlock).toContain("display: flex;");
    expect(branchPanelBlock).toContain("flex: 0 0 var(--agent-bottom-dock-height);");
    expect(branchPanelBlock).toContain("flex-direction: column;");
    expect(branchPanelBlock).toContain("overflow: hidden;");
    expect(css).not.toContain(".git-branch-panel.is-collapsed");
    expect(branchContentBlock).toContain("flex: 1 1 auto;");
    expect(branchContentBlock).toContain("overflow-y: auto;");
    expect(commitListBlock).toContain("min-height: 0;");
  });

  it("absorbs window right-edge resizing into the right panel width", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");

    expect(source).toContain("windowWidthRef");
    expect(source).toContain('window.addEventListener("resize", handleWindowResize);');
    expect(source).toContain("const widthDelta = nextWindowWidth - previousWindowWidth;");
    expect(source).toContain("setRightPanelWindowResizing(true);");
    expect(source).toContain("setRightPanelWindowResizing(false);");
    expect(source).toContain("setRightPanelWidth((current) => Math.max(RIGHT_PANEL_MIN_WIDTH, current + widthDelta));");
    expect(source).toContain("resizing={rightPanelResizing || rightPanelWindowResizing}");
  });

  it("expands and shrinks the host window when toggling the right panel from the header", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const desktopApiSource = readProjectFile("src/services/desktopApi.ts");
    const mainSource = readProjectFile("electron/main.ts");

    expect(source).toContain("const RIGHT_PANEL_RESIZER_WIDTH = 6;");
    expect(source).toContain("const handleRightPanelToggle = useCallback(() => {");
    expect(source).toContain("const panelResizeDelta = rightPanelWidth + RIGHT_PANEL_RESIZER_WIDTH;");
    expect(source).toContain("const canResizeHostWindow = Boolean(window.anyJumper?.invoke);");
    expect(source).toContain("rightPanelToggleTransactionRef");
    expect(source).toContain("setRightPanelHostWindowResizing(true);");
    expect(source).toContain("desktopApi.resizeCurrentWindowByWidthDelta(next ? panelResizeDelta : -panelResizeDelta);");
    expect(source).toContain("if (next) {");
    expect(source).toContain("setRightPanelOpen(false);");
    expect(source).toContain("finishRightPanelToggleAfterPaint(transactionId);");
    expect(source).toContain("rightPanelWindowResizeSuppressedRef");
    expect(source).not.toContain("}, 240);");
    expect(source).toContain("onClick={handleRightPanelToggle}");
    expect(desktopApiSource).toContain("resizeCurrentWindowByWidthDelta(delta: number)");
    expect(desktopApiSource).toContain('invoke<void>("window_resize_by_width_delta", { delta })');
    expect(mainSource).toContain("function resizeCurrentWindowByWidthDelta(event: Electron.IpcMainInvokeEvent, delta: unknown)");
    expect(mainSource).toContain('case "window_resize_by_width_delta": return resizeCurrentWindowByWidthDelta(_event, args.delta);');
    expect(mainSource).toContain("win.setSize(Math.max(minWidth, width + Math.round(delta)), height, false);");
  });

  it("shows pending approval actions inside the inline turn trace", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).toContain("approvals={approvalCards}");
    expect(source).toContain("turnApprovalsForToolCalls");
    expect(source).toContain("onResolveApproval(approval, \"approved\")");
    expect(source).toContain("onResolveApproval(approval, \"rejected\")");
    expect(css).toContain(".turn-trace-approval");
    expect(css).toContain(".turn-trace-approval-actions");
  });

  it("surfaces pending approvals in a global dialog", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).toContain("const activeApproval = pendingApprovals[0];");
    expect(source).toMatch(/<Dialog\s+open=\{Boolean\(activeApproval\)\}/);
    expect(source).toContain("<DialogTitle>待审批工具调用</DialogTitle>");
    expect(source).toContain("activeApproval ? (");
    expect(source).toContain("resolveApproval(activeApproval, \"approved\")");
    expect(source).toContain("resolveApproval(activeApproval, \"rejected\")");
    expect(css).toContain(".approval-dialog-body");
    expect(css).toContain(".approval-dialog-summary");
  });

  it("folds realtime tool trace into a compact Codex-style detail summary", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const cardSource = readProjectFile("src/components/ToolTraceCard.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).toContain("composeTurnTraceDetailRows");
    expect(source).toContain("toolTraceCardToDetailRow");
    expect(source).toContain("compactTurnTraceToolSummary");
    expect(source).toContain("toolCards={toolCards}");
    expect(source).toContain("toolCards?: ToolTraceCardModel[]");
    expect(source).toContain("compactModelProcessItems");
    expect(source).toContain("composeTurnTraceStreamEntries(compactItems.items, toolDetailRows)");
    expect(source).toContain("traceEntries.map((entry)");
    expect(source).toContain('entry.type === "thought"');
    expect(source).toContain("<TurnTraceToolGroup");
    expect(source).toContain('row.type === "tool"');
    expect(source).toContain('row.status !== "completed" ? <small>{toolTraceStatusLabel(row.status)}</small> : null');
    expect(source).toContain('<details className="turn-trace-tool-details">');
    expect(source).toContain('<summary className="turn-trace-tool-summary">');
    expect(source).toContain('<TurnTraceMetaRow status={entry.status} summary={entry.summary} />');
    expect(source).not.toContain("查看工具详情");
    expect(source).not.toContain("<ToolTraceGroup");
    expect(source).toContain("toolCallEventsByTurn");
    expect(source).toContain("reduceToolTraceByTurn");
    expect(cardSource).toContain("tool-trace-card");
    expect(cardSource).toContain("tool-trace-output");
    expect(css).toContain(".turn-trace-tool-details");
    expect(css).toContain(".turn-trace-tool-detail-head");
    expect(css).toContain(".turn-trace-row-detail");
    expect(css).toContain(".turn-trace-tool-output");
    expect(css).not.toContain(".turn-trace-row-action");
    expect(css).not.toContain(".turn-trace-tools .tool-trace-group");
  });

  it("uses smart autoscroll for the transcript and expanded turn trace", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const conversationSource = readProjectFile("src/components/conversation/Conversation.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).toContain("ConversationScrollButton");
    expect(conversationSource).toContain("use-stick-to-bottom");
    expect(source).toContain("<Conversation");
    expect(source).toContain("traceCardRef");
    expect(source).toContain("handleTraceScroll");
    expect(source).toContain("tracePinnedToBottom");
    expect(source).toContain("turn-trace-jump-to-latest");
    expect(source).toContain('aria-label="跳到最新"');
    expect(source).toContain('<ArrowDown className="turn-trace-jump-icon" size={22} />');
    expect(source).not.toMatch(/<button[^>]*className="turn-trace-jump-to-latest"[\s\S]*?>\s*跳到最新\s*<\/button>/);
    expect(source).toContain("isNearScrollBottom");
    expect(source).toContain("scrollElementToBottom");
    expect(css).toContain(".turn-trace-jump-to-latest");

    const transcriptStart = source.indexOf("<Conversation");
    const scrollButton = source.indexOf("ConversationScrollButton", transcriptStart);
    const composerStart = source.indexOf("<AgentComposer", transcriptStart);

    expect(scrollButton).toBeGreaterThan(transcriptStart);
    expect(scrollButton).toBeLessThan(composerStart);
    expect(conversationSource).toContain("StickToBottom");
  });

  it("renders expanded trace as a Codex-style process stream with folded tool details", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).toContain("TRACE_THOUGHT_VISIBLE_LIMIT");
    expect(source).toContain("compactModelProcessItems(processItems, TRACE_THOUGHT_VISIBLE_LIMIT)");
    expect(source).toContain("toolDetailRows = composeTurnTraceDetailRows(toolCards, approvals)");
    expect(source).toContain("traceEntries = composeTurnTraceStreamEntries(compactItems.items, toolDetailRows)");
    expect(source).toContain("traceEntries.map((entry)");
    expect(source).toContain("<TurnTraceThought item={item}");
    expect(source).toContain("<TurnTraceToolGroup");
    expect(source).toContain("<TurnTraceMetaRow");
    expect(source).toContain("<details className=\"turn-trace-tool-details\">");
    expect(source).toContain("<summary className=\"turn-trace-tool-summary\">");
    expect(source).not.toContain("查看工具详情");
    expect(source).not.toContain("compactItems.items.map((item)");
    expect(source).not.toContain("expandedTimelineRows");
    expect(source).not.toContain("timelineRows.map((row)");
    expect(source).not.toContain("modelProcessItemLabel");
    expect(source).not.toContain("toolSectionExpanded");
    expect(source).not.toContain("approvalSectionExpanded");
    expect(css).toContain(".turn-trace-meta-row");
    expect(css).toContain(".turn-trace-thought-text");
    expect(css).toContain(".turn-trace-tool-details");
    expect(css).not.toContain(".turn-trace-row-action");
  });

  it("formats reasoning trace text as readable paragraphs with truncation feedback", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).toContain("formatTraceThoughtText");
    expect(source).toContain("TraceThoughtText");
    expect(source).toContain('item.kind === "reasoning"');
    expect(source).toContain("turn-trace-reasoning");
    expect(css).toContain(".turn-trace-reasoning");
    expect(css).toContain(".turn-trace-reasoning-paragraph");
    expect(css).toContain(".turn-trace-reasoning-truncated");
    expect(css).toContain("max-width: 78ch;");
  });

  it("keeps live progress chatter out of assistant markdown while still feeding trace", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");

    expect(source).toContain('import { stripProgressChatter } from "../utils/progressChatter"');
    expect(source).toContain("assistantDisplay = assistantDisplayParts(item)");
    expect(source).toContain("assistantDisplay.content");
    expect(source).toContain("assistantDisplay.progressNotes");
  });

  it("sanitizes completed assistant messages instead of only running streams", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const helper =
      source.match(/function assistantDisplayParts[\s\S]*?function messageRoleClass/)?.[0] ?? "";

    expect(helper).toContain('item.role !== "assistant" || !item.content.trim()');
    expect(helper).toContain("const stripped = stripProgressChatter(item.content)");
    expect(helper).toContain('item.status === "running"');
    expect(helper).not.toContain('item.status !== "running"');
  });

  it("turns explicit skill slash commands into SKILL.md-backed agent requests", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");

    expect(source).toContain("executeSkillSlashCommand(args)");
    expect(source).toContain("desktopApi.skillRead(skill.path)");
    expect(source).toContain("请使用 Skill");
    expect(source).toContain("SKILL.md");
    expect(source).not.toContain("return await sendMessageToAgent(fillMessage, []);");
  });

  it("renders expanded skill prompts as compact user-facing messages", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");

    expect(source).toContain('import { displaySkillPrompt } from "../utils/skillPromptDisplay"');
    expect(source).toContain("userDisplayContent(item.content)");
    expect(source).toContain("function userDisplayContent(content: string)");
    expect(source).toContain("return displaySkillPrompt(content);");
  });

  it("keeps the status header free of right-rail controls", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const headerActionsIndex = source.indexOf('className="agent-status-actions"');
    const composerActionsIndex = source.indexOf('className="composer-left-actions"');
    const composerBlock = source.slice(
      composerActionsIndex,
      source.indexOf('className="composer-send-button"', composerActionsIndex),
    );

    expect(headerActionsIndex).toBeGreaterThan(-1);
    expect(composerActionsIndex).toBeGreaterThan(-1);
    expect(source).not.toContain("agent-inspector-toggle agent-side-control");
    expect(composerBlock).not.toContain('className="agent-inspector-toggle"');
  });

  it("reuses the composer send button as the only running stop control", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const headerActionsIndex = source.indexOf('className="agent-status-actions"');
    const transcriptIndex = source.indexOf("<Conversation");
    const headerActionsBlock = source.slice(headerActionsIndex, transcriptIndex);

    expect(source).toContain('isRunning={activeThread?.status === "running"}');
    expect(source).toContain("onInterrupt={interrupt}");
    expect(source).toContain('aria-label={isRunning ? "停止会话"');
    expect(source).toContain('variant={isRunning ? "destructive" : "default"}');
    expect(source).toContain("isRunning ? <StopCircle size={17} />");
    expect(headerActionsBlock).not.toContain("StopCircle");
    expect(headerActionsBlock).not.toContain("onClick={interrupt}");
    expect(source).not.toContain("session-action-row");
    expect(source).not.toContain("session-action-button");
    expect(source).not.toContain('label="Stop"');
  });

  it("separates user and assistant transcript actions by message role", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");
    const actionsBlock = css.match(/\.message-actions\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const userActionsBlock = css.match(/\.message-user\s+\.message-actions\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const assistantActionsBlock = css.match(/\.message-assistant\s+\.message-actions,\s*\n\.message-system\s+\.message-actions\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(source).toContain('label="从这里分叉"');
    expect(source).toContain('label="编辑并重试"');
    expect(source).toContain('label="复制消息"');
    expect(source).toContain('item.role === "user"');
    expect(source).toContain('item.role === "assistant"');
    expect(source).toContain("onClick={() => void copyMessageContent(item)}");
    expect(source).toContain("onClick={() => openRetryEditor(item)}");
    expect(source).toContain("onClick={() => void forkThreadFromItem(item)}");
    expect(css).toContain(".message-actions");
    expect(css).toContain(".message-user .message-actions");
    expect(css).toContain(".message-assistant .message-actions");
    expect(css).toContain(".message-user .message-actions");
    expect(userActionsBlock).toContain("justify-content: flex-end;");
    expect(assistantActionsBlock).toContain("justify-content: flex-start;");
    expect(actionsBlock).not.toContain("position: absolute;");
    expect(actionsBlock).not.toContain("pointer-events: none;");
    expect(userActionsBlock).not.toContain("bottom: -18px;");
    expect(css).not.toContain(".session-action-button");
  });

  it("does not refresh the whole thread for streaming message deltas", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const handleAgentEventBlock = source.match(/function handleAgentEvent[\s\S]*?function toggleThinkingTrace/)?.[0] ?? "";

    expect(handleAgentEventBlock).toContain("shouldReloadThreadAfterAgentEvent(event)");
    expect(handleAgentEventBlock).not.toContain('event.event === "message.delta" ? 800 : 80');
  });

  it("keeps composer draft state inside a memoized composer to avoid shell rerenders while typing", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const agentPageStart = source.indexOf("export default function AgentPage");
    const composerComponentStart = source.indexOf("const AgentComposer = memo");
    const agentPageBody = source.slice(agentPageStart, composerComponentStart);

    expect(composerComponentStart).toBeGreaterThan(agentPageStart);
    expect(agentPageBody).not.toContain("const [composer, setComposer]");
    expect(source).toContain("composerRef.current?.setComposer");
    expect(source).toContain("useImperativeHandle(ref");
  });

  it("does not run async markdown highlighting while an assistant message is streaming", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const rendererSource = readProjectFile("src/components/MarkdownRenderer.tsx");

    expect(source).toContain('streaming={item.status === "running"}');
    expect(rendererSource).toContain("streaming?: boolean");
    expect(rendererSource).toContain("if (streaming) {");
    expect(rendererSource).toContain('className="streaming-markdown-text"');
  });

  it("opens generated file chips in the right panel preview tab", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const rendererSource = readProjectFile("src/components/MarkdownRenderer.tsx");
    const chipSource = readProjectFile("src/components/message/FilePathChip.tsx");
    const rightPanelSource = readProjectFile("src/components/RightPanel.tsx");

    expect(source).toContain("handleOpenGeneratedFile");
    expect(source).toContain("rightPanelPreviewFile");
    expect(source).toContain("setRightPanelPreviewFile");
    expect(source).toContain("setRightPanelOpenWithWindowResize(true)");
    expect(source).toContain('localStorage.setItem("any-jumper-right-panel-open", String(next))');
    expect(source).toContain("externalPreviewFile={rightPanelPreviewFile}");
    expect(source).not.toContain("setPreviewOpen(true)");
    expect(source).toContain("onFileOpen={handleOpenGeneratedFile}");
    expect(rendererSource).toContain("onFileOpen?: (filePath: string) => void");
    expect(rendererSource).toContain("<FilePathChip filePath={filePath} onOpen={onFileOpen}");
    expect(rightPanelSource).toContain("externalPreviewFile?: PreviewFile | null");
    expect(rightPanelSource).toContain("externalPreviewFile");
    expect(rightPanelSource).toContain('setActiveTab("preview")');
    expect(chipSource).toContain("onOpen?: (filePath: string) => void");
    expect(chipSource).not.toContain("electronAPI");
  });

  it("does not mix Ant Design into the src design system or dependencies", () => {
    const packageJson = readProjectFile("package.json");
    let searchOutput = "";

    try {
      searchOutput = execFileSync(
        "grep",
        [
          "-rn",
          "-E",
          "from\\s+['\"]antd['\"]|from\\s+['\"]@ant-design/icons['\"]",
          "src",
          "--exclude=AgentPage.messageLayout.test.ts",
        ],
        { cwd: projectRoot, encoding: "utf8" },
      );
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status !== 1) throw error;
    }

    expect(searchOutput).toBe("");
    expect(packageJson).not.toContain('"antd"');
    expect(packageJson).not.toContain('"@ant-design/icons"');
  });
});
