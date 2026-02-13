import { WebSocketServer, type WebSocket } from "ws";
import { createLogger } from "@easyclaw/logger";
import type { Config } from "../config.js";
import { ConnectionRegistry } from "./registry.js";
import { decodeFrame, encodeFrame } from "./protocol.js";
import { startHeartbeat } from "./heartbeat.js";
import { handleOutboundReply } from "../relay/outbound.js";
import type { HelloFrame, ReplyFrame } from "../types.js";

const log = createLogger("ws:server");

/** Singleton connection registry, exported for use by relay modules */
export const registry = new ConnectionRegistry();

/**
 * Create and start the WebSocket server for gateway connections.
 */
export function createWSServer(config: Config): WebSocketServer {
  const wss = new WebSocketServer({ port: config.WS_PORT });

  log.info(`WebSocket server listening on port ${config.WS_PORT}`);

  wss.on("connection", (ws: WebSocket) => {
    let gatewayId: string | null = null;
    let authenticated = false;

    // Expect hello frame within 5 seconds
    const authTimeout = setTimeout(() => {
      if (!authenticated) {
        log.warn("Connection did not authenticate within timeout");
        ws.close(4001, "Authentication timeout");
      }
    }, 5000);

    ws.on("message", (data: Buffer) => {
      try {
        const frame = decodeFrame(data.toString("utf-8"));

        if (!authenticated) {
          if (frame.type !== "hello") {
            ws.send(encodeFrame({ type: "error", message: "Expected hello frame" }));
            ws.close(4002, "Expected hello frame");
            return;
          }

          const hello = frame as HelloFrame;

          if (hello.auth_token !== config.RELAY_AUTH_SECRET) {
            ws.send(encodeFrame({ type: "error", message: "Authentication failed" }));
            ws.close(4003, "Authentication failed");
            return;
          }

          clearTimeout(authTimeout);
          authenticated = true;
          gatewayId = hello.gateway_id;

          registry.register(gatewayId, ws);
          startHeartbeat(ws, gatewayId);

          ws.send(encodeFrame({ type: "ack", id: "hello" }));
          log.info(`Gateway authenticated: ${gatewayId}`);
          return;
        }

        // Handle authenticated frames
        if (frame.type === "reply") {
          const reply = frame as ReplyFrame;
          handleOutboundReply(reply, config).catch((err) => {
            log.error(`Error handling reply from ${gatewayId}:`, err);
            ws.send(encodeFrame({ type: "error", message: "Failed to send reply" }));
          });
          return;
        }

        log.warn(`Unexpected frame type from ${gatewayId}: ${frame.type}`);
      } catch (err) {
        log.error("Error processing WebSocket message:", err);
        ws.send(encodeFrame({ type: "error", message: "Invalid frame" }));
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimeout);
      if (gatewayId) {
        log.info(`Gateway disconnected: ${gatewayId}`);
      }
    });

    ws.on("error", (err) => {
      log.error(`WebSocket error for ${gatewayId ?? "unauthenticated"}:`, err);
    });
  });

  return wss;
}
