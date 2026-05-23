import { describe, expect, it } from "vitest";
import { modelOptionsForProvider } from "./modelProviders";

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
});
