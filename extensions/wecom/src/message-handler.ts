import { createLogger } from "@easyclaw/logger";
import type { InboundFrame } from "./types.js";

const log = createLogger("wecom:msg");

/**
 * Callback signature for when a message arrives from a WeChat user.
 * The `reply` function sends a text response back through the relay.
 */
export type OnMessageCallback = (message: {
  externalUserId: string;
  msgType: string;
  content: string;
  timestamp: number;
  reply: (text: string) => Promise<void>;
}) => void;

export class MessageHandler {
  private callbacks: OnMessageCallback[] = [];

  /** Register a callback to be invoked for each inbound message. */
  onMessage(callback: OnMessageCallback): void {
    this.callbacks.push(callback);
  }

  /** Process an inbound frame from the relay server. */
  handleInbound(
    frame: InboundFrame,
    replySender: (externalUserId: string, text: string) => Promise<void>,
  ): void {
    log.info(
      `Inbound message from ${frame.external_user_id}: [${frame.msg_type}]`,
    );

    const reply = (text: string) =>
      replySender(frame.external_user_id, text);

    for (const cb of this.callbacks) {
      try {
        cb({
          externalUserId: frame.external_user_id,
          msgType: frame.msg_type,
          content: frame.content,
          timestamp: frame.timestamp,
          reply,
        });
      } catch (err) {
        log.error("Error in onMessage callback:", err);
      }
    }
  }
}
