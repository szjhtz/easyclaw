import { app, Tray, shell } from "electron";
import { createLogger } from "@easyclaw/logger";
import {
  GatewayLauncher,
  resolveVendorEntryPath,
  ensureGatewayConfig,
  resolveOpenClawStateDir,
} from "@easyclaw/gateway";
import type { GatewayState } from "@easyclaw/gateway";
import { createStorage } from "@easyclaw/storage";
import { createTrayIcon } from "./tray-icon.js";
import { buildTrayMenu } from "./tray-menu.js";
import { startPanelServer } from "./panel-server.js";

const log = createLogger("desktop");

const PANEL_PORT = 3210;

app.dock?.hide();

app.whenReady().then(() => {
  log.info("EasyClaw desktop starting");

  // Initialize storage
  const storage = createStorage();

  // Initialize gateway launcher
  const stateDir = resolveOpenClawStateDir();
  const configPath = ensureGatewayConfig();
  const launcher = new GatewayLauncher({
    entryPath: resolveVendorEntryPath(),
    configPath,
    stateDir,
  });
  let currentState: GatewayState = "stopped";

  // Create tray
  const tray = new Tray(createTrayIcon("stopped"));

  function updateTray(state: GatewayState) {
    currentState = state;
    tray.setImage(createTrayIcon(state));
    tray.setContextMenu(
      buildTrayMenu(state, {
        onOpenPanel: () => {
          shell.openExternal(`http://127.0.0.1:${PANEL_PORT}`);
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
  launcher.on("started", () => {
    log.info("Gateway started");
    updateTray("running");
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
  const panelDistDir = new URL("../../panel/dist", import.meta.url).pathname;
  startPanelServer({
    port: PANEL_PORT,
    panelDistDir,
    storage,
    onRuleChange: (action, ruleId) => {
      log.info(`Rule ${action}: ${ruleId}`);
    },
  });

  // Start gateway
  launcher.start().catch((err) => {
    log.error("Failed to start gateway:", err);
  });

  log.info("EasyClaw desktop ready");

  // Cleanup on quit
  app.on("before-quit", async () => {
    await launcher.stop();
    storage.close();
  });
});
