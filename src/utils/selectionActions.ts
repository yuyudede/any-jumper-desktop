import type { AppSettings, ModelConfig, SelectionAction, SelectionDefaults } from "../types";
import { defaultModelForProvider } from "./modelProviders";

export const DEFAULT_SELECTION_SHORTCUT = "CommandOrControl+Shift+S";
export const DEFAULT_SELECTION_REASONING_EFFORT = "low";

export const DEFAULT_SELECTION_ACTIONS: SelectionAction[] = [
  {
    id: "selection-explain",
    label: "解释",
    description: "解释这段内容",
    promptTemplate: "请用简洁中文解释下面这段内容，必要时补充背景，但不要扩写过度：\n\n{{selection}}",
    enabled: true,
    order: 1,
  },
  {
    id: "selection-summary",
    label: "总结",
    description: "提炼要点",
    promptTemplate: "请提炼下面这段内容的关键要点，使用简洁中文列出：\n\n{{selection}}",
    enabled: true,
    order: 2,
  },
  {
    id: "selection-translate",
    label: "翻译",
    description: "翻译成中文",
    promptTemplate: "请将下面内容翻译成自然、准确的中文，保留原意：\n\n{{selection}}",
    enabled: true,
    order: 3,
  },
  {
    id: "selection-polish",
    label: "润色",
    description: "改写得更清楚自然",
    promptTemplate: "请润色下面这段内容，让表达更清楚自然，不改变原意：\n\n{{selection}}",
    enabled: true,
    order: 4,
  },
  {
    id: "selection-shorten",
    label: "改短",
    description: "压缩表达",
    promptTemplate: "请压缩下面这段内容，保留核心信息，让表达更短：\n\n{{selection}}",
    enabled: true,
    order: 5,
  },
  {
    id: "selection-check",
    label: "查错",
    description: "找潜在问题",
    promptTemplate: "请检查下面这段内容是否存在明显错误、矛盾、风险或遗漏，并用中文简要说明：\n\n{{selection}}",
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
