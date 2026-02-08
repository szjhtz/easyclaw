import { app, Tray, shell, dialog } from "electron";
import { createLogger } from "@easyclaw/logger";
import {
  GatewayLauncher,
  resolveVendorEntryPath,
  ensureGatewayConfig,
  resolveOpenClawStateDir,
  writeGatewayConfig,
  buildGatewayEnv,
  readExistingConfig,
  DEFAULT_GATEWAY_PORT,
} from "@easyclaw/gateway";
import type { GatewayState } from "@easyclaw/gateway";
import { resolveModelConfig, ALL_PROVIDERS, getDefaultModelForProvider, providerSecretKey } from "@easyclaw/core";
import type { LLMProvider } from "@easyclaw/core";
import { createStorage } from "@easyclaw/storage";
import { createSecretStore } from "@easyclaw/secrets";
import { ArtifactPipeline, syncSkillsForRule, cleanupSkillsForDeletedRule } from "@easyclaw/rules";
import type { LLMConfig } from "@easyclaw/rules";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createTrayIcon } from "./tray-icon.js";
import { buildTrayMenu } from "./tray-menu.js";
import { startPanelServer } from "./panel-server.js";

const log = createLogger("desktop");

const PANEL_PORT = 3210;
const PANEL_URL = process.env.PANEL_DEV_URL || `http://127.0.0.1:${PANEL_PORT}`;

/**
 * Migrate old-style `{provider}-api-key` secrets to the new provider_keys table.
 * Only runs if the provider_keys table is empty (first upgrade).
 */
async function migrateOldProviderKeys(
  storage: import("@easyclaw/storage").Storage,
  secretStore: import("@easyclaw/secrets").SecretStore,
): Promise<void> {
  const existing = storage.providerKeys.getAll();
  if (existing.length > 0) return; // already migrated

  const activeProvider = storage.settings.get("llm-provider");

  for (const provider of ALL_PROVIDERS) {
    const secretKey = providerSecretKey(provider);
    const keyValue = await secretStore.get(secretKey);
    if (keyValue && keyValue !== "") {
      const id = crypto.randomUUID();
      const model = getDefaultModelForProvider(provider).modelId;
      storage.providerKeys.create({
        id,
        provider,
        label: "Default",
        model,
        isDefault: true,
        createdAt: "",
        updatedAt: "",
      });
      // Store under new key format for consistency
      await secretStore.set(`provider-key-${id}`, keyValue);
      log.info(`Migrated ${provider} key to provider_keys table (id: ${id})`);
    }
  }
}

app.dock?.hide();

app.whenReady().then(() => {
  log.info("EasyClaw desktop starting");

  // Initialize storage and secrets
  const storage = createStorage();
  const secretStore = createSecretStore();

  // Migrate old-style provider secrets to provider_keys table
  migrateOldProviderKeys(storage, secretStore).catch((err) => {
    log.error("Failed to migrate old provider keys:", err);
  });

  // Initialize gateway launcher
  const stateDir = resolveOpenClawStateDir();
  const configPath = ensureGatewayConfig();

  // Ensure the chat completions endpoint is enabled (required for rule compilation)
  writeGatewayConfig({ configPath, enableChatCompletions: true });

  const launcher = new GatewayLauncher({
    entryPath: resolveVendorEntryPath(),
    nodeBin: process.execPath,
    env: { ELECTRON_RUN_AS_NODE: "1" },
    configPath,
    stateDir,
  });
  let currentState: GatewayState = "stopped";

  // Initialize artifact pipeline with LLM config resolver
  const pipeline = new ArtifactPipeline({
    storage,
    resolveLLMConfig: async (): Promise<LLMConfig | null> => {
      const config = readExistingConfig(configPath);
      const gw = config.gateway as Record<string, unknown> | undefined;
      const auth = gw?.auth as Record<string, unknown> | undefined;
      const token = auth?.token as string | undefined;
      if (!token) return null;

      const port = (gw?.port as number) ?? DEFAULT_GATEWAY_PORT;
      return {
        gatewayUrl: `http://127.0.0.1:${port}`,
        authToken: token,
      };
    },
  });

  // Log pipeline events
  pipeline.on("compiled", (ruleId, artifact) => {
    log.info(`Rule ${ruleId} compiled → ${artifact.type} (${artifact.status})`);
  });
  pipeline.on("failed", (ruleId, error) => {
    log.error(`Rule ${ruleId} compilation failed: ${error.message}`);
  });

  /**
   * Handle rule create/update: trigger async LLM compilation in the background.
   * The compilation runs asynchronously — errors are logged, not thrown.
   */
  function handleRuleCompile(ruleId: string): void {
    const rule = storage.rules.getById(ruleId);
    if (!rule) {
      log.warn(`Rule ${ruleId} not found for compilation`);
      return;
    }

    // Fire and forget — compilation happens in the background
    syncSkillsForRule(pipeline, rule).catch((err) => {
      log.error(`Background compilation failed for rule ${ruleId}:`, err);
    });
  }

  /**
   * Called when provider settings change (API key added/removed, default changed).
   * Rewrites the OpenClaw config with the new default model and restarts the
   * gateway with fresh environment variables containing the updated API keys.
   */
  async function handleProviderChange(): Promise<void> {
    log.info("Provider settings changed, updating config and restarting gateway");

    // Read current provider/region settings
    const provider = storage.settings.get("llm-provider") as LLMProvider | undefined;
    const region = storage.settings.get("region") ?? "us";

    // Get the active key's model for the active provider
    let userModelId: string | undefined;
    if (provider) {
      const activeKey = storage.providerKeys.getDefault(provider);
      if (activeKey?.model) {
        userModelId = activeKey.model;
      }
    }

    // Resolve the effective model config
    const modelConfig = resolveModelConfig({
      region,
      userProvider: provider,
      userModelId,
    });

    // Rewrite the OpenClaw config with the new default model
    writeGatewayConfig({
      configPath,
      defaultModel: {
        provider: modelConfig.provider,
        modelId: modelConfig.modelId,
      },
    });

    // Rebuild env with fresh secrets + ELECTRON_RUN_AS_NODE flag
    const secretEnv = await buildGatewayEnv(secretStore, {
      ELECTRON_RUN_AS_NODE: "1",
    });
    launcher.setEnv(secretEnv);

    // Restart the gateway process
    await launcher.stop();
    await launcher.start();
  }

  // Create tray
  const tray = new Tray(createTrayIcon("stopped"));

  function updateTray(state: GatewayState) {
    currentState = state;
    tray.setImage(createTrayIcon(state));
    tray.setContextMenu(
      buildTrayMenu(state, {
        onOpenPanel: () => {
          shell.openExternal(PANEL_URL);
        },
        onRestartGateway: async () => {
          await launcher.stop();
          await launcher.start();
        },
        onQuit: () => {
          app.quit();
        },
      }),
    );
  }

  tray.setToolTip("EasyClaw");
  updateTray("stopped");

  // Listen to gateway events
  let firstStart = true;
  launcher.on("started", () => {
    log.info("Gateway started");
    updateTray("running");
    if (firstStart) {
      firstStart = false;
      shell.openExternal(PANEL_URL);
    }
  });

  launcher.on("stopped", () => {
    log.info("Gateway stopped");
    updateTray("stopped");
  });

  launcher.on("restarting", (attempt, delayMs) => {
    log.info(`Gateway restarting (attempt ${attempt}, delay ${delayMs}ms)`);
    updateTray("starting");
  });

  launcher.on("error", (error) => {
    log.error("Gateway error:", error);
  });

  // Start the panel server
  const panelDistDir = resolve(__dirname, "../../panel/dist");
  startPanelServer({
    port: PANEL_PORT,
    panelDistDir,
    storage,
    secretStore,
    onRuleChange: (action, ruleId) => {
      log.info(`Rule ${action}: ${ruleId}`);
      if (action === "created" || action === "updated") {
        handleRuleCompile(ruleId);
      } else if (action === "deleted") {
        cleanupSkillsForDeletedRule(pipeline, ruleId);
      }
    },
    onProviderChange: () => {
      handleProviderChange().catch((err) => {
        log.error("Failed to handle provider change:", err);
      });
    },
    onOpenFileDialog: async () => {
      const result = await dialog.showOpenDialog({
        properties: ["openDirectory", "openFile", "createDirectory"],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths[0];
    },
  });

  // Start gateway with secrets injected
  buildGatewayEnv(secretStore, { ELECTRON_RUN_AS_NODE: "1" })
    .then((env) => {
      launcher.setEnv(env);
      return launcher.start();
    })
    .catch((err) => {
      log.error("Failed to start gateway:", err);
    });

  log.info("EasyClaw desktop ready");

  // Cleanup on quit
  app.on("before-quit", async () => {
    await launcher.stop();
    storage.close();
  });
});
