import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createLogger } from "@easyclaw/logger";
import { loadConfig } from "./config.js";
import { createBindingStore, type BindingStore } from "./binding/store.js";
import { createWebhookHandler } from "./wecom/webhook-handler.js";
import { createWSServer } from "./ws/server.js";
import { registry } from "./ws/server.js";

const log = createLogger("wecom-relay");

/** Global binding store singleton */
let bindingStore: BindingStore | null = null;

/**
 * Get the global binding store instance.
 * Must be called after initialization in main().
 */
export function getBindingStore(): BindingStore {
  if (!bindingStore) {
    throw new Error("Binding store not initialized");
  }
  return bindingStore;
}

async function main(): Promise<void> {
  log.info("Starting WeCom Relay Server");

  // Load and validate configuration
  const config = loadConfig();

  // Ensure database directory exists
  const dbDir = dirname(config.DATABASE_PATH);
  mkdirSync(dbDir, { recursive: true });

  // Initialize binding store
  bindingStore = createBindingStore(config.DATABASE_PATH);
  log.info("Binding store initialized");

  // Start HTTP server for WeCom webhook
  const webhookHandler = createWebhookHandler(config);
  const httpServer = createServer((req, res) => {
    webhookHandler(req, res).catch((err) => {
      log.error("Unhandled error in webhook handler:", err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    });
  });

  httpServer.listen(config.PORT, () => {
    log.info(`HTTP server listening on port ${config.PORT}`);
  });

  // Start WebSocket server for gateway connections
  const wss = createWSServer(config);
  log.info("WebSocket server started");

  // Graceful shutdown
  const shutdown = (): void => {
    log.info("Shutting down...");

    registry.closeAll();
    wss.close();
    httpServer.close();
    bindingStore?.close();

    log.info("Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  log.fatal("Fatal error starting server:", err);
  process.exit(1);
});
