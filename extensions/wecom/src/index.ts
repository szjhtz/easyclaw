import { createLogger } from "@easyclaw/logger";
import { RelayWsClient } from "./ws-client.js";
import { MessageHandler, type OnMessageCallback } from "./message-handler.js";
import { ReplyHandler } from "./reply-handler.js";
import { isInboundFrame, isErrorFrame, isAckFrame } from "./types.js";

export type { OnMessageCallback } from "./message-handler.js";
export type {
  WsFrame,
  HelloFrame,
  InboundFrame,
  ReplyFrame,
  AckFrame,
  ErrorFrame,
  CreateBindingFrame,
  CreateBindingAckFrame,
} from "./types.js";
export { splitMessage } from "./reply-handler.js";

const log = createLogger("wecom:channel");

export interface WeComChannelConfig {
  /** WebSocket URL of the WeCom relay server (e.g. ws://relay.example.com:3001) */
  relayUrl: string;
  /** Unique identifier for this gateway instance */
  gatewayId: string;
  /** Shared secret used to authenticate with the relay */
  authToken: string;
}

export interface WeComChannel {
  /** Connect to the relay server and start listening for messages. */
  start(): void;
  /** Disconnect from the relay server. */
  stop(): void;
  /** Register a handler for inbound user messages. */
  onMessage(callback: OnMessageCallback): void;
  /** Whether the WebSocket connection is currently open. */
  readonly isConnected: boolean;
}

/**
 * Create a WeCom channel that connects to the relay server via WebSocket.
 *
 * ```ts
 * const channel = createWeComChannel({
 *   relayUrl: "ws://relay.example.com:3001",
 *   gatewayId: "gw-01",
 *   authToken: "secret",
 * });
 *
 * channel.onMessage(({ content, reply }) => {
 *   reply(`Echo: ${content}`);
 * });
 *
 * channel.start();
 * ```
 */
export function createWeComChannel(config: WeComChannelConfig): WeComChannel {
  const wsClient = new RelayWsClient(
    config.relayUrl,
    config.gatewayId,
    config.authToken,
  );
  const messageHandler = new MessageHandler();
  const replyHandler = new ReplyHandler(wsClient);

  // Wire up frame routing
  wsClient.on("message", (frame) => {
    if (isInboundFrame(frame)) {
      messageHandler.handleInbound(frame, (externalUserId, text) =>
        replyHandler.sendReply(externalUserId, text),
      );
    } else if (isAckFrame(frame)) {
      log.debug(`Ack received for message ${frame.id}`);
    } else if (isErrorFrame(frame)) {
      log.error(`Relay error: ${frame.message}`);
    }
  });

  wsClient.on("error", (err) => {
    log.error("WebSocket error:", err.message);
  });

  return {
    start() {
      log.info("Starting WeCom channel");
      wsClient.connect();
    },
    stop() {
      log.info("Stopping WeCom channel");
      wsClient.disconnect();
    },
    onMessage(callback: OnMessageCallback) {
      messageHandler.onMessage(callback);
    },
    get isConnected() {
      return wsClient.isConnected;
    },
  };
}
