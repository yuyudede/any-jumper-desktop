import type { ModelConfig, ModelConfigRequest } from "../types";

export const DEEPAGENTS_RUNTIME_ID = "deepagents";

const providerModelPresets: Record<string, string[]> = {
  mock: ["mock-agent"],
  deepseek: [
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "deepseek-chat",
    "deepseek-reasoner",
  ],
  openai: [
    "gpt-4.1-mini",
    "gpt-4.1",
    "gpt-4o-mini",
    "gpt-4o",
  ],
  anthropic: [
    "claude-3-5-sonnet-latest",
    "claude-3-7-sonnet-latest",
    "claude-sonnet-4-5",
    "claude-opus-4-1",
  ],
  "anthropic-compatible": [
    "claude-3-5-sonnet-latest",
    "claude-3-7-sonnet-latest",
    "claude-sonnet-4-5",
    "claude-opus-4-1",
  ],
  ollama: [
    "llama3.1",
    "llama3.2",
    "qwen2.5-coder",
    "qwen2.5",
    "deepseek-r1",
    "codellama",
  ],
};

const providerKindModelPresets: Record<string, string[]> = {
  mock: providerModelPresets.mock,
  "openai-compatible": [
    "gpt-4.1-mini",
    "gpt-4.1",
    "gpt-4o-mini",
    "gpt-4o",
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "deepseek-chat",
    "deepseek-reasoner",
    "qwen-plus",
    "qwen-max",
  ],
  anthropic: providerModelPresets.anthropic,
  "anthropic-compatible": [
    ...providerModelPresets["anthropic-compatible"],
    "deepseek-v4-flash",
    "deepseek-v4-pro",
  ],
  ollama: providerModelPresets.ollama,
};

type ModelLike = Pick<ModelConfig | ModelConfigRequest, "providerKind" | "defaultModel"> & { id?: string };
type ModelWithList = ModelLike & { models?: string[] };

export function toModelRequest(model: ModelConfig): ModelConfigRequest {
  return {
    id: model.id,
    providerKind: model.providerKind,
    displayName: model.displayName,
    baseUrl: model.baseUrl,
    defaultModel: model.defaultModel,
    models: model.models,
    enabled: model.enabled,
  };
}

export function newOpenAiProviderDraft(): ModelConfigRequest {
  return {
    providerKind: "openai-compatible",
    displayName: "OpenAI Compatible",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1-mini",
    enabled: true,
  };
}

export function activeProviderKeyLabel(model?: ModelLike) {
  if (model?.providerKind === "anthropic") return "Anthropic API Key";
  if (model?.providerKind === "anthropic-compatible") return "Anthropic-Compatible API Key";
  if (model?.providerKind === "ollama" || model?.providerKind === "mock") return "API Key（可选）";
  return "OpenAI-Compatible API Key";
}

export function normalizeModelNames(models: Array<string | undefined>) {
  return Array.from(new Set(models.map((item) => item?.trim()).filter(Boolean) as string[]));
}

export function modelOptionsForProvider(model?: ModelWithList) {
  const options = new Set<string>();
  if (model?.defaultModel?.trim()) options.add(model.defaultModel.trim());
  for (const item of model?.models || []) {
    if (item.trim()) options.add(item.trim());
  }
  const presets = model?.id && providerModelPresets[model.id]
    ? providerModelPresets[model.id]
    : providerKindModelPresets[model?.providerKind || ""] || [];
  for (const item of presets) options.add(item);
  return Array.from(options).map((value) => ({ label: value, value }));
}

export function defaultModelForProvider(model?: ModelWithList, preferredModel?: string) {
  const modelOptions = modelOptionsForProvider(model).map((item) => item.value);
  if (preferredModel?.trim() && modelOptions.includes(preferredModel.trim())) return preferredModel.trim();
  if (model?.defaultModel?.trim()) return model.defaultModel.trim();
  return modelOptions[0] || "mock-agent";
}
