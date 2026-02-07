import type { SecretStore } from "@easyclaw/secrets";
import { createLogger } from "@easyclaw/logger";

const log = createLogger("gateway:secret-injector");

/**
 * Mapping from well-known secret keys to the environment variable names
 * that the gateway process expects.
 */
export const SECRET_ENV_MAP: Record<string, string> = {
  "llm-api-key": "OPENAI_API_KEY",
  "wecom-corp-secret": "WECOM_CORP_SECRET",
  "wecom-token": "WECOM_TOKEN",
  "wecom-encoding-aes-key": "WECOM_ENCODING_AES_KEY",
  "dingtalk-app-secret": "DINGTALK_APP_SECRET",
  "dingtalk-token": "DINGTALK_TOKEN",
  "stt-api-key": "STT_API_KEY",
};

/**
 * Resolve all known secrets into an env-var record suitable for passing
 * to the gateway child process.
 *
 * Secrets that are not set (null) are silently skipped -- the gateway
 * will function with whatever subset of keys is available.
 *
 * Secret values are NEVER logged.
 */
export async function resolveSecretEnv(
  store: SecretStore,
): Promise<Record<string, string>> {
  const env: Record<string, string> = {};

  for (const [secretKey, envVar] of Object.entries(SECRET_ENV_MAP)) {
    const value = await store.get(secretKey);
    if (value !== null) {
      env[envVar] = value;
      log.debug("Injecting secret: " + secretKey + " -> " + envVar);
    }
  }

  log.info("Resolved " + Object.keys(env).length + " secret(s) for gateway env");
  return env;
}

/**
 * Build the complete environment for the gateway process.
 *
 * Merges the current process.env, any user-provided env overrides, and
 * resolved secrets. Secrets take highest precedence so they cannot be
 * accidentally overridden by config files.
 */
export async function buildGatewayEnv(
  store: SecretStore,
  extraEnv?: Record<string, string>,
): Promise<Record<string, string>> {
  const secretEnv = await resolveSecretEnv(store);

  const merged: Record<string, string> = {};

  // Base environment (process.env minus undefined values)
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) {
      merged[k] = v;
    }
  }

  // User-provided overrides
  if (extraEnv) {
    Object.assign(merged, extraEnv);
  }

  // Secrets take highest priority
  Object.assign(merged, secretEnv);

  return merged;
}
