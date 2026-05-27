# Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Selection global selected-text action feature from `docs/superpowers/specs/2026-05-27-selection-design.md`.

**Architecture:** Add Selection as a Portal-configured, independent Electron window. Renderer owns the configuration UI and Liquid Glass result UI; Electron main owns global shortcut registration, selected-text capture, window lifecycle, model invocation, and `selection-event` streaming. Selection runs directly against configured model providers and never creates threads in v1.

**Tech Stack:** Electron main/preload, React 18, TypeScript, Vite, Vitest, existing `desktopApi`, existing model-provider utilities, existing Portal settings pattern.

---

## File Map

- Create `src/utils/selectionActions.ts`: default Selection actions, settings normalization, template rendering, and default resolution.
- Create `src/utils/selectionActions.test.ts`: focused tests for action normalization and prompt rendering.
- Modify `src/types/index.ts`: add `SelectionAction`, `SelectionRunRequest`, `SelectionRunResult`, `SelectionEvent`, and `AppSettings` Selection fields.
- Modify `src/vite-env.d.ts`: expose `onSelectionEvent` on `window.anyJumper`.
- Modify `electron/preload.ts`: subscribe/unsubscribe to `selection-event`.
- Modify `src/services/desktopApi.ts`: add Selection IPC wrappers and event subscription.
- Modify `src/services/desktopApi.test.ts`: assert renderer API exposes Selection methods.
- Modify `src/utils/portalDefaults.ts`: add Selection defaults and constants.
- Modify `src/utils/portalDefaults.test.ts`: assert Selection default resolution is independent from new-session defaults.
- Modify `src/pages/PortalPage.tsx`: add `Selection` subtab and settings save flow.
- Create `src/pages/portal/PortalSelectionSettings.tsx`: Selection shortcut, model, reasoning, and action editor.
- Modify `src/pages/PortalPage.layout.test.ts`: assert tab ordering and Selection settings wiring.
- Create `src/pages/SelectionWindow.tsx`: standalone Selection runtime UI.
- Modify `src/app/App.tsx`: route `?selection=window` to `SelectionWindow`.
- Create `src/pages/SelectionWindow.layout.test.ts`: assert UI states and interaction hooks exist.
- Modify `src/styles/theme.css`: Selection config styles and Liquid Glass window styles.
- Modify `electron/main.ts`: selected-text capture, shortcut registration, Selection window lifecycle, IPC commands, and direct model run.
- Create or modify `electron/selectionShortcut.test.ts`: static tests for Selection shortcut/window/event wiring.

## Task 1: Selection Action Utilities

**Files:**
- Create: `src/utils/selectionActions.ts`
- Create: `src/utils/selectionActions.test.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add failing tests for default actions and prompt rendering**

Create `src/utils/selectionActions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AppSettings, SelectionAction } from "../types";
import {
  DEFAULT_SELECTION_REASONING_EFFORT,
  DEFAULT_SELECTION_SHORTCUT,
  DEFAULT_SELECTION_ACTIONS,
  enabledSelectionActions,
  renderSelectionPrompt,
  resolveSelectionDefaults,
  normalizeSelectionActions,
} from "./selectionActions";

describe("selectionActions", () => {
  it("ships compact two-character default actions in stable order", () => {
    expect(DEFAULT_SELECTION_ACTIONS.map((action) => action.label)).toEqual([
      "解释",
      "总结",
      "翻译",
      "润色",
      "改短",
      "查错",
    ]);
    expect(DEFAULT_SELECTION_ACTIONS.every((action) => action.label.length === 2)).toBe(true);
    expect(DEFAULT_SELECTION_ACTIONS.every((action) => action.promptTemplate.includes("{{selection}}"))).toBe(true);
  });

  it("normalizes user actions while preserving enabled custom entries", () => {
    const custom: SelectionAction = {
      id: "custom-polish",
      label: "风格",
      description: "改写为指定风格",
      promptTemplate: "请改写：{{selection}}",
      enabled: true,
      order: 1.5,
    };

    const actions = normalizeSelectionActions([
      { ...DEFAULT_SELECTION_ACTIONS[0], enabled: false, order: 9 },
      custom,
    ]);

    expect(actions.find((action) => action.id === DEFAULT_SELECTION_ACTIONS[0].id)?.enabled).toBe(false);
    expect(actions.find((action) => action.id === custom.id)).toEqual(custom);
    expect(actions.map((action) => action.id)).toContain("selection-translate");
  });

  it("filters disabled actions and orders by order", () => {
    const actions = enabledSelectionActions([
      { ...DEFAULT_SELECTION_ACTIONS[1], order: 3, enabled: true },
      { ...DEFAULT_SELECTION_ACTIONS[0], order: 2, enabled: false },
      { ...DEFAULT_SELECTION_ACTIONS[2], order: 1, enabled: true },
    ]);

    expect(actions.map((action) => action.label)).toEqual(["翻译", "总结"]);
  });

  it("renders selected text into prompt templates", () => {
    expect(renderSelectionPrompt("解释：{{selection}}", "hello")).toBe("解释：hello");
    expect(renderSelectionPrompt("{{selection}}\\n{{selection}}", "abc")).toBe("abc\\nabc");
  });

  it("resolves independent Selection defaults", () => {
    const settings: AppSettings = {
      gitCommand: "git",
      defaultNewSessionProviderId: "ignored",
      defaultNewSessionModel: "ignored-model",
      selectionShortcut: "CommandOrControl+Shift+L",
      selectionDefaultProviderId: "deepseek",
      selectionDefaultModel: "deepseek-chat",
      selectionReasoningEffort: "low",
    };

    expect(resolveSelectionDefaults(settings, [
      {
        id: "deepseek",
        providerKind: "openai-compatible",
        displayName: "DeepSeek",
        baseUrl: "https://example.com/v1",
        defaultModel: "deepseek-chat",
        models: ["deepseek-chat"],
        enabled: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ])).toEqual({
      shortcut: "CommandOrControl+Shift+L",
      providerId: "deepseek",
      model: "deepseek-chat",
      reasoningEffort: "low",
      actions: normalizeSelectionActions(undefined),
    });

    expect(DEFAULT_SELECTION_SHORTCUT).toBe("CommandOrControl+Shift+S");
    expect(DEFAULT_SELECTION_REASONING_EFFORT).toBe("low");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test src/utils/selectionActions.test.ts
```

Expected: FAIL because `src/utils/selectionActions.ts` and Selection types are not defined.

- [ ] **Step 3: Add Selection types**

In `src/types/index.ts`, extend `AppSettings`:

```ts
  selectionShortcut?: string;
  selectionDefaultWorkspaceId?: string;
  selectionDefaultProviderId?: string;
  selectionDefaultModel?: string;
  selectionReasoningEffort?: string;
  selectionActions?: SelectionAction[];
```

Add near other exported interfaces:

```ts
export interface SelectionAction {
  id: string;
  label: string;
  description: string;
  promptTemplate: string;
  enabled: boolean;
  order: number;
}

export interface SelectionDefaults {
  shortcut: string;
  providerId?: string;
  model?: string;
  reasoningEffort: string;
  actions: SelectionAction[];
}

export interface SelectionRunRequest {
  actionId: string;
  selectedText: string;
  providerId?: string;
  model?: string;
  reasoningEffort?: string;
}

export interface SelectionRunResult {
  runId: string;
  status: "started";
}

export interface SelectionEvent {
  runId: string;
  event: "selection.started" | "selection.delta" | "selection.completed" | "selection.failed";
  payload?: unknown;
  createdAt: number;
}
```

- [ ] **Step 4: Implement utility module**

Create `src/utils/selectionActions.ts`:

```ts
import type { AppSettings, ModelConfig, SelectionAction, SelectionDefaults } from "../types";
import { defaultModelForProvider } from "./modelProviders";

export const DEFAULT_SELECTION_SHORTCUT = "CommandOrControl+Shift+S";
export const DEFAULT_SELECTION_REASONING_EFFORT = "low";

export const DEFAULT_SELECTION_ACTIONS: SelectionAction[] = [
  {
    id: "selection-explain",
    label: "解释",
    description: "解释这段内容",
    promptTemplate: "请用简洁中文解释下面这段内容，必要时补充背景，但不要扩写过度：\\n\\n{{selection}}",
    enabled: true,
    order: 1,
  },
  {
    id: "selection-summary",
    label: "总结",
    description: "提炼要点",
    promptTemplate: "请提炼下面这段内容的关键要点，使用简洁中文列出：\\n\\n{{selection}}",
    enabled: true,
    order: 2,
  },
  {
    id: "selection-translate",
    label: "翻译",
    description: "翻译成中文",
    promptTemplate: "请将下面内容翻译成自然、准确的中文，保留原意：\\n\\n{{selection}}",
    enabled: true,
    order: 3,
  },
  {
    id: "selection-polish",
    label: "润色",
    description: "改写得更清楚自然",
    promptTemplate: "请润色下面这段内容，让表达更清楚自然，不改变原意：\\n\\n{{selection}}",
    enabled: true,
    order: 4,
  },
  {
    id: "selection-shorten",
    label: "改短",
    description: "压缩表达",
    promptTemplate: "请压缩下面这段内容，保留核心信息，让表达更短：\\n\\n{{selection}}",
    enabled: true,
    order: 5,
  },
  {
    id: "selection-check",
    label: "查错",
    description: "找潜在问题",
    promptTemplate: "请检查下面这段内容是否存在明显错误、矛盾、风险或遗漏，并用中文简要说明：\\n\\n{{selection}}",
    enabled: true,
    order: 6,
  },
];

export function normalizeSelectionActions(actions?: SelectionAction[]): SelectionAction[] {
  const merged = new Map(DEFAULT_SELECTION_ACTIONS.map((action) => [action.id, action]));
  for (const action of actions ?? []) {
    if (!action.id.trim() || !action.label.trim()) continue;
    merged.set(action.id, {
      ...action,
      label: action.label.trim(),
      description: action.description.trim(),
      promptTemplate: action.promptTemplate,
      enabled: Boolean(action.enabled),
      order: Number.isFinite(action.order) ? action.order : 999,
    });
  }
  return Array.from(merged.values()).sort((left, right) => left.order - right.order);
}

export function enabledSelectionActions(actions?: SelectionAction[]): SelectionAction[] {
  return normalizeSelectionActions(actions).filter((action) => action.enabled);
}

export function renderSelectionPrompt(template: string, selectedText: string): string {
  return template.replaceAll("{{selection}}", selectedText);
}

export function selectionTemplateWarning(template: string): string | undefined {
  if (!template.trim()) return "Prompt 模板不能为空";
  if (!template.includes("{{selection}}")) return "Prompt 模板未包含 {{selection}}，执行时可能不会使用选中文字。";
  return undefined;
}

export function resolveSelectionDefaults(settings: AppSettings, providers: ModelConfig[]): SelectionDefaults {
  const provider = settings.selectionDefaultProviderId
    ? providers.find((item) => item.id === settings.selectionDefaultProviderId)
    : undefined;
  const fallbackProvider = providers.find((item) => item.enabled && item.id !== "mock") || providers[0];
  const selectedProvider = provider || fallbackProvider;

  return {
    shortcut: settings.selectionShortcut?.trim() || DEFAULT_SELECTION_SHORTCUT,
    providerId: selectedProvider?.id,
    model: selectedProvider
      ? defaultModelForProvider(selectedProvider, settings.selectionDefaultModel || selectedProvider.defaultModel)
      : undefined,
    reasoningEffort: settings.selectionReasoningEffort?.trim() || DEFAULT_SELECTION_REASONING_EFFORT,
    actions: normalizeSelectionActions(settings.selectionActions),
  };
}
```

- [ ] **Step 5: Run utility tests**

Run:

```bash
pnpm test src/utils/selectionActions.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/types/index.ts src/utils/selectionActions.ts src/utils/selectionActions.test.ts
git commit -m "feat: add selection action utilities"
```

## Task 2: Renderer API And Event Bridge

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/vite-env.d.ts`
- Modify: `src/services/desktopApi.ts`
- Modify: `src/services/desktopApi.test.ts`

- [ ] **Step 1: Add failing API exposure test**

Append to `src/services/desktopApi.test.ts`:

```ts
  it("exposes renderer APIs for Selection actions", () => {
    const source = readDesktopApiSource();

    expect(source).toContain("selectionShortcutReregister()");
    expect(source).toContain('invoke<boolean>("selection_shortcut_reregister"');
    expect(source).toContain("selectionShow()");
    expect(source).toContain('invoke<void>("selection_window_show"');
    expect(source).toContain("selectionHide()");
    expect(source).toContain('invoke<void>("selection_window_hide"');
    expect(source).toContain("selectionRunAction(request");
    expect(source).toContain('invoke<SelectionRunResult>("selection_run_action"');
    expect(source).toContain("onSelectionEvent(handler");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test src/services/desktopApi.test.ts
```

Expected: FAIL because the Selection API methods are missing.

- [ ] **Step 3: Update preload bridge**

In `electron/preload.ts`, add:

```ts
  onSelectionEvent(handler: (event: unknown) => void) {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => handler(payload);
    ipcRenderer.on("selection-event", listener);
    return () => ipcRenderer.off("selection-event", listener);
  },
```

- [ ] **Step 4: Update global renderer type**

In `src/vite-env.d.ts`, add to `window.anyJumper`:

```ts
    onSelectionEvent?: (handler: (event: unknown) => void) => () => void;
```

- [ ] **Step 5: Add desktop API wrappers**

In `src/services/desktopApi.ts`, import Selection types if they are not already in the type import:

```ts
  SelectionEvent,
  SelectionRunRequest,
  SelectionRunResult,
```

Add methods near Portal methods:

```ts
  selectionShortcutReregister() {
    return invoke<boolean>("selection_shortcut_reregister");
  },
  selectionShow() {
    return invoke<void>("selection_window_show");
  },
  selectionHide() {
    const api = bridge();
    return api.portalInvoke ? api.portalInvoke<void>("selection_window_hide") : invoke<void>("selection_window_hide");
  },
  selectionRunAction(request: SelectionRunRequest) {
    return invoke<SelectionRunResult>("selection_run_action", { request });
  },
  onSelectionEvent(handler: (event: SelectionEvent) => void) {
    const api = bridge();
    if (!api.onSelectionEvent) return Promise.resolve(() => undefined);
    const unsubscribe = api.onSelectionEvent((event) => handler(event as SelectionEvent));
    return Promise.resolve(unsubscribe);
  },
```

- [ ] **Step 6: Run API tests**

Run:

```bash
pnpm test src/services/desktopApi.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add electron/preload.ts src/vite-env.d.ts src/services/desktopApi.ts src/services/desktopApi.test.ts
git commit -m "feat: expose selection renderer api"
```

## Task 3: Selection Defaults In Portal Settings

**Files:**
- Modify: `src/utils/portalDefaults.ts`
- Modify: `src/utils/portalDefaults.test.ts`

- [ ] **Step 1: Add failing tests for Selection default resolution**

Append to `src/utils/portalDefaults.test.ts`:

```ts
import { resolveSelectionDefaults } from "./selectionActions";
```

Add inside the describe block:

```ts
  it("uses Selection-specific defaults instead of Portal or new-session defaults", () => {
    const settings: AppSettings = {
      gitCommand: "git",
      portalDefaultProviderId: "openai",
      portalDefaultModel: "gpt-4.1-mini",
      defaultNewSessionProviderId: "openai",
      defaultNewSessionModel: "gpt-4.1",
      selectionShortcut: "CommandOrControl+Shift+S",
      selectionDefaultProviderId: "deepseek",
      selectionDefaultModel: "deepseek-chat",
      selectionReasoningEffort: "low",
    };

    const defaults = resolveSelectionDefaults(
      settings,
      [provider("openai", "gpt-4.1-mini"), provider("deepseek", "deepseek-chat", ["deepseek-chat"])],
    );

    expect(defaults.providerId).toBe("deepseek");
    expect(defaults.model).toBe("deepseek-chat");
    expect(defaults.reasoningEffort).toBe("low");
    expect(defaults.shortcut).toBe("CommandOrControl+Shift+S");
  });
```

- [ ] **Step 2: Run test**

Run:

```bash
pnpm test src/utils/portalDefaults.test.ts
```

Expected: PASS if Task 1 has already exported `resolveSelectionDefaults`.

- [ ] **Step 3: Commit Task 3**

```bash
git add src/utils/portalDefaults.test.ts
git commit -m "test: cover selection default resolution"
```

## Task 4: Portal Selection Settings UI

**Files:**
- Create: `src/pages/portal/PortalSelectionSettings.tsx`
- Modify: `src/pages/PortalPage.tsx`
- Modify: `src/pages/PortalPage.layout.test.ts`

- [ ] **Step 1: Add failing layout test**

In `src/pages/PortalPage.layout.test.ts`, update expectations:

```ts
    expect(source).toContain("selectionShortcut");
    expect(source).toContain("selectionDefaultProviderId");
    expect(source).toContain("selectionDefaultModel");
    expect(source).toContain("selectionReasoningEffort");
    expect(source).toContain("selectionActions");
    expect(source).toContain("PortalSelectionSettings");
    expect(source).toContain('type PortalSubTab = "usage" | "sessions" | "selection" | "quickAsk" | "mainApp";');
```

Update labels expectation:

```ts
    expect(labels.slice(0, 5)).toEqual(["Usage", "Sessions", "Selection", "Quick Ask", "Main App"]);
```

Add ordering checks:

```ts
    expect(source.indexOf('id: "sessions"')).toBeLessThan(source.indexOf('id: "selection"'));
    expect(source.indexOf('id: "selection"')).toBeLessThan(source.indexOf('id: "quickAsk"'));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test src/pages/PortalPage.layout.test.ts
```

Expected: FAIL because Selection UI is not wired.

- [ ] **Step 3: Create Selection settings component**

Create `src/pages/portal/PortalSelectionSettings.tsx`:

```tsx
import { AlertTriangle, GripVertical, RadioTower, RotateCcw, Save, XCircle } from "lucide-react";
import { useMemo, type Dispatch, type SetStateAction } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { WorkbenchSection } from "../../components/Workbench";
import type { AppSettings, ModelConfig } from "../../types";
import {
  DEFAULT_SELECTION_ACTIONS,
  DEFAULT_SELECTION_REASONING_EFFORT,
  DEFAULT_SELECTION_SHORTCUT,
  normalizeSelectionActions,
  selectionTemplateWarning,
} from "../../utils/selectionActions";
import { modelOptionsForProvider } from "../../utils/modelProviders";

interface PortalSelectionSettingsProps {
  settingsDraft: AppSettings;
  models: ModelConfig[];
  providerOptions: Array<{ label: string; value: string }>;
  selectedProvider?: ModelConfig;
  loading: boolean;
  saving: boolean;
  recordingShortcut: boolean;
  onToggleShortcutRecording: () => void;
  setSettingsDraft: Dispatch<SetStateAction<AppSettings>>;
  onSave: () => void;
}

const reasoningOptions = [
  { label: "Minimal", value: "minimal" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "XHigh", value: "xhigh" },
];

export default function PortalSelectionSettings({
  settingsDraft,
  models,
  providerOptions,
  selectedProvider,
  loading,
  saving,
  recordingShortcut,
  onToggleShortcutRecording,
  setSettingsDraft,
  onSave,
}: PortalSelectionSettingsProps) {
  const actions = useMemo(
    () => normalizeSelectionActions(settingsDraft.selectionActions),
    [settingsDraft.selectionActions],
  );

  function updateAction(id: string, update: Partial<(typeof actions)[number]>) {
    setSettingsDraft((draft) => ({
      ...draft,
      selectionActions: actions.map((action) => action.id === id ? { ...action, ...update } : action),
    }));
  }

  function moveAction(id: string, direction: -1 | 1) {
    const index = actions.findIndex((action) => action.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= actions.length) return;
    const next = [...actions];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    setSettingsDraft((draft) => ({
      ...draft,
      selectionActions: next.map((action, order) => ({ ...action, order: order + 1 })),
    }));
  }

  return (
    <div className="portal-child-panel selection-settings-panel" role="tabpanel" aria-label="Selection">
      <WorkbenchSection
        title="全局唤起"
        description="设置 Selection 的全局快捷键。触发后会读取当前选中的文字，并先展示 Liquid Glass 动作条。"
      >
        <div className="model-form">
          <label className="field-stack">
            <span>快捷键</span>
            <div className={`shortcut-recorder ${recordingShortcut ? "is-recording" : ""}`}>
              <Input
                className="mono-input"
                value={recordingShortcut ? "请按下快捷键..." : settingsDraft.selectionShortcut || ""}
                placeholder={DEFAULT_SELECTION_SHORTCUT}
                disabled={loading || recordingShortcut}
                onChange={(event) => setSettingsDraft((draft) => ({ ...draft, selectionShortcut: event.target.value }))}
              />
              <Button type="button" variant={recordingShortcut ? "secondary" : "outline"} disabled={loading} onClick={onToggleShortcutRecording}>
                {recordingShortcut ? <XCircle size={14} /> : <RadioTower size={14} />}
                {recordingShortcut ? "取消录入" : "开始录入"}
              </Button>
            </div>
          </label>
          <p className="form-hint">建议使用不与 Portal Quick Ask 冲突的快捷键，例如 CommandOrControl+Shift+S。</p>
        </div>
      </WorkbenchSection>

      <WorkbenchSection title="模型默认值" description="Selection 直接调用模型，不自动创建会话。">
        <div className="model-form">
          <div className="two-col">
            <label className="field-stack">
              <span>默认 Provider</span>
              <Select
                value={settingsDraft.selectionDefaultProviderId || ""}
                disabled={loading}
                onChange={(event) => {
                  const providerId = event.target.value || undefined;
                  const provider = models.find((model) => model.id === providerId);
                  setSettingsDraft((draft) => ({
                    ...draft,
                    selectionDefaultProviderId: providerId,
                    selectionDefaultModel: provider?.defaultModel,
                  }));
                }}
                options={providerOptions}
              />
            </label>
            <label className="field-stack">
              <span>思考模式</span>
              <Select
                value={settingsDraft.selectionReasoningEffort || DEFAULT_SELECTION_REASONING_EFFORT}
                disabled={loading}
                onChange={(event) => setSettingsDraft((draft) => ({ ...draft, selectionReasoningEffort: event.target.value }))}
                options={reasoningOptions}
              />
            </label>
          </div>
          <label className="field-stack">
            <span>默认模型</span>
            <Input
              className="mono-input"
              value={settingsDraft.selectionDefaultModel || ""}
              list="selection-model-options"
              placeholder={selectedProvider?.defaultModel || "自动选择"}
              disabled={loading || !settingsDraft.selectionDefaultProviderId}
              onChange={(event) => setSettingsDraft((draft) => ({ ...draft, selectionDefaultModel: event.target.value }))}
            />
            <datalist id="selection-model-options">
              {modelOptionsForProvider(selectedProvider).map((option) => (
                <option key={option.value} value={option.value} />
              ))}
            </datalist>
          </label>
        </div>
      </WorkbenchSection>

      <WorkbenchSection title="动作模板" description="短名建议使用两个汉字。Prompt 模板使用 {{selection}} 插入选中文字。">
        <div className="selection-action-list">
          {actions.map((action, index) => {
            const warning = selectionTemplateWarning(action.promptTemplate);
            return (
              <div className="selection-action-editor" key={action.id}>
                <div className="selection-action-editor-head">
                  <GripVertical size={14} />
                  <Badge tone={action.enabled ? "success" : "muted"}>{action.enabled ? "启用" : "停用"}</Badge>
                  {warning ? <Badge tone="warning"><AlertTriangle size={12} /> 模板提示</Badge> : null}
                  <div className="selection-action-order">
                    <Button type="button" variant="outline" size="sm" disabled={index === 0} onClick={() => moveAction(action.id, -1)}>上移</Button>
                    <Button type="button" variant="outline" size="sm" disabled={index === actions.length - 1} onClick={() => moveAction(action.id, 1)}>下移</Button>
                  </div>
                </div>
                <div className="two-col">
                  <label className="field-stack">
                    <span>短名</span>
                    <Input value={action.label} maxLength={4} onChange={(event) => updateAction(action.id, { label: event.target.value })} />
                  </label>
                  <label className="field-stack">
                    <span>描述</span>
                    <Input value={action.description} onChange={(event) => updateAction(action.id, { description: event.target.value })} />
                  </label>
                </div>
                <label className="field-stack">
                  <span>Prompt 模板</span>
                  <Textarea value={action.promptTemplate} onChange={(event) => updateAction(action.id, { promptTemplate: event.target.value })} />
                  {warning ? <span className="form-hint">{warning}</span> : null}
                </label>
                <label className="settings-checks">
                  <input type="checkbox" checked={action.enabled} onChange={(event) => updateAction(action.id, { enabled: event.target.checked })} />
                  <span>在 Selection 动作条中显示</span>
                </label>
              </div>
            );
          })}
        </div>
      </WorkbenchSection>

      <div className="portal-child-actions">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => setSettingsDraft((draft) => ({ ...draft, selectionActions: DEFAULT_SELECTION_ACTIONS }))}
        >
          <RotateCcw size={15} /> 恢复默认动作
        </Button>
        <Button type="button" disabled={saving} onClick={onSave}>
          <Save size={15} /> {saving ? "保存中..." : "保存"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire `PortalPage.tsx`**

Update imports:

```ts
import {
  DEFAULT_SELECTION_REASONING_EFFORT,
  DEFAULT_SELECTION_SHORTCUT,
  normalizeSelectionActions,
} from "../utils/selectionActions";
import PortalSelectionSettings from "./portal/PortalSelectionSettings";
```

Update types:

```ts
type PortalSubTab = "usage" | "sessions" | "selection" | "quickAsk" | "mainApp";
type ShortcutRecordingTarget = "quickAsk" | "mainApp" | "selection";
```

Add tab between Sessions and Quick Ask:

```ts
  { id: "selection", label: "Selection" },
```

Update `defaultSettings`:

```ts
  selectionShortcut: DEFAULT_SELECTION_SHORTCUT,
  selectionReasoningEffort: DEFAULT_SELECTION_REASONING_EFFORT,
  selectionActions: DEFAULT_SELECTION_ACTIONS,
```

Update shortcut recording handler:

```ts
      setSettingsDraft((draft) => {
        if (recordingShortcutTarget === "quickAsk") return { ...draft, portalShortcut: shortcut };
        if (recordingShortcutTarget === "selection") return { ...draft, selectionShortcut: shortcut };
        return { ...draft, mainWindowShortcut: shortcut };
      });
```

Update save settings:

```ts
        selectionShortcut: settingsDraft.selectionShortcut?.trim() || DEFAULT_SELECTION_SHORTCUT,
        selectionDefaultWorkspaceId: settingsDraft.selectionDefaultWorkspaceId || undefined,
        selectionDefaultProviderId: settingsDraft.selectionDefaultProviderId || undefined,
        selectionDefaultModel: settingsDraft.selectionDefaultProviderId
          ? settingsDraft.selectionDefaultModel?.trim() || undefined
          : undefined,
        selectionReasoningEffort: settingsDraft.selectionReasoningEffort || DEFAULT_SELECTION_REASONING_EFFORT,
        selectionActions: normalizeSelectionActions(settingsDraft.selectionActions),
```

Add render branch before Quick Ask:

```tsx
      ) : portalSubTab === "selection" ? (
        <PortalSelectionSettings
          settingsDraft={settingsDraft}
          models={models}
          providerOptions={providerOptions}
          selectedProvider={models.find((model) => model.id === settingsDraft.selectionDefaultProviderId)}
          loading={loading}
          saving={saving}
          recordingShortcut={recordingShortcutTarget === "selection"}
          onToggleShortcutRecording={() => setRecordingShortcutTarget(
            recordingShortcutTarget === "selection" ? undefined : "selection",
          )}
          setSettingsDraft={setSettingsDraft}
          onSave={() => void savePortalSettings()}
        />
```

- [ ] **Step 5: Run Portal layout test**

Run:

```bash
pnpm test src/pages/PortalPage.layout.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add src/pages/PortalPage.tsx src/pages/portal/PortalSelectionSettings.tsx src/pages/PortalPage.layout.test.ts
git commit -m "feat: add portal selection settings"
```

## Task 5: Selection Window Renderer

**Files:**
- Create: `src/pages/SelectionWindow.tsx`
- Modify: `src/app/App.tsx`
- Create: `src/pages/SelectionWindow.layout.test.ts`
- Modify: `src/styles/theme.css`

- [ ] **Step 1: Add failing layout test**

Create `src/pages/SelectionWindow.layout.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("SelectionWindow layout", () => {
  it("routes a standalone Selection window and keeps the two-phase UI", () => {
    const appSource = readProjectFile("src/app/App.tsx");
    const source = readProjectFile("src/pages/SelectionWindow.tsx");
    const css = readProjectFile("src/styles/theme.css");

    expect(appSource).toContain('get("selection") === "window"');
    expect(appSource).toContain("<SelectionWindow");
    expect(source).toContain("selection-liquid-bar");
    expect(source).toContain("selection-result-panel");
    expect(source).toContain("selectionRunAction");
    expect(source).toContain("onSelectionEvent");
    expect(source).toContain("wheel");
    expect(source).toContain("ArrowRight");
    expect(source).toContain("ArrowLeft");
    expect(source).toContain("prefers-reduced-motion");
    expect(css).toContain(".selection-window-root");
    expect(css).toContain("backdrop-filter");
    expect(css).toContain(".selection-liquid-bar");
    expect(css).toContain(".selection-result-panel");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test src/pages/SelectionWindow.layout.test.ts
```

Expected: FAIL because `SelectionWindow.tsx` is missing.

- [ ] **Step 3: Create Selection window component**

Create `src/pages/SelectionWindow.tsx` with this structure:

```tsx
import { Clipboard, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { desktopApi, errorMessage } from "../services/desktopApi";
import type { AppSettings, ModelConfig, SelectionAction, SelectionEvent } from "../types";
import { enabledSelectionActions, resolveSelectionDefaults } from "../utils/selectionActions";

type SelectionPhase = "actions" | "result";
type RunStatus = "idle" | "running" | "completed" | "failed";

const defaultSettings: AppSettings = {
  gitCommand: "git",
};

export default function SelectionWindow() {
  const params = new URLSearchParams(window.location.search);
  const initialText = params.get("text") || "";
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [selectedText, setSelectedText] = useState(initialText);
  const [phase, setPhase] = useState<SelectionPhase>("actions");
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [activeActionId, setActiveActionId] = useState<string>();
  const [activeIndex, setActiveIndex] = useState(0);
  const [result, setResult] = useState("");
  const [error, setError] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const runIdRef = useRef<string>();
  const actionsRef = useRef<HTMLDivElement | null>(null);

  const defaults = useMemo(() => resolveSelectionDefaults(settings, models), [models, settings]);
  const actions = useMemo(() => enabledSelectionActions(defaults.actions), [defaults.actions]);
  const activeAction = actions.find((action) => action.id === activeActionId) || actions[activeIndex] || actions[0];

  useEffect(() => {
    void loadData();
    let unsubscribe: (() => void) | undefined;
    void desktopApi.onSelectionEvent(handleSelectionEvent).then((next) => {
      unsubscribe = next;
    });
    return () => unsubscribe?.();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (expanded) setExpanded(false);
        else void desktopApi.selectionHide();
        return;
      }
      if (phase !== "actions") return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, actions.length - 1));
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (activeAction) void runAction(activeAction);
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [actions.length, activeAction, expanded, phase]);

  async function loadData() {
    try {
      const [nextSettings, nextModels] = await Promise.all([
        desktopApi.getSettings(),
        desktopApi.modelProviderList(),
      ]);
      setSettings(nextSettings);
      setModels(nextModels);
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }

  function handleSelectionEvent(event: SelectionEvent) {
    if (event.runId !== runIdRef.current) return;
    if (event.event === "selection.delta") {
      const delta = (event.payload as { delta?: string })?.delta || "";
      setResult((current) => current + delta);
    } else if (event.event === "selection.completed") {
      setRunStatus("completed");
    } else if (event.event === "selection.failed") {
      setRunStatus("failed");
      setError(errorMessage(event.payload));
    }
  }

  function handleActionWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!actionsRef.current || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    actionsRef.current.scrollLeft += event.deltaY;
  }

  async function runAction(action: SelectionAction) {
    const input = selectedText.trim();
    setActiveActionId(action.id);
    setPhase("result");
    setRunStatus("running");
    setResult("");
    setError(undefined);
    if (!input) {
      setRunStatus("failed");
      setError("没有读取到选中文字，请粘贴或输入文本后重试。");
      return;
    }
    try {
      const run = await desktopApi.selectionRunAction({
        actionId: action.id,
        selectedText: input,
        providerId: defaults.providerId,
        model: defaults.model,
        reasoningEffort: defaults.reasoningEffort,
      });
      runIdRef.current = run.runId;
    } catch (runError) {
      setRunStatus("failed");
      setError(errorMessage(runError));
    }
  }

  async function copyResult() {
    await navigator.clipboard.writeText(result || error || selectedText);
  }

  return (
    <main className={`selection-window-root ${phase === "result" ? "is-result" : "is-actions"} ${expanded ? "is-expanded" : ""}`}>
      <section className="selection-window-surface" aria-label="Selection">
        {phase === "actions" ? (
          <div className="selection-liquid-bar" onWheel={handleActionWheel} ref={actionsRef}>
            {actions.map((action, index) => (
              <button
                type="button"
                className={`selection-action-chip ${index === activeIndex ? "is-active" : ""}`}
                key={action.id}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => void runAction(action)}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="selection-result-panel">
            <header className="selection-result-header">
              <strong>Selection</strong>
              <span>{runStatus === "running" ? `${activeAction?.label || "动作"}中` : runStatus === "completed" ? `${activeAction?.label || "动作"}完成` : "Selection"}</span>
              <button type="button" aria-label="关闭 Selection" onClick={() => void desktopApi.selectionHide()}><X size={13} /></button>
            </header>
            <div className="selection-action-row" onWheel={handleActionWheel} ref={actionsRef}>
              {actions.map((action, index) => (
                <button
                  type="button"
                  className={`selection-action-chip ${action.id === activeAction?.id ? "is-active" : ""}`}
                  key={action.id}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => void runAction(action)}
                >
                  {action.label}
                </button>
              ))}
            </div>
            <div className="selection-result-box">
              {runStatus === "running" ? <div className="selection-progress-line" aria-hidden="true" /> : null}
              <div className="selection-result-label">{runStatus === "running" ? "RUNNING" : "RESULT"}</div>
              {runStatus === "running" && !result ? (
                <div className="selection-skeleton" aria-hidden="true"><span /><span /><span /></div>
              ) : error ? (
                <p className="selection-error">{error}</p>
              ) : (
                <MarkdownRenderer content={result || "等待结果..."} streaming={runStatus === "running"} />
              )}
            </div>
            {sourceOpen ? (
              <label className="selection-source-editor">
                <span>原文</span>
                <Textarea value={selectedText} onChange={(event) => setSelectedText(event.target.value)} />
              </label>
            ) : null}
            <footer className="selection-result-footer">
              <span>原文 {selectedText.trim().length} 字</span>
              <div>
                <button type="button" onClick={() => void copyResult()}><Clipboard size={12} /> 复制</button>
                <button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "收起" : "展开"}</button>
                <button type="button" onClick={() => setSourceOpen((value) => !value)}>原文</button>
              </div>
            </footer>
          </div>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Route Selection window**

In `src/app/App.tsx`, import:

```ts
import SelectionWindow from "../pages/SelectionWindow";
```

Add:

```ts
  const isSelectionWindow = new URLSearchParams(window.location.search).get("selection") === "window";
```

Before Portal capsule return:

```tsx
  if (isSelectionWindow) {
    return <SelectionWindow />;
  }
```

- [ ] **Step 5: Add styles**

Append to `src/styles/theme.css`:

```css
.selection-window-root {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 0;
  background: transparent;
  color: var(--text);
  box-sizing: border-box;
}

.selection-window-surface {
  width: max-content;
  max-width: 100vw;
}

.selection-liquid-bar,
.selection-result-panel {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--panel) 58%, transparent), color-mix(in srgb, var(--panel) 24%, transparent)),
    radial-gradient(circle at 18% 0%, color-mix(in srgb, #ffffff 62%, transparent), transparent 34%),
    radial-gradient(circle at 100% 100%, color-mix(in srgb, var(--focus) 18%, transparent), transparent 42%);
  border: 1px solid color-mix(in srgb, #ffffff 42%, transparent);
  box-shadow:
    0 18px 42px color-mix(in srgb, #020617 24%, transparent),
    inset 0 1px 0 color-mix(in srgb, #ffffff 74%, transparent),
    inset 0 -1px 0 color-mix(in srgb, #ffffff 18%, transparent);
  backdrop-filter: blur(30px) saturate(1.8) brightness(1.05);
}

.selection-liquid-bar {
  width: 296px;
  height: 44px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  animation: selection-bar-in 160ms cubic-bezier(0.18, 0.88, 0.22, 1) both;
}

.selection-liquid-bar::-webkit-scrollbar,
.selection-action-row::-webkit-scrollbar {
  display: none;
}

.selection-action-chip {
  flex: 0 0 52px;
  height: 32px;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, #ffffff 13%, transparent);
  color: color-mix(in srgb, var(--text) 74%, transparent);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.selection-action-chip.is-active,
.selection-action-chip:hover {
  background: color-mix(in srgb, #ffffff 34%, transparent);
  color: var(--text);
}

.selection-result-panel {
  width: 380px;
  border-radius: 18px;
  overflow: hidden;
  animation: selection-panel-open 340ms cubic-bezier(0.18, 0.88, 0.22, 1) both;
}

.selection-result-header {
  height: 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 13px;
  border-bottom: 1px solid color-mix(in srgb, #ffffff 34%, transparent);
}

.selection-result-header strong {
  font-size: 12px;
}

.selection-result-header span {
  margin-left: auto;
  color: var(--muted);
  font-size: 11px;
}

.selection-result-header button {
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
}

.selection-action-row {
  height: 42px;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 10px 11px 0;
  scrollbar-width: none;
}

.selection-result-box {
  position: relative;
  min-height: 86px;
  max-height: 220px;
  margin: 9px 11px;
  padding: 10px;
  border-radius: 13px;
  overflow: auto;
  background: color-mix(in srgb, var(--panel) 34%, transparent);
  border: 1px solid color-mix(in srgb, #ffffff 34%, transparent);
}

.selection-window-root.is-expanded .selection-result-box {
  min-height: 220px;
}

.selection-progress-line {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--focus), var(--accent), transparent);
  animation: selection-running-line 1150ms linear infinite;
}

.selection-result-label {
  color: var(--muted);
  font-size: 10px;
  letter-spacing: 0.08em;
}

.selection-skeleton {
  display: grid;
  gap: 7px;
  margin-top: 9px;
}

.selection-skeleton span {
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 20%, transparent);
}

.selection-skeleton span:nth-child(1) { width: 94%; }
.selection-skeleton span:nth-child(2) { width: 78%; }
.selection-skeleton span:nth-child(3) { width: 58%; }

.selection-error {
  color: var(--danger);
  font-size: 13px;
}

.selection-source-editor {
  display: grid;
  gap: 6px;
  margin: 0 11px 9px;
  color: var(--muted);
  font-size: 11px;
}

.selection-result-footer {
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 11px 10px;
  color: var(--muted);
  font-size: 11px;
}

.selection-result-footer div {
  display: flex;
  gap: 9px;
}

.selection-result-footer button {
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  cursor: pointer;
}

@keyframes selection-bar-in {
  from { opacity: 0; transform: translateY(8px) scale(0.92); filter: blur(3px); }
  to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}

@keyframes selection-panel-open {
  from { opacity: 0; transform: translateY(0) scale(0.82, 0.24); filter: blur(7px); border-radius: 999px; }
  to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); border-radius: 18px; }
}

@keyframes selection-running-line {
  from { transform: translateX(-100%); }
  to { transform: translateX(100%); }
}

@media (prefers-reduced-motion: reduce) {
  .selection-liquid-bar,
  .selection-result-panel,
  .selection-progress-line {
    animation-duration: 1ms;
    animation-iteration-count: 1;
  }
}
```

- [ ] **Step 6: Run layout test**

Run:

```bash
pnpm test src/pages/SelectionWindow.layout.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/pages/SelectionWindow.tsx src/app/App.tsx src/pages/SelectionWindow.layout.test.ts src/styles/theme.css
git commit -m "feat: add selection window ui"
```

## Task 6: Electron Selection Shortcut And Window

**Files:**
- Modify: `electron/main.ts`
- Create: `electron/selectionShortcut.test.ts`

- [ ] **Step 1: Add failing static wiring test**

Create `electron/selectionShortcut.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

describe("Selection shortcut wiring", () => {
  it("registers a global shortcut and opens a dedicated Selection window", () => {
    const source = readProjectFile("electron/main.ts");
    const preload = readProjectFile("electron/preload.ts");

    expect(source).toContain("selectionWindow");
    expect(source).toContain("registeredSelectionShortcut");
    expect(source).toContain("selectionShortcut()");
    expect(source).toContain("registerSelectionShortcut");
    expect(source).toContain("showSelectionWindow");
    expect(source).toContain("createSelectionWindow");
    expect(source).toContain('query.set("selection", "window")');
    expect(source).toContain("selection_window_show");
    expect(source).toContain("selection_window_hide");
    expect(source).toContain("selection_shortcut_reregister");
    expect(source).toContain("readSelectedText");
    expect(source).toContain("clipboard.readText");
    expect(source).toContain("globalShortcut.register(shortcut");
    expect(source).toContain("selection-event");
    expect(preload).toContain("onSelectionEvent");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test electron/selectionShortcut.test.ts
```

Expected: FAIL because Selection window wiring is missing.

- [ ] **Step 3: Update Electron imports and globals**

In `electron/main.ts`, extend import:

```ts
import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, safeStorage, shell } from "electron";
```

Add globals near Portal window globals:

```ts
let selectionWindow: BrowserWindow | undefined;
let registeredSelectionShortcut: string | undefined;
```

- [ ] **Step 4: Add shortcut helpers**

Add near `portalShortcut()`:

```ts
function selectionShortcut() {
  return settings?.get().selectionShortcut?.trim() || "CommandOrControl+Shift+S";
}
```

Add register helper:

```ts
function registerSelectionShortcut() {
  if (registeredSelectionShortcut) {
    globalShortcut.unregister(registeredSelectionShortcut);
    registeredSelectionShortcut = undefined;
  }
  const shortcut = selectionShortcut();
  if (!shortcut) return true;
  let ok = false;
  try {
    ok = globalShortcut.register(shortcut, () => {
      void showSelectionWindow();
    });
  } catch {
    ok = false;
  }
  if (ok) registeredSelectionShortcut = shortcut;
  return ok;
}
```

Update `registerGlobalShortcuts()`:

```ts
  const selectionRegistered = registerSelectionShortcut();
  return portalRegistered && mainWindowRegistered && selectionRegistered;
```

- [ ] **Step 5: Add selected text reader**

Add helper near window helpers:

```ts
async function readSelectedText() {
  const previousText = clipboard.readText();
  try {
    const script = `tell application "System Events" to keystroke "c" using command down`;
    spawnSync("osascript", ["-e", script], { encoding: "utf8", timeout: 1200 });
    await new Promise((resolve) => setTimeout(resolve, 90));
    const selected = clipboard.readText();
    return selected.trim() && selected !== previousText ? selected : selected.trim();
  } finally {
    if (previousText) {
      setTimeout(() => clipboard.writeText(previousText), 120);
    }
  }
}
```

- [ ] **Step 6: Add Selection window lifecycle**

Add near Portal window functions:

```ts
function createSelectionWindow(selectedText = "") {
  if (selectionWindow && !selectionWindow.isDestroyed()) return selectionWindow;
  const win = new BrowserWindow({
    width: 420,
    height: 220,
    minWidth: 320,
    minHeight: 80,
    title: "Any Jumper Selection",
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    show: false,
    webPreferences: {
      preload: path.join(mainDir, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  selectionWindow = win;
  windows.add(win);
  attachExternalLinkHandlers(win);
  win.on("blur", () => {
    if (!win.isDestroyed()) win.hide();
  });
  win.on("closed", () => {
    windows.delete(win);
    if (selectionWindow === win) selectionWindow = undefined;
  });

  const query = new URLSearchParams();
  query.set("selection", "window");
  if (selectedText) query.set("text", selectedText);
  if (process.env.VITE_DEV_SERVER_URL || !app.isPackaged) {
    void win.loadURL(`${DEV_URL}?${query}`);
  } else {
    void win.loadFile(path.join(mainDir, "../dist/index.html"), { query: Object.fromEntries(query) });
  }
  return win;
}

async function showSelectionWindow() {
  const selectedText = await readSelectedText().catch(() => "");
  const win = selectionWindow && !selectionWindow.isDestroyed()
    ? selectionWindow
    : createSelectionWindow(selectedText);
  if (selectionWindow && !selectionWindow.isDestroyed() && selectionWindow === win) {
    const query = new URLSearchParams();
    query.set("selection", "window");
    if (selectedText) query.set("text", selectedText);
    if (process.env.VITE_DEV_SERVER_URL || !app.isPackaged) {
      void win.loadURL(`${DEV_URL}?${query}`);
    } else {
      void win.loadFile(path.join(mainDir, "../dist/index.html"), { query: Object.fromEntries(query) });
    }
  }
  win.center();
  win.show();
  win.moveTop();
  win.focus();
}

function hideSelectionWindow() {
  if (selectionWindow && !selectionWindow.isDestroyed()) selectionWindow.hide();
}
```

- [ ] **Step 7: Add IPC cases**

In IPC switch:

```ts
        case "selection_shortcut_reregister": return registerSelectionShortcut();
        case "selection_window_show": return showSelectionWindow();
        case "selection_window_hide": return hideSelectionWindow();
```

- [ ] **Step 8: Run static test**

Run:

```bash
pnpm test electron/selectionShortcut.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 6**

```bash
git add electron/main.ts electron/selectionShortcut.test.ts
git commit -m "feat: add selection shortcut window"
```

## Task 7: Selection Model Run And Streaming Events

**Files:**
- Modify: `electron/main.ts`
- Modify: `electron/selectionShortcut.test.ts`

- [ ] **Step 1: Add failing test expectations for model run**

Extend `electron/selectionShortcut.test.ts`:

```ts
  it("runs Selection actions without creating conversation threads", () => {
    const source = readProjectFile("electron/main.ts");

    expect(source).toContain("runSelectionAction");
    expect(source).toContain("emitSelectionEvent");
    expect(source).toContain('case "selection_run_action": return runSelectionAction(args.request);');
    expect(source).toContain("createChatModel");
    expect(source).toContain("selection.delta");
    expect(source).toContain("selection.completed");
    expect(source).not.toContain("selection_run_action\": return storage.createThread");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test electron/selectionShortcut.test.ts
```

Expected: FAIL because model run is not implemented.

- [ ] **Step 3: Add event emitter**

Add near `emitAgentEvent`:

```ts
function emitSelectionEvent(event: { runId: string; event: string; payload?: unknown }) {
  const payload = { ...event, createdAt: nowMillis() };
  for (const win of windows) {
    if (!win.isDestroyed()) win.webContents.send("selection-event", payload);
  }
}
```

- [ ] **Step 4: Add action resolver and run function**

Add near model helpers:

```ts
const DEFAULT_SELECTION_ACTIONS_MAIN = [
  {
    id: "selection-explain",
    promptTemplate: "请用简洁中文解释下面这段内容，必要时补充背景，但不要扩写过度：\\n\\n{{selection}}",
  },
  {
    id: "selection-summary",
    promptTemplate: "请提炼下面这段内容的关键要点，使用简洁中文列出：\\n\\n{{selection}}",
  },
  {
    id: "selection-translate",
    promptTemplate: "请将下面内容翻译成自然、准确的中文，保留原意：\\n\\n{{selection}}",
  },
  {
    id: "selection-polish",
    promptTemplate: "请润色下面这段内容，让表达更清楚自然，不改变原意：\\n\\n{{selection}}",
  },
  {
    id: "selection-shorten",
    promptTemplate: "请压缩下面这段内容，保留核心信息，让表达更短：\\n\\n{{selection}}",
  },
  {
    id: "selection-check",
    promptTemplate: "请检查下面这段内容是否存在明显错误、矛盾、风险或遗漏，并用中文简要说明：\\n\\n{{selection}}",
  },
];

function selectionActionPrompt(actionId: string, selectedText: string) {
  const configured = settings.get().selectionActions?.find((action: any) => action.id === actionId);
  const fallback = DEFAULT_SELECTION_ACTIONS_MAIN.find((action) => action.id === actionId) || DEFAULT_SELECTION_ACTIONS_MAIN[0];
  const template = configured?.promptTemplate || fallback.promptTemplate;
  return template.replaceAll("{{selection}}", selectedText);
}

function selectSelectionModel(request: any) {
  const appSettings = settings.get();
  const providerId = request.providerId || appSettings.selectionDefaultProviderId;
  const provider = providerId ? storage.getModelConfig(providerId) : storage.listModelConfigs().find((item) => item.enabled && item.id !== "mock") || storage.listModelConfigs()[0];
  if (!provider) throw new AppError("UNKNOWN_ERROR", "请先配置可用模型");
  validateModelProvider(provider);
  const model = request.model || appSettings.selectionDefaultModel || provider.defaultModel;
  return { provider, model };
}

async function runSelectionAction(request: any) {
  const runId = randomUUID();
  const selectedText = String(request.selectedText || "").trim();
  if (!selectedText) throw new AppError("UNKNOWN_ERROR", "没有读取到选中文字");
  const { provider, model } = selectSelectionModel(request);
  if (provider.providerKind !== "mock" && provider.providerKind !== "ollama" && !secrets.get(`ai-model-api-key-${provider.id}`)) {
    throw new AppError("TOKEN_MISSING", `请先为 ${provider.displayName} 配置 API Key`);
  }
  const prompt = selectionActionPrompt(String(request.actionId || ""), selectedText);
  emitSelectionEvent({ runId, event: "selection.started", payload: { actionId: request.actionId } });
  void (async () => {
    try {
      const chat = createChatModel(provider, model);
      const stream = await chat.stream([{ role: "user", content: prompt }] as any);
      for await (const chunk of stream as any) {
        const delta = typeof chunk?.content === "string" ? chunk.content : "";
        if (delta) emitSelectionEvent({ runId, event: "selection.delta", payload: { delta } });
      }
      emitSelectionEvent({ runId, event: "selection.completed" });
    } catch (error) {
      emitSelectionEvent({ runId, event: "selection.failed", payload: normalizeError(error) });
    }
  })();
  return { runId, status: "started" };
}
```

If `chat.stream` is not supported by the existing LangChain model instance, use `await chat.invoke(...)` and emit one `selection.delta` with the final content before `selection.completed`.

- [ ] **Step 5: Add IPC case**

In IPC switch:

```ts
        case "selection_run_action": return runSelectionAction(args.request);
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm test electron/selectionShortcut.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 7**

```bash
git add electron/main.ts electron/selectionShortcut.test.ts
git commit -m "feat: run selection prompt actions"
```

## Task 8: Liquid Glass Polish And Portal Styling

**Files:**
- Modify: `src/styles/theme.css`
- Modify: `src/pages/SelectionWindow.layout.test.ts`
- Modify: `src/pages/PortalPage.layout.test.ts`

- [ ] **Step 1: Add style assertions**

In `src/pages/SelectionWindow.layout.test.ts`, add:

```ts
    expect(css).toContain("selection-panel-open");
    expect(css).toContain("selection-bar-in");
    expect(css).toContain("saturate(1.8)");
    expect(css).toContain("color-mix");
```

In `src/pages/PortalPage.layout.test.ts`, add:

```ts
    expect(readProjectFile("src/styles/theme.css")).toContain(".selection-action-editor");
```

- [ ] **Step 2: Run style tests**

Run:

```bash
pnpm test src/pages/SelectionWindow.layout.test.ts src/pages/PortalPage.layout.test.ts
```

Expected: FAIL until portal action editor CSS is added.

- [ ] **Step 3: Add Portal action editor styles**

Append to `src/styles/theme.css`:

```css
.selection-settings-panel .selection-action-list {
  display: grid;
  gap: 12px;
}

.selection-action-editor {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--panel-soft) 72%, transparent);
}

.selection-action-editor-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.selection-action-order {
  margin-left: auto;
  display: flex;
  gap: 6px;
}
```

- [ ] **Step 4: Run style tests**

Run:

```bash
pnpm test src/pages/SelectionWindow.layout.test.ts src/pages/PortalPage.layout.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 8**

```bash
git add src/styles/theme.css src/pages/SelectionWindow.layout.test.ts src/pages/PortalPage.layout.test.ts
git commit -m "style: polish selection liquid glass"
```

## Task 9: Full Verification

**Files:**
- No source edits unless verification exposes a defect.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm test src/utils/selectionActions.test.ts src/services/desktopApi.test.ts src/pages/PortalPage.layout.test.ts src/pages/SelectionWindow.layout.test.ts electron/selectionShortcut.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Run full test suite**

Run:

```bash
pnpm test
```

Expected: PASS. If unrelated pre-existing failures appear, capture the exact failing test names and confirm whether they predate this branch.

- [ ] **Step 4: Run production build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Manual smoke check in app**

Run:

```bash
pnpm dev
```

Manual checks:

- Portal shows `Selection` between `Sessions` and `Quick Ask`.
- Selection settings can save shortcut, provider, model, reasoning, and action changes.
- Opening `http://localhost:5173?selection=window&text=hello` shows Liquid Glass action bar.
- Clicking `解释` expands to result panel.
- Action row supports horizontal wheel scrolling.
- `复制` copies result text.
- `展开` increases result area.
- `原文` shows selected text editor.
- `Esc` closes or collapses according to current state.

- [ ] **Step 6: Final commit if verification fixes were needed**

If Step 1-5 required follow-up edits:

```bash
git add <changed-files>
git commit -m "fix: stabilize selection verification"
```

Expected: working tree only contains unrelated user changes.

## Self-Review Notes

- Spec coverage: plan covers Portal configuration, global shortcut, selected-text capture, Liquid Glass action bar, Balanced result panel, prompt template actions, direct model invocation, independent `selection-event`, and verification.
- Scope control: plan excludes text replacement, per-action shortcuts, session creation, shell/URL/plugin actions, and precise selected-text geometry.
- Type consistency: renderer API uses `SelectionRunRequest`, `SelectionRunResult`, and `SelectionEvent` from `src/types/index.ts`; event names match the spec.
- Known implementation caution: Electron selected-text capture uses clipboard plus `osascript` on macOS. Preserve clipboard best effort and keep failure non-blocking.

## Execution Handoff

The goal has already been created for this implementation. Execute this plan task-by-task using `superpowers:subagent-driven-development` or `superpowers:executing-plans`, committing after each task.
