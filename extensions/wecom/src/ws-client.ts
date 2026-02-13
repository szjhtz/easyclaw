import { EventEmitter } from "node:events";
import WebSocket from "ws";
import { createLogger } from "@easyclaw/logger";
import type { WsFrame } from "./types.js";
import { parseFrame } from "./types.js";

const log = createLogger("wecom:ws");

const MIN_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export interface RelayWsClientEvents {
  connected: [];
  disconnected: [];
  message: [frame: WsFrame];
  error: [err: Error];
}

export class RelayWsClient extends EventEmitter<RelayWsClientEvents> {
  private ws: WebSocket | null = null;
  private reconnectDelay = MIN_RECONNECT_DELAY_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

  constructor(
    private readonly relayUrl: string,
    private readonly gatewayId: string,
    private readonly authToken: string,
  ) {
    super();
  }

  /** Initiate the WebSocket connection. */
  connect(): void {
    this.intentionalClose = false;
    this.doConnect();
  }

  /** Gracefully close the connection and stop reconnecting. */
  disconnect(): void {
    this.intentionalClose = true;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /** Send a frame to the relay server. */
  send(frame: WsFrame): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log.warn("Cannot send frame — WebSocket is not open");
      return;
    }
    this.ws.send(JSON.stringify(frame));
  }

  /** Whether the connection is currently open. */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /* ── Private ─────────────────────────────────────────────────── */

  private doConnect(): void {
    log.info(`Connecting to relay: ${this.relayUrl}`);

    const ws = new WebSocket(this.relayUrl);
    this.ws = ws;

    ws.on("open", () => {
      log.info("Connected to relay");
      this.reconnectDelay = MIN_RECONNECT_DELAY_MS;

      // Authenticate immediately
      this.send({
        type: "hello",
        gateway_id: this.gatewayId,
        auth_token: this.authToken,
      });

      this.emit("connected");
    });

    ws.on("message", (data: WebSocket.RawData) => {
      const raw = data.toString("utf-8");
      const frame = parseFrame(raw);
      if (frame) {
        this.emit("message", frame);
      } else {
        log.warn("Received unparseable frame from relay");
      }
    });

    ws.on("close", () => {
      log.info("Disconnected from relay");
      this.ws = null;
      this.emit("disconnected");
      if (!this.intentionalClose) {
        this.scheduleReconnect();
      }
    });

    ws.on("error", (err: Error) => {
      log.error("WebSocket error:", err.message);
      this.emit("error", err);
      // The 'close' event will fire after 'error', triggering reconnect
    });

    ws.on("ping", (data: Buffer) => {
      ws.pong(data);
    });
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    log.info(`Reconnecting in ${this.reconnectDelay}ms ...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(
        this.reconnectDelay * 2,
        MAX_RECONNECT_DELAY_MS,
      );
      this.doConnect();
    }, this.reconnectDelay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
