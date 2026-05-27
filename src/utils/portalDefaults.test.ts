import { describe, expect, it } from "vitest";
import type { AppSettings, ModelConfig, Workspace } from "../types";
import { DEFAULT_PORTAL_SHORTCUT, resolvePortalDefaults } from "./portalDefaults";
import { resolveSelectionDefaults } from "./selectionActions";

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

function workspace(id: string): Workspace {
  return {
    id,
    name: id,
    rootPath: `/tmp/${id}`,
    trustLevel: "trusted",
    defaultRuntimeId: "deepagents",
    defaultProviderId: "mock",
    defaultModel: "mock-agent",
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("resolvePortalDefaults", () => {
  it("uses configured Portal provider, model, reasoning and workspace", () => {
    const settings: AppSettings = {
      gitCommand: "git",
      portalShortcut: "CommandOrControl+Shift+P",
      portalDefaultWorkspaceId: "docs",
      portalDefaultProviderId: "deepseek",
      portalDefaultModel: "deepseek-v4-pro",
      portalReasoningEffort: "high",
    };

    const defaults = resolvePortalDefaults(
      settings,
      [provider("openai", "gpt-4.1-mini"), provider("deepseek", "deepseek-chat", ["deepseek-v4-pro"])],
      [workspace("app"), workspace("docs")],
    );

    expect(defaults).toEqual({
      shortcut: "CommandOrControl+Shift+P",
      workspaceId: "docs",
      providerId: "deepseek",
      model: "deepseek-v4-pro",
      reasoningEffort: "high",
    });
  });

  it("does not read new-session model defaults for Portal fallback", () => {
    const settings: AppSettings = {
      gitCommand: "git",
      defaultNewSessionProviderId: "deepseek",
      defaultNewSessionModel: "deepseek-v4-pro",
    };

    const defaults = resolvePortalDefaults(
      settings,
      [provider("openai", "gpt-4.1-mini"), provider("deepseek", "deepseek-chat", ["deepseek-v4-pro"])],
      [workspace("app")],
    );

    expect(defaults).toEqual({
      shortcut: DEFAULT_PORTAL_SHORTCUT,
      workspaceId: "app",
      providerId: "openai",
      model: "gpt-4.1-mini",
      reasoningEffort: "medium",
    });
  });

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
});
