import { describe, it, expect } from "vitest";
import { resolveSecretEnv, buildGatewayEnv, SECRET_ENV_MAP } from "./secret-injector.js";
import type { SecretStore } from "@easyclaw/secrets";

class MockSecretStore implements SecretStore {
  private store = new Map<string, string>();

  constructor(initial?: Record<string, string>) {
    if (initial) {
      for (const [k, v] of Object.entries(initial)) {
        this.store.set(k, v);
      }
    }
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }
  async listKeys(): Promise<string[]> {
    return [...this.store.keys()];
  }
}

describe("SECRET_ENV_MAP", () => {
  it("should map llm-api-key to OPENAI_API_KEY", () => {
    expect(SECRET_ENV_MAP["llm-api-key"]).toBe("OPENAI_API_KEY");
  });

  it("should have mappings for all well-known keys", () => {
    const expectedKeys = [
      "llm-api-key",
      "wecom-corp-secret",
      "wecom-token",
      "wecom-encoding-aes-key",
      "dingtalk-app-secret",
      "dingtalk-token",
      "stt-api-key",
    ];
    for (const key of expectedKeys) {
      expect(SECRET_ENV_MAP).toHaveProperty(key);
    }
  });
});

describe("resolveSecretEnv", () => {
  it("should return empty object when no secrets set", async () => {
    const store = new MockSecretStore();
    const env = await resolveSecretEnv(store);
    expect(Object.keys(env)).toHaveLength(0);
  });

  it("should map set secrets to env vars", async () => {
    const store = new MockSecretStore({
      "llm-api-key": "sk-test-123",
      "stt-api-key": "stt-key-456",
    });

    const env = await resolveSecretEnv(store);
    expect(env["OPENAI_API_KEY"]).toBe("sk-test-123");
    expect(env["STT_API_KEY"]).toBe("stt-key-456");
  });

  it("should skip secrets that are not set", async () => {
    const store = new MockSecretStore({
      "llm-api-key": "sk-test",
    });

    const env = await resolveSecretEnv(store);
    expect(env["OPENAI_API_KEY"]).toBe("sk-test");
    expect(env).not.toHaveProperty("WECOM_CORP_SECRET");
    expect(env).not.toHaveProperty("DINGTALK_APP_SECRET");
  });
});

describe("buildGatewayEnv", () => {
  it("should merge process env with secrets", async () => {
    const store = new MockSecretStore({
      "llm-api-key": "sk-secret",
    });

    const env = await buildGatewayEnv(store);
    expect(env["OPENAI_API_KEY"]).toBe("sk-secret");
    // Should include process.env values
    expect(env["PATH"]).toBeDefined();
  });

  it("should merge extra env vars", async () => {
    const store = new MockSecretStore();
    const env = await buildGatewayEnv(store, { CUSTOM_VAR: "custom-value" });
    expect(env["CUSTOM_VAR"]).toBe("custom-value");
  });

  it("should let secrets override extra env", async () => {
    const store = new MockSecretStore({
      "llm-api-key": "from-secrets",
    });

    const env = await buildGatewayEnv(store, { OPENAI_API_KEY: "from-extra" });
    expect(env["OPENAI_API_KEY"]).toBe("from-secrets");
  });
});
