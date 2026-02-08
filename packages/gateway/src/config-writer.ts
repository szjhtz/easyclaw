import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { createLogger } from "@easyclaw/logger";

const log = createLogger("gateway:config");

/** Generate a random hex token for gateway auth. */
export function generateGatewayToken(): string {
  return randomBytes(32).toString("hex");
}

/** Minimal OpenClaw config structure that EasyClaw manages. */
export interface OpenClawGatewayConfig {
  gateway?: {
    port?: number;
    auth?: {
      mode?: "token";
      token?: string;
    };
  };
  agents?: {
    defaults?: {
      model?: {
        primary?: string;
      };
    };
  };
  plugins?: Record<string, unknown>;
  skills?: {
    load?: {
      extraDirs?: string[];
    };
  };
}

/** Default OpenClaw gateway port. */
export const DEFAULT_GATEWAY_PORT = 18789;

/** Resolve the OpenClaw state directory, respecting OPENCLAW_STATE_DIR env var. */
export function resolveOpenClawStateDir(
  env: Record<string, string | undefined> = process.env,
): string {
  return env.OPENCLAW_STATE_DIR?.trim() || join(homedir(), ".easyclaw", "openclaw");
}

/** Resolve the OpenClaw config path, respecting OPENCLAW_CONFIG_PATH env var. */
export function resolveOpenClawConfigPath(
  env: Record<string, string | undefined> = process.env,
): string {
  return (
    env.OPENCLAW_CONFIG_PATH?.trim() ||
    join(resolveOpenClawStateDir(env), "openclaw.json")
  );
}

/**
 * Read existing OpenClaw config from disk.
 * Returns an empty object if the file does not exist or cannot be parsed.
 */
export function readExistingConfig(
  configPath: string,
): Record<string, unknown> {
  try {
    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, "utf-8")) as Record<
        string,
        unknown
      >;
    }
  } catch {
    log.warn(
      `Failed to read existing config at ${configPath}, starting fresh`,
    );
  }
  return {};
}

export interface WriteGatewayConfigOptions {
  /** Absolute path where the config should be written. Defaults to resolveOpenClawConfigPath(). */
  configPath?: string;
  /** The gateway HTTP port. */
  gatewayPort?: number;
  /** Auth token for the gateway. Auto-generated if not provided in ensureGatewayConfig. */
  gatewayToken?: string;
  /** Default model configuration (provider + model ID). */
  defaultModel?: { provider: string; modelId: string };
  /** Plugin configuration object for OpenClaw. */
  plugins?: Record<string, unknown>;
  /** Array of extra skill directories for OpenClaw to load. */
  extraSkillDirs?: string[];
  /** Enable the OpenAI-compatible /v1/chat/completions endpoint (disabled by default in OpenClaw). */
  enableChatCompletions?: boolean;
}

/**
 * Write the OpenClaw gateway config file.
 *
 * Merges EasyClaw-managed fields into any existing config so that
 * user-added fields are preserved. Only fields explicitly provided
 * in options are written; omitted fields are left untouched.
 *
 * Returns the absolute path of the written config file.
 */
export function writeGatewayConfig(options: WriteGatewayConfigOptions): string {
  const configPath = options.configPath ?? resolveOpenClawConfigPath();

  // Ensure the parent directory exists
  const dir = dirname(configPath);
  mkdirSync(dir, { recursive: true });

  // Read existing config to preserve user settings
  const existing = readExistingConfig(configPath);

  // Shallow-clone the top level
  const config: Record<string, unknown> = { ...existing };

  // Gateway section
  if (options.gatewayPort !== undefined || options.gatewayToken !== undefined) {
    const existingGateway =
      typeof config.gateway === "object" && config.gateway !== null
        ? (config.gateway as Record<string, unknown>)
        : {};

    const merged: Record<string, unknown> = { ...existingGateway };

    if (options.gatewayPort !== undefined) {
      merged.port = options.gatewayPort;
      merged.mode = existingGateway.mode ?? "local";
    }

    if (options.gatewayToken !== undefined) {
      const existingAuth =
        typeof existingGateway.auth === "object" && existingGateway.auth !== null
          ? (existingGateway.auth as Record<string, unknown>)
          : {};
      merged.auth = {
        ...existingAuth,
        mode: "token",
        token: options.gatewayToken,
      };
    }

    config.gateway = merged;
  }

  // Enable /v1/chat/completions endpoint (used by rule compilation pipeline)
  if (options.enableChatCompletions !== undefined) {
    const existingGateway =
      typeof config.gateway === "object" && config.gateway !== null
        ? (config.gateway as Record<string, unknown>)
        : {};
    const existingHttp =
      typeof existingGateway.http === "object" && existingGateway.http !== null
        ? (existingGateway.http as Record<string, unknown>)
        : {};
    const existingEndpoints =
      typeof existingHttp.endpoints === "object" && existingHttp.endpoints !== null
        ? (existingHttp.endpoints as Record<string, unknown>)
        : {};
    config.gateway = {
      ...existingGateway,
      http: {
        ...existingHttp,
        endpoints: {
          ...existingEndpoints,
          chatCompletions: { enabled: options.enableChatCompletions },
        },
      },
    };
  }

  // Default model selection → agents.defaults.model.primary
  if (options.defaultModel !== undefined) {
    const existingAgents =
      typeof config.agents === "object" && config.agents !== null
        ? (config.agents as Record<string, unknown>)
        : {};
    const existingDefaults =
      typeof existingAgents.defaults === "object" && existingAgents.defaults !== null
        ? (existingAgents.defaults as Record<string, unknown>)
        : {};
    const existingModel =
      typeof existingDefaults.model === "object" && existingDefaults.model !== null
        ? (existingDefaults.model as Record<string, unknown>)
        : {};
    config.agents = {
      ...existingAgents,
      defaults: {
        ...existingDefaults,
        model: {
          ...existingModel,
          primary: `${options.defaultModel.provider}/${options.defaultModel.modelId}`,
        },
      },
    };
  }

  // Plugins (EasyClaw owns this object entirely)
  if (options.plugins !== undefined) {
    config.plugins = options.plugins;
  }

  // Skills extra dirs
  if (options.extraSkillDirs !== undefined) {
    const existingSkills =
      typeof config.skills === "object" && config.skills !== null
        ? (config.skills as Record<string, unknown>)
        : {};
    const existingLoad =
      typeof existingSkills.load === "object" && existingSkills.load !== null
        ? (existingSkills.load as Record<string, unknown>)
        : {};
    config.skills = {
      ...existingSkills,
      load: {
        ...existingLoad,
        extraDirs: options.extraSkillDirs,
      },
    };
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  log.info(`Gateway config written to ${configPath}`);

  return configPath;
}

/**
 * Ensure a minimal gateway config exists on disk.
 *
 * If a config file already exists, returns its path without modification.
 * Otherwise, writes a default config with empty plugins and skill dirs.
 *
 * Returns the absolute path of the config file.
 */
export function ensureGatewayConfig(options?: {
  configPath?: string;
  gatewayPort?: number;
}): string {
  const configPath = options?.configPath ?? resolveOpenClawConfigPath();

  if (!existsSync(configPath)) {
    return writeGatewayConfig({
      configPath,
      gatewayPort: options?.gatewayPort ?? DEFAULT_GATEWAY_PORT,
      gatewayToken: generateGatewayToken(),
      enableChatCompletions: true,
      plugins: {},
      extraSkillDirs: [],
    });
  }

  return configPath;
}
