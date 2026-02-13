import { randomUUID } from "node:crypto";
import { createLogger } from "@easyclaw/logger";
import type { Config } from "../config.js";
import type { WeComMessage, InboundFrame } from "../types.js";
import { registry } from "../ws/server.js";
import { encodeFrame } from "../ws/protocol.js";
import { getBindingStore } from "../index.js";
import { getAccessToken } from "../wecom/access-token.js";
import { sendTextMessage } from "../wecom/send-message.js";

const log = createLogger("relay:inbound");

/**
 * Handle inbound messages from WeCom sync_msg.
 *
 * For each message:
 * 1. If it's a text message matching a pending binding token, execute binding flow.
 * 2. Otherwise, look up the external_userid → gateway_id binding.
 * 3. Find the gateway's WebSocket connection and forward the message.
 */
export async function handleInboundMessages(
  messages: WeComMessage[],
  config: Config,
): Promise<void> {
  const store = getBindingStore();

  for (const msg of messages) {
    // Skip event messages and internal (origin=5 = system) messages
    if (msg.msgtype === "event") continue;

    // Only process customer messages (origin 3 = customer)
    if ("origin" in msg && msg.origin !== 3) continue;

    const externalUserId = msg.external_userid;

    // Check for binding token in text messages
    if (msg.msgtype === "text") {
      const text = msg.text.trim();
      const gatewayId = store.resolvePendingBinding(text);

      if (gatewayId) {
        // Execute binding: associate this external user with the gateway
        store.bind(externalUserId, gatewayId);

        const accessToken = await getAccessToken(config.WECOM_CORPID, config.WECOM_APP_SECRET);
        await sendTextMessage(
          accessToken,
          externalUserId,
          config.WECOM_OPEN_KFID,
          "Binding successful! Your messages will now be forwarded to your assistant.",
        );

        log.info(`Binding completed: ${externalUserId} → ${gatewayId}`);
        continue;
      }
    }

    // Look up binding
    const gatewayId = store.lookup(externalUserId);
    if (!gatewayId) {
      log.warn(`No binding found for external_userid: ${externalUserId}`);
      continue;
    }

    // Find gateway connection
    const ws = registry.get(gatewayId);
    if (!ws) {
      log.warn(`Gateway ${gatewayId} not connected for user ${externalUserId}`);
      continue;
    }

    // Build and send inbound frame
    let content: string;
    let msgType: string;

    switch (msg.msgtype) {
      case "text":
        content = msg.text;
        msgType = "text";
        break;
      case "image":
        content = msg.media_id;
        msgType = "image";
        break;
      case "voice":
        content = msg.media_id;
        msgType = "voice";
        break;
      default:
        content = "";
        msgType = "unknown";
    }

    const frame: InboundFrame = {
      type: "inbound",
      id: randomUUID(),
      external_user_id: externalUserId,
      msg_type: msgType,
      content,
      timestamp: msg.send_time,
    };

    ws.send(encodeFrame(frame));
    log.info(`Forwarded ${msgType} message to gateway ${gatewayId} for user ${externalUserId}`);
  }
}
