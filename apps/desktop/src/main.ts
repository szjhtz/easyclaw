import { app, Tray, shell } from "electron";
import { createLogger } from "@easyclaw/logger";
import { GatewayLauncher } from "@easyclaw/gateway";
import { createStorage } from "@easyclaw/storage";
import { createTrayIcon } from "./tray-icon.js";
import { buildTrayMenu } from "./tray-menu.js";
import { startPanelServer } from "./panel-server.js";
import type { GatewayState } from "@easyclaw/gateway";

const log = createLogger("desktop");

const PANEL_PORT = 3210;

app.dock?.hide();

app.whenReady().then(() => {
  log.info("EasyClaw desktop starting");

  // Initialize storage
  const storage = createStorage();

  // Initialize gateway launcher
  const launcher = new GatewayLauncher();
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

  // Listen to gateway state changes
  launcher.on("stateChange", (state) => {
    log.info(`Gateway state: ${state}`);
    updateTray(state);
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
