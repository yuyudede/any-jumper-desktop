import { describe, expect, it } from "vitest";
import { defaultModelForProvider, modelOptionsForProvider, resolveProviderModelSelection } from "./modelProviders";

describe("modelOptionsForProvider", () => {
  it("includes current DeepSeek V4 model presets for the built-in provider", () => {
    const options = modelOptionsForProvider({
      id: "deepseek",
      providerKind: "openai-compatible",
      defaultModel: "deepseek-chat",
      models: [],
    }).map((option) => option.value);

    expect(options).toContain("deepseek-v4-flash");
    expect(options).toContain("deepseek-v4-pro");
  });

  it("includes current DeepSeek V4 model presets for OpenAI-compatible providers", () => {
    const options = modelOptionsForProvider({
      providerKind: "openai-compatible",
      defaultModel: "gpt-4.1-mini",
      models: [],
    }).map((option) => option.value);

    expect(options).toContain("deepseek-v4-flash");
    expect(options).toContain("deepseek-v4-pro");
  });

  it("includes current DeepSeek V4 model presets for Anthropic-compatible providers", () => {
    const options = modelOptionsForProvider({
      providerKind: "anthropic-compatible",
      defaultModel: "claude-sonnet-4-5",
      models: [],
    }).map((option) => option.value);

    expect(options).toContain("deepseek-v4-flash");
    expect(options).toContain("deepseek-v4-pro");
  });

  it("uses configured models as the selected provider model list", () => {
    const provider = {
      id: "xiaomi",
      providerKind: "openai-compatible",
      defaultModel: "mimo-v2.5-pro",
      models: ["mimo-v2.5-pro", "mimo-v2.5"],
    };

    const options = modelOptionsForProvider(provider).map((option) => option.value);

    expect(options).toEqual(["mimo-v2.5-pro", "mimo-v2.5"]);
    expect(defaultModelForProvider(provider, "deepseek-v4-pro")).toBe("mimo-v2.5-pro");
  });

  it("resolves draft selection from the selected provider", () => {
    const selection = resolveProviderModelSelection([
      {
        id: "deepseek",
        providerKind: "openai-compatible",
        defaultModel: "deepseek-chat",
        models: ["deepseek-chat", "deepseek-v4-pro"],
      },
      {
        id: "xiaomi",
        providerKind: "openai-compatible",
        defaultModel: "mimo-v2.5-pro",
        models: ["mimo-v2.5-pro", "mimo-v2.5"],
      },
    ], "xiaomi", "deepseek-v4-pro");

    expect(selection.provider?.id).toBe("xiaomi");
    expect(selection.modelOptions.map((option) => option.value)).toEqual(["mimo-v2.5-pro", "mimo-v2.5"]);
    expect(selection.model).toBe("mimo-v2.5-pro");
  });
});
