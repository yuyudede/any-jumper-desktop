import type { AppSettings, ModelConfig, Workspace } from "../types";
import { defaultModelForProvider } from "./modelProviders";

export const DEFAULT_PORTAL_SHORTCUT = "CommandOrControl+Shift+J";
export const DEFAULT_MAIN_WINDOW_SHORTCUT = "";
export const DEFAULT_PORTAL_REASONING_EFFORT = "medium";

export interface PortalDefaults {
  shortcut: string;
  workspaceId?: string;
  providerId?: string;
  model?: string;
  reasoningEffort: string;
}

export function resolvePortalDefaults(
  settings: AppSettings,
  providers: ModelConfig[],
  workspaces: Workspace[],
): PortalDefaults {
  const workspace = settings.portalDefaultWorkspaceId
    ? workspaces.find((item) => item.id === settings.portalDefaultWorkspaceId)
    : undefined;
  const provider = settings.portalDefaultProviderId
    ? providers.find((item) => item.id === settings.portalDefaultProviderId)
    : undefined;
  const fallbackProvider = providers.find((item) => item.enabled && item.id !== "mock") || providers[0];
  const selectedProvider = provider || fallbackProvider;

  return {
    shortcut: settings.portalShortcut?.trim() || DEFAULT_PORTAL_SHORTCUT,
    workspaceId: (workspace || workspaces[0])?.id,
    providerId: selectedProvider?.id,
    model: selectedProvider
      ? defaultModelForProvider(selectedProvider, settings.portalDefaultModel || selectedProvider.defaultModel)
      : undefined,
    reasoningEffort: settings.portalReasoningEffort?.trim() || DEFAULT_PORTAL_REASONING_EFFORT,
  };
}
