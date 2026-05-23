import { describe, expect, it } from "vitest";
import type { AppSettings, ModelConfig } from "../types";
import { resolveNewSessionModelDefaults } from "./newSessionDefaults";

function provider(id: string, defaultModel: string, models: string[] = []): ModelConfig {
  return {
    id,
    providerKind: "openai-compatible",
    displayName: id,
    baseUrl: "https://example.com/v1",
    defaultModel,
    models,
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("resolveNewSessionModelDefaults", () => {
  it("uses configured provider and model for new sessions", () => {
    const settings: AppSettings = {
      gitCommand: "git",
      defaultNewSessionProviderId: "deepseek",
      defaultNewSessionModel: "deepseek-v4-pro",
    };

    const defaults = resolveNewSessionModelDefaults(
      settings,
      [provider("deepseek", "deepseek-chat", ["deepseek-v4-pro"])],
      { runtimeId: "deepagents", providerId: "mock", model: "mock-agent" },
    );

    expect(defaults).toEqual({
      runtimeId: "deepagents",
      providerId: "deepseek",
      model: "deepseek-v4-pro",
    });
  });

  it("falls back to workspace defaults when the configured provider is missing", () => {
    const settings: AppSettings = {
      gitCommand: "git",
      defaultNewSessionProviderId: "missing",
      defaultNewSessionModel: "missing-model",
    };

    const defaults = resolveNewSessionModelDefaults(
      settings,
      [provider("deepseek", "deepseek-chat")],
      { runtimeId: "deepagents", providerId: "deepseek", model: "deepseek-chat" },
    );

    expect(defaults).toEqual({
      runtimeId: "deepagents",
      providerId: "deepseek",
      model: "deepseek-chat",
    });
  });
});
