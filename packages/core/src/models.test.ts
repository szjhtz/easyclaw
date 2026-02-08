import { describe, it, expect } from "vitest";
import {
  getDefaultModelForRegion,
  getDefaultModelForProvider,
  resolveModelConfig,
  getProvidersForRegion,
  KNOWN_MODELS,
  ALL_PROVIDERS,
  PROVIDER_LABELS,
} from "./models.js";

describe("KNOWN_MODELS", () => {
  it("should have models for common providers", () => {
    const providers = ["openai", "anthropic", "deepseek", "zhipu", "moonshot", "qwen"] as const;
    for (const p of providers) {
      expect(KNOWN_MODELS[p]!.length).toBeGreaterThan(0);
    }
  });

  it("should have valid model configs", () => {
    for (const [provider, models] of Object.entries(KNOWN_MODELS)) {
      for (const model of models!) {
        expect(model.provider).toBe(provider);
        expect(model.modelId).toBeTruthy();
        expect(model.displayName).toBeTruthy();
      }
    }
  });
});

describe("ALL_PROVIDERS / PROVIDER_LABELS", () => {
  it("should have labels for all providers", () => {
    for (const p of ALL_PROVIDERS) {
      expect(PROVIDER_LABELS[p]).toBeTruthy();
    }
  });

  it("should include at least 10 providers", () => {
    expect(ALL_PROVIDERS.length).toBeGreaterThanOrEqual(10);
  });
});

describe("getDefaultModelForRegion", () => {
  it("should return GPT-4o for US region", () => {
    const model = getDefaultModelForRegion("us");
    expect(model.provider).toBe("openai");
    expect(model.modelId).toBe("gpt-4o");
  });

  it("should return GPT-4o for EU region", () => {
    const model = getDefaultModelForRegion("eu");
    expect(model.provider).toBe("openai");
    expect(model.modelId).toBe("gpt-4o");
  });

  it("should return DeepSeek Chat for CN region", () => {
    const model = getDefaultModelForRegion("cn");
    expect(model.provider).toBe("deepseek");
    expect(model.modelId).toBe("deepseek-chat");
  });

  it("should return global default for unknown region", () => {
    const model = getDefaultModelForRegion("jp");
    expect(model.provider).toBe("openai");
    expect(model.modelId).toBe("gpt-4o");
  });
});

describe("getDefaultModelForProvider", () => {
  it("should return first model of given provider", () => {
    const model = getDefaultModelForProvider("anthropic");
    expect(model.provider).toBe("anthropic");
    expect(model.modelId).toBe("claude-sonnet-4-20250514");
  });

  it("should return first deepseek model", () => {
    const model = getDefaultModelForProvider("deepseek");
    expect(model.provider).toBe("deepseek");
    expect(model.modelId).toBe("deepseek-chat");
  });
});

describe("resolveModelConfig", () => {
  it("should return region default when no overrides", () => {
    const model = resolveModelConfig({ region: "cn" });
    expect(model.provider).toBe("deepseek");
    expect(model.modelId).toBe("deepseek-chat");
  });

  it("should use user provider and model when both specified", () => {
    const model = resolveModelConfig({
      region: "us",
      userProvider: "anthropic",
      userModelId: "claude-sonnet-4-20250514",
    });
    expect(model.provider).toBe("anthropic");
    expect(model.modelId).toBe("claude-sonnet-4-20250514");
  });

  it("should use default model for user provider when no model specified", () => {
    const model = resolveModelConfig({
      region: "us",
      userProvider: "deepseek",
    });
    expect(model.provider).toBe("deepseek");
    expect(model.modelId).toBe("deepseek-chat");
  });

  it("should ignore region when user specifies full override", () => {
    const model = resolveModelConfig({
      region: "cn",
      userProvider: "openai",
      userModelId: "gpt-4o-mini",
    });
    expect(model.provider).toBe("openai");
    expect(model.modelId).toBe("gpt-4o-mini");
  });
});

describe("getProvidersForRegion", () => {
  it("should list CN providers with domestic first", () => {
    const providers = getProvidersForRegion("cn");
    expect(providers[0]).toBe("deepseek");
    expect(providers).toContain("zhipu");
    expect(providers).toContain("moonshot");
    expect(providers).toContain("qwen");
  });

  it("should list US providers with OpenAI first", () => {
    const providers = getProvidersForRegion("us");
    expect(providers[0]).toBe("openai");
    expect(providers).toContain("anthropic");
    expect(providers).toContain("google");
  });

  it("should return default list for unknown region", () => {
    const providers = getProvidersForRegion("jp");
    expect(providers[0]).toBe("openai");
  });
});
