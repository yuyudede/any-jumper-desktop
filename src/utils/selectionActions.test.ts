import { describe, expect, it } from "vitest";
import type { AppSettings, SelectionAction } from "../types";
import {
  DEFAULT_SELECTION_ACTIONS,
  DEFAULT_SELECTION_REASONING_EFFORT,
  DEFAULT_SELECTION_SHORTCUT,
  enabledSelectionActions,
  normalizeSelectionActions,
  renderSelectionPrompt,
  resolveSelectionDefaults,
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

    expect(actions.map((action) => action.label)).toEqual(["翻译", "总结", "润色", "改短", "查错"]);
  });

  it("renders selected text into prompt templates", () => {
    expect(renderSelectionPrompt("解释：{{selection}}", "hello")).toBe("解释：hello");
    expect(renderSelectionPrompt("{{selection}}\n{{selection}}", "abc")).toBe("abc\nabc");
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
