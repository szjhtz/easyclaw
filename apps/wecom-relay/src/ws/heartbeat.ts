import type { WebSocket } from "ws";
import { createLogger } from "@easyclaw/logger";

const log = createLogger("ws:heartbeat");

const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;

interface HeartbeatState {
  interval: ReturnType<typeof setInterval>;
  timeout: ReturnType<typeof setTimeout> | null;
}

const heartbeats = new WeakMap<WebSocket, HeartbeatState>();

/**
 * Start heartbeat monitoring for a WebSocket connection.
 * Sends ping every 30s and terminates connections that don't pong within 10s.
 */
export function startHeartbeat(ws: WebSocket, label: string): void {
  const state: HeartbeatState = {
    interval: setInterval(() => {
      if (ws.readyState !== ws.OPEN) {
        stopHeartbeat(ws);
        return;
      }

      ws.ping();

      state.timeout = setTimeout(() => {
        log.warn(`Heartbeat timeout for ${label}, terminating`);
        ws.terminate();
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS),
    timeout: null,
  };

  heartbeats.set(ws, state);

  ws.on("pong", () => {
    const s = heartbeats.get(ws);
    if (s?.timeout) {
      clearTimeout(s.timeout);
      s.timeout = null;
    }
  });

  ws.on("close", () => {
    stopHeartbeat(ws);
  });
}

/**
 * Stop heartbeat monitoring for a WebSocket connection.
 */
export function stopHeartbeat(ws: WebSocket): void {
  const state = heartbeats.get(ws);
  if (state) {
    clearInterval(state.interval);
    if (state.timeout) {
      clearTimeout(state.timeout);
    }
    heartbeats.delete(ws);
  }
}
