import type { AppSettings, ModelConfig } from "../types";
import { defaultModelForProvider } from "./modelProviders";

interface RuntimeModelDefaults {
  runtimeId: string;
  providerId: string;
  model: string;
}

export function resolveNewSessionModelDefaults(
  settings: AppSettings,
  providers: ModelConfig[],
  fallback: RuntimeModelDefaults,
): RuntimeModelDefaults {
  const configuredProvider = settings.defaultNewSessionProviderId
    ? providers.find((provider) => provider.id === settings.defaultNewSessionProviderId)
    : undefined;
  if (!configuredProvider) return fallback;

  return {
    ...fallback,
    providerId: configuredProvider.id,
    model: defaultModelForProvider(configuredProvider, settings.defaultNewSessionModel || configuredProvider.defaultModel),
  };
}
