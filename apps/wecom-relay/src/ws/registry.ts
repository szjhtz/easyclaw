import type { WebSocket } from "ws";
import { createLogger } from "@easyclaw/logger";

const log = createLogger("ws:registry");

/**
 * Registry of connected gateway WebSocket connections.
 * Maps gateway_id to its WebSocket connection.
 */
export class ConnectionRegistry {
  private connections = new Map<string, WebSocket>();

  register(gatewayId: string, ws: WebSocket): void {
    const existing = this.connections.get(gatewayId);
    if (existing && existing.readyState === existing.OPEN) {
      log.warn(`Replacing existing connection for gateway ${gatewayId}`);
      existing.close(1000, "Replaced by new connection");
    }

    this.connections.set(gatewayId, ws);
    log.info(`Gateway registered: ${gatewayId} (total: ${this.connections.size})`);

    ws.on("close", () => {
      // Only remove if this is still the registered connection
      if (this.connections.get(gatewayId) === ws) {
        this.connections.delete(gatewayId);
        log.info(`Gateway unregistered: ${gatewayId} (total: ${this.connections.size})`);
      }
    });
  }

  get(gatewayId: string): WebSocket | undefined {
    const ws = this.connections.get(gatewayId);
    if (ws && ws.readyState !== ws.OPEN) {
      this.connections.delete(gatewayId);
      return undefined;
    }
    return ws;
  }

  has(gatewayId: string): boolean {
    return this.get(gatewayId) !== undefined;
  }

  size(): number {
    return this.connections.size;
  }

  /** Close all connections and clear the registry */
  closeAll(): void {
    for (const [id, ws] of this.connections) {
      log.info(`Closing connection for gateway ${id}`);
      ws.close(1000, "Server shutting down");
    }
    this.connections.clear();
  }
}
