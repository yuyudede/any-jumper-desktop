# Sidebar Full Collapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the collapsed mini rail and make the left sidebar collapse completely while preserving the macOS traffic-light safe area.

**Architecture:** Keep the existing `sidebarCollapsed` state and header toggle. Remove the mini rail JSX and CSS, then make the collapsed workbench reserve only `--window-control-safe-width` before the main content so the session title cannot overlap the native window controls.

**Tech Stack:** React 18, TypeScript, CSS, Vitest string-based layout tests.

---

### Task 1: Update Layout Regression Tests

**Files:**
- Modify: `src/pages/AgentPage.messageLayout.test.ts`
- Modify: `src/app/App.navigation.test.ts`

- [ ] **Step 1: Write failing assertions for full-collapse behavior**

In `src/pages/AgentPage.messageLayout.test.ts`, change the compact-window sidebar test to assert that mini rail rules are gone and collapsed layout keeps only the window-control safe column:

```ts
expect(sidebarBlock).toContain("display: none;");
expect(miniRailBlock).toBe("");
expect(sidebarContentBlock).toBe("");
expect(resizeHandleBlock).toContain("display: none;");
expect(css).toContain("--window-control-safe-width: 72px;");
expect(workbenchBlock).toContain("grid-template-columns: var(--window-control-safe-width) minmax(0, 1fr);");
expect(collapsedWorkbenchBlock).toContain("grid-template-columns: var(--window-control-safe-width) minmax(0, 1fr);");
expect(workbenchBlock).not.toContain("var(--agent-sidebar-width)");
```

In `src/pages/AgentPage.messageLayout.test.ts`, change the collapsed resize-column test to expect:

```ts
expect(collapsedWorkbenchBlock).toContain(
  "grid-template-columns: var(--window-control-safe-width) minmax(0, 1fr);",
);
expect(collapsedWorkbenchBlock).not.toContain("max(60px, var(--window-control-safe-width))");
expect(collapsedWorkbenchBlock).not.toContain("60px auto minmax(560px, 1fr)");
```

In `src/app/App.navigation.test.ts`, update the selected sidebar entry test so the regex only targets `.agent-bridge-entry.is-active`, and add:

```ts
expect(source).not.toContain("agent-mini-rail");
expect(css).not.toContain(".agent-mini-rail");
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
pnpm test src/pages/AgentPage.messageLayout.test.ts src/app/App.navigation.test.ts
```

Expected: FAIL because source and CSS still contain mini rail and the collapsed grid still uses the old 60px-safe-width rule.

### Task 2: Remove Mini Rail Implementation

**Files:**
- Modify: `src/pages/AgentPage.tsx`
- Modify: `src/styles/theme.css`

- [ ] **Step 1: Remove mini rail JSX**

Delete the `<div className="agent-mini-rail">...</div>` block inside `<aside className="agent-sidebar">`. Keep the full sidebar entries that follow it.

- [ ] **Step 2: Collapse to the macOS safe column**

In `src/pages/AgentPage.tsx`, change:

```tsx
style={{ "--agent-sidebar-width": `${sidebarCollapsed ? 60 : sidebarWidth}px` } as React.CSSProperties}
```

to:

```tsx
style={{ "--agent-sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
```

In `src/styles/theme.css`, change `.agent-workbench.is-sidebar-collapsed` to:

```css
.agent-workbench.is-sidebar-collapsed {
  grid-template-columns: var(--window-control-safe-width) minmax(0, 1fr);
}
```

Change `.agent-workbench.is-sidebar-collapsed .agent-sidebar` to hide the sidebar:

```css
.agent-workbench.is-sidebar-collapsed .agent-sidebar {
  display: none;
}
```

- [ ] **Step 3: Delete mini rail CSS**

Remove all `.agent-mini-rail`, `.agent-mini-rail-entry`, `.agent-mini-rail-separator`, `.agent-mini-rail-spacer`, `.agent-mini-rail-theme-toggle`, and mini rail tooltip rules.

In the `@media (max-width: 1180px)` block, keep the workbench grid safe-column rule but change `.agent-sidebar` to:

```css
.agent-sidebar {
  display: none;
}
```

Remove the compact `.agent-mini-rail` and `.agent-sidebar > *:not(.agent-mini-rail)` rules.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
pnpm test src/pages/AgentPage.messageLayout.test.ts src/app/App.navigation.test.ts
```

Expected: PASS.

### Task 3: Verify Build-Safe Surface

**Files:**
- Read: `src/pages/AgentPage.tsx`
- Read: `src/styles/theme.css`
- Read: `src/pages/AgentPage.messageLayout.test.ts`
- Read: `src/app/App.navigation.test.ts`

- [ ] **Step 1: Search for remaining mini rail references**

Run:

```bash
rg -n "agent-mini-rail|mini rail|Mini Rail" src/pages/AgentPage.tsx src/styles/theme.css
```

Expected: no matches.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Inspect diff**

Run:

```bash
git diff -- src/pages/AgentPage.tsx src/styles/theme.css src/pages/AgentPage.messageLayout.test.ts src/app/App.navigation.test.ts docs/superpowers/plans/2026-05-24-sidebar-full-collapse.md
```

Expected: diff only removes mini rail, updates collapsed layout/test assertions, and preserves unrelated existing worktree changes.
