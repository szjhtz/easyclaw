import { createLogger } from "@easyclaw/logger";

const log = createLogger("wecom:send-message");

const WECOM_API_BASE = "https://qyapi.weixin.qq.com";

/** WeCom text message has a 2048-byte limit */
const MAX_TEXT_BYTES = 2048;

interface SendMsgResponse {
  errcode: number;
  errmsg: string;
  msgid?: string;
}

/**
 * Send a text message to a WeCom customer service user.
 *
 * POST /cgi-bin/kf/send_msg?access_token=TOKEN
 *
 * Handles the 2048-byte text limit by truncating if necessary.
 */
export async function sendTextMessage(
  accessToken: string,
  toUser: string,
  openKfId: string,
  content: string,
): Promise<string | undefined> {
  const url = `${WECOM_API_BASE}/cgi-bin/kf/send_msg?access_token=${encodeURIComponent(accessToken)}`;

  // Truncate content if it exceeds the byte limit
  let truncated = content;
  const encoder = new TextEncoder();
  if (encoder.encode(content).length > MAX_TEXT_BYTES) {
    // Binary search for the right cutoff point
    let lo = 0;
    let hi = content.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (encoder.encode(content.slice(0, mid)).length <= MAX_TEXT_BYTES - 3) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    truncated = content.slice(0, lo) + "...";
    log.warn(`Message truncated from ${encoder.encode(content).length} to ${encoder.encode(truncated).length} bytes`);
  }

  const body = {
    touser: toUser,
    open_kfid: openKfId,
    msgtype: "text",
    text: { content: truncated },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`send_msg request failed: HTTP ${response.status}`);
  }

  const data = (await response.json()) as SendMsgResponse;

  if (data.errcode !== 0) {
    throw new Error(`send_msg API error: ${data.errcode} ${data.errmsg}`);
  }

  log.info(`Message sent to ${toUser}, msgid: ${data.msgid}`);
  return data.msgid;
}
