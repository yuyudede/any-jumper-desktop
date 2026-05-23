# Inline Turn Trace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the right inspector rail and move balanced execution trace details into the chat timeline.

**Architecture:** The main chat view becomes a two-column shell: project sidebar plus conversation. Each assistant turn renders a single inline trace panel before the final answer, containing a concise summary, key progress steps, tool cards, and approval actions.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind-style CSS tokens, shadcn/Radix local primitives, Vitest source-structure tests.

---

### Task 1: Update Layout Expectations

**Files:**
- Modify: `src/pages/AgentPage.messageLayout.test.ts`
- Modify: `src/app/App.navigation.test.ts`

- [ ] **Step 1: Write failing tests**

Assert that `AgentPage.tsx` no longer contains `AgentInspector`, `agent-inspector-toggle`, `agent-inspector-resizer`, or `PanelRight*` controls. Assert `theme.css` no longer reserves an inspector grid column. Assert chat trace uses `TurnTracePanel` and includes approval actions inside the inline trace.

- [ ] **Step 2: Run focused tests**

Run: `pnpm exec vitest run src/pages/AgentPage.messageLayout.test.ts src/app/App.navigation.test.ts`

Expected: fail because the right inspector still exists.

### Task 2: Build Inline Turn Trace

**Files:**
- Modify: `src/pages/AgentPage.tsx`

- [ ] **Step 1: Replace `ModelProcessPanel` usage**

Pass `approvalCards` for the current turn and render `TurnTracePanel` instead of `ModelProcessPanel`.

- [ ] **Step 2: Add turn approval mapping**

Map pending approvals to a turn by matching `approval.toolCallId` to `ToolCall.id` in that turn.

- [ ] **Step 3: Rename panel component**

Rename `ModelProcessPanel` to `TurnTracePanel`, keep the existing compact step behavior, and add an `Approvals` block with approve/reject buttons.

### Task 3: Remove Inspector Rail

**Files:**
- Modify: `src/pages/AgentPage.tsx`
- Modify: `src/styles/theme.css`

- [ ] **Step 1: Remove inspector state and rendering**

Delete inspector width/collapse state, resize handlers, right rail toggle, resizer, and `AgentInspector`.

- [ ] **Step 2: Simplify workbench grid**

Change `.agent-workbench` to sidebar plus main content only. Keep the sidebar collapse behavior.

- [ ] **Step 3: Keep Bridge and Model pages**

Keep `BridgeMainPanel`, `ModelPage`, and `InspectorSection` as reusable main-content section primitives.

### Task 4: Verify

**Files:**
- Modify as needed based on failures.

- [ ] **Step 1: Run focused tests**

Run: `pnpm exec vitest run src/pages/AgentPage.messageLayout.test.ts src/app/App.navigation.test.ts`

- [ ] **Step 2: Run full validation**

Run: `pnpm typecheck`, `pnpm test`, and `pnpm build`.
