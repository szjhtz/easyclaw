import { randomUUID } from "node:crypto";
import { createLogger } from "@easyclaw/logger";
import type { RelayWsClient } from "./ws-client.js";

const log = createLogger("wecom:reply");

/** WeChat Work limits: 2048 bytes per text message, 5 messages per reply window. */
const MAX_BYTES_PER_MESSAGE = 2048;
const MAX_MESSAGES_PER_WINDOW = 5;

/**
 * Split a text string into chunks that each fit within `maxBytes` when
 * encoded as UTF-8. Splits prefer sentence boundaries (period, question
 * mark, exclamation mark, or newline), falling back to word boundaries,
 * and ultimately to a hard byte cut.
 */
export function splitMessage(
  text: string,
  maxBytes: number = MAX_BYTES_PER_MESSAGE,
): string[] {
  if (text.length === 0) return [];

  const encoder = new TextEncoder();
  const totalBytes = encoder.encode(text).byteLength;

  if (totalBytes <= maxBytes) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const remainingBytes = encoder.encode(remaining).byteLength;
    if (remainingBytes <= maxBytes) {
      chunks.push(remaining);
      break;
    }

    // Find a cut point that fits within maxBytes
    const cutIndex = findCutIndex(remaining, maxBytes, encoder);
    chunks.push(remaining.slice(0, cutIndex).trimEnd());
    remaining = remaining.slice(cutIndex).trimStart();
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Find the best character index to cut the string so the UTF-8 byte
 * length of the prefix is <= maxBytes.
 */
function findCutIndex(
  text: string,
  maxBytes: number,
  encoder: TextEncoder,
): number {
  // Binary search for the maximum character count that fits
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const byteLen = encoder.encode(text.slice(0, mid)).byteLength;
    if (byteLen <= maxBytes) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  const hardLimit = lo;
  if (hardLimit === 0) {
    // Edge case: even a single character exceeds maxBytes (should not happen
    // with 2048-byte limit, but be defensive)
    return 1;
  }

  // Try to find a sentence boundary within the last ~25% of the chunk
  const searchStart = Math.max(0, Math.floor(hardLimit * 0.75));
  const searchRegion = text.slice(searchStart, hardLimit);

  // Prefer sentence-ending punctuation followed by whitespace or end of string
  const sentenceRe = /[.!?\u3002\uff01\uff1f\n]/g;
  let lastSentenceEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = sentenceRe.exec(searchRegion)) !== null) {
    lastSentenceEnd = searchStart + m.index + 1;
  }
  if (lastSentenceEnd > 0) return lastSentenceEnd;

  // Fall back to a word boundary (space)
  const lastSpace = text.lastIndexOf(" ", hardLimit);
  if (lastSpace > searchStart) return lastSpace + 1;

  // No good boundary; hard cut
  return hardLimit;
}

export class ReplyHandler {
  constructor(private readonly wsClient: RelayWsClient) {}

  /**
   * Send a reply to the specified user. Long messages are automatically
   * split to fit the 2048-byte limit. At most 5 chunks are sent per call
   * (WeChat 48-hour window constraint).
   */
  async sendReply(externalUserId: string, text: string): Promise<void> {
    const chunks = splitMessage(text, MAX_BYTES_PER_MESSAGE);
    const toSend = chunks.slice(0, MAX_MESSAGES_PER_WINDOW);

    if (chunks.length > MAX_MESSAGES_PER_WINDOW) {
      log.warn(
        `Message split into ${chunks.length} chunks but only ${MAX_MESSAGES_PER_WINDOW} allowed; truncating`,
      );
    }

    for (const chunk of toSend) {
      const id = randomUUID();
      this.wsClient.send({
        type: "reply",
        id,
        external_user_id: externalUserId,
        content: chunk,
      });
    }
  }
}
