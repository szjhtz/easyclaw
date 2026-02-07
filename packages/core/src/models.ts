/** Supported LLM providers. */
export type LLMProvider =
  | "openai"
  | "anthropic"
  | "deepseek"
  | "zhipu"
  | "moonshot"
  | "qwen";

/** A model configuration with provider and model ID. */
export interface ModelConfig {
  provider: LLMProvider;
  modelId: string;
  displayName: string;
}

/** Known regions. */
export type Region = "us" | "eu" | "cn" | (string & {});

/** All known models grouped by provider. */
export const KNOWN_MODELS: Record<LLMProvider, ModelConfig[]> = {
  openai: [
    { provider: "openai", modelId: "gpt-4o", displayName: "GPT-4o" },
    { provider: "openai", modelId: "gpt-4o-mini", displayName: "GPT-4o Mini" },
  ],
  anthropic: [
    { provider: "anthropic", modelId: "claude-sonnet-4-20250514", displayName: "Claude Sonnet 4" },
    { provider: "anthropic", modelId: "claude-haiku-3-5-20241022", displayName: "Claude 3.5 Haiku" },
  ],
  deepseek: [
    { provider: "deepseek", modelId: "deepseek-chat", displayName: "DeepSeek Chat" },
    { provider: "deepseek", modelId: "deepseek-reasoner", displayName: "DeepSeek Reasoner" },
  ],
  zhipu: [
    { provider: "zhipu", modelId: "glm-4-plus", displayName: "GLM-4 Plus" },
    { provider: "zhipu", modelId: "glm-4-flash", displayName: "GLM-4 Flash" },
  ],
  moonshot: [
    { provider: "moonshot", modelId: "moonshot-v1-auto", displayName: "Moonshot v1 Auto" },
  ],
  qwen: [
    { provider: "qwen", modelId: "qwen-plus", displayName: "Qwen Plus" },
    { provider: "qwen", modelId: "qwen-turbo", displayName: "Qwen Turbo" },
  ],
};

/** Default model configurations per region. */
const REGION_DEFAULTS: Record<string, ModelConfig> = {
  us: { provider: "openai", modelId: "gpt-4o", displayName: "GPT-4o" },
  eu: { provider: "openai", modelId: "gpt-4o", displayName: "GPT-4o" },
  cn: { provider: "deepseek", modelId: "deepseek-chat", displayName: "DeepSeek Chat" },
};

/** Global fallback if region not found in defaults. */
const GLOBAL_DEFAULT: ModelConfig = {
  provider: "openai",
  modelId: "gpt-4o",
  displayName: "GPT-4o",
};

/**
 * Get the default model config for a given region.
 */
export function getDefaultModelForRegion(region: string): ModelConfig {
  return REGION_DEFAULTS[region] ?? GLOBAL_DEFAULT;
}

/**
 * Get the default model for a specific provider.
 * Returns the first model in that provider's list.
 */
export function getDefaultModelForProvider(provider: LLMProvider): ModelConfig {
  const models = KNOWN_MODELS[provider];
  return models[0];
}

/**
 * Resolve the effective model config.
 * If the user has overridden the provider/model, use that.
 * Otherwise, use the region default.
 */
export function resolveModelConfig(options: {
  region: string;
  userProvider?: LLMProvider;
  userModelId?: string;
}): ModelConfig {
  const regionDefault = getDefaultModelForRegion(options.region);

  if (options.userProvider && options.userModelId) {
    return {
      provider: options.userProvider,
      modelId: options.userModelId,
      displayName: options.userModelId,
    };
  }

  if (options.userProvider) {
    return getDefaultModelForProvider(options.userProvider);
  }

  return regionDefault;
}

/**
 * Get available providers for a region (ordered by recommendation).
 * China region lists domestic providers first for better accessibility.
 */
export function getProvidersForRegion(region: string): LLMProvider[] {
  if (region === "cn") {
    return ["deepseek", "zhipu", "moonshot", "qwen", "openai", "anthropic"];
  }
  return ["openai", "anthropic", "deepseek"];
}
