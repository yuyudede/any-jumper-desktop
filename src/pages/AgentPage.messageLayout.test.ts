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

    expect(css).not.toContain(".composer .rich-composer-editor .ProseMirror");
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
    expect(css).toContain(".turn-trace-section-title");
    expect(css).toContain(".turn-trace-stream");
    expect(css).toContain(".turn-trace-thought");
    expect(css).toContain(".turn-trace-tool-row");
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

  it("does not frame the agent workspace as a floating card", () => {
    const css = readProjectFile("src/styles/theme.css");
    const workbenchBlock = css.match(/\.agent-workbench\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const shellBlock = css.match(/\.shadcn-agent-shell\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const mainPanelBlock = css.match(/\.content-grid\.is-agent-grid\s+\.main-panel\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(workbenchBlock).not.toContain("border:");
    expect(workbenchBlock).not.toContain("border-radius");
    expect(workbenchBlock).not.toContain("box-shadow");
    expect(shellBlock).not.toContain("border-radius");
    expect(shellBlock).not.toContain("box-shadow");
    expect(mainPanelBlock).toContain("padding: 0;");
  });

  it("gives the empty chat home a restrained background with purposeful motion", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");
    const mainBeforeBlock = css.match(/\.agent-main::before\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    const mainAfterBlock = css.match(/\.agent-main::after\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

    expect(source).toMatch(/Conversation[\s\S]*is-empty-home/);
    expect(css).toContain(".agent-main::before");
    expect(css).toContain(".agent-main::after");
    expect(css).toContain(".transcript.is-empty-home");
    expect(css).toContain(".agent-empty-state::before");
    expect(css).toContain("@keyframes agent-empty-rise");
    expect(css).toContain("animation: agent-empty-rise");
    expect(css).not.toContain("@keyframes agent-bg-drift");
    expect(mainBeforeBlock).not.toContain("animation:");
    expect(mainAfterBlock).not.toContain("animation:");
  });

  it("keeps the primary empty-state action legible on the soft home background", () => {
    const css = readProjectFile("src/styles/theme.css");

    expect(css).toContain(".agent-empty-state-actions .shadcn-button-default");
    expect(css).toContain("color: var(--panel);");
  });

  it("does not render a right inspector rail or reserve a rail divider", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).not.toContain("agent-inspector-resizer");
    expect(source).not.toContain("agent-inspector-toggle");
    expect(source).not.toContain("PanelRightOpen");
    expect(source).not.toContain("PanelRightClose");
    expect(css).not.toContain(".agent-inspector");
    expect(css).not.toContain(".agent-inspector-resizer");
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

  it("folds realtime tool trace into compact inline timeline rows", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const cardSource = readProjectFile("src/components/ToolTraceCard.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).toContain("composeTurnTraceRows");
    expect(source).toContain("toolTraceCardToTimelineRow");
    expect(source).toContain("toolCards={toolCards}");
    expect(source).toContain("toolCards?: ToolTraceCardModel[]");
    expect(source).toContain("compactModelProcessItems");
    expect(source).toContain("timelineRows.map");
    expect(source).toContain('row.type === "tool"');
    expect(source).toContain('row.status !== "completed" ? <span className="turn-trace-row-status">');
    expect(source).not.toContain("<ToolTraceGroup");
    expect(source).toContain("toolCallEventsByTurn");
    expect(source).toContain("reduceToolTraceByTurn");
    expect(cardSource).toContain("tool-trace-card");
    expect(cardSource).toContain("tool-trace-output");
    expect(css).toContain(".turn-trace-row-action");
    expect(css).toContain(".turn-trace-row-detail");
    expect(css).toContain(".turn-trace-tool-output");
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

  it("keeps expanded trace as an ordered timeline with folded tools and approvals", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).toContain("TRACE_THOUGHT_VISIBLE_LIMIT");
    expect(source).toContain("compactModelProcessItems(processItems, TRACE_THOUGHT_VISIBLE_LIMIT)");
    expect(source).toContain("timelineRows = composeTurnTraceRows(compactItems.items, toolCards, approvals)");
    expect(source).toContain("expandedTimelineRows");
    expect(source).toContain("timelineRows.map((row)");
    expect(source).toContain('row.type === "thought"');
    expect(source).toContain('row.type === "tool"');
    expect(source).toContain('row.type === "approval"');
    expect(source).toContain('aria-expanded={Boolean(expandedTimelineRows[row.id])}');
    expect(source).toContain("approvalToTimelineRow");
    expect(source).not.toContain("toolSectionExpanded");
    expect(source).not.toContain("approvalSectionExpanded");
    expect(css).toContain(".turn-trace-row-action");
    expect(css).toContain(".turn-trace-row-detail");
    expect(css).toContain(".turn-trace-row-chevron");
  });

  it("formats reasoning trace text as readable paragraphs with truncation feedback", () => {
    const source = readProjectFile("src/pages/AgentPage.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(source).toContain("formatTraceThoughtText");
    expect(source).toContain("TraceThoughtText");
    expect(source).toContain('row.kind === "reasoning"');
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

  it("does not mix Ant Design into the src design system or dependencies", () => {
    const packageJson = readProjectFile("package.json");
    let searchOutput = "";

    try {
      searchOutput = execFileSync(
        "rg",
        [
          "-n",
          "from\\s+[\"']antd[\"']|from\\s+[\"']@ant-design/icons[\"']|antd|ant-design",
          "src",
          "--glob",
          "!src/pages/AgentPage.messageLayout.test.ts",
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
