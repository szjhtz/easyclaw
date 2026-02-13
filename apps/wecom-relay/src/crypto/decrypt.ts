import { createDecipheriv } from "node:crypto";
import type { AESKeyPair } from "./encoding-aes-key.js";

/**
 * Decrypt a WeChat Work encrypted message.
 *
 * Decrypted buffer format:
 *   random(16 bytes) + msg_length(4 bytes big-endian) + msg(msg_length bytes) + corpid(remaining)
 *
 * Uses AES-256-CBC with PKCS#7 padding (handled manually since WeCom uses its own padding).
 */
export function decrypt(
  encryptedBase64: string,
  keyPair: AESKeyPair,
  expectedCorpId: string,
): string {
  const { aesKey, iv } = keyPair;

  const decipher = createDecipheriv("aes-256-cbc", aesKey, iv);
  decipher.setAutoPadding(false);

  const encrypted = Buffer.from(encryptedBase64, "base64");
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  // Strip PKCS#7 padding
  const padLength = decrypted[decrypted.length - 1]!;
  if (padLength < 1 || padLength > 32) {
    throw new Error(`Invalid PKCS#7 padding value: ${padLength}`);
  }
  const unpadded = decrypted.subarray(0, decrypted.length - padLength);

  // Skip 16 random bytes
  const msgLengthBuf = unpadded.subarray(16, 20);
  const msgLength = msgLengthBuf.readUInt32BE(0);

  const msg = unpadded.subarray(20, 20 + msgLength).toString("utf-8");
  const corpId = unpadded.subarray(20 + msgLength).toString("utf-8");

  if (corpId !== expectedCorpId) {
    throw new Error(`CorpID mismatch: expected "${expectedCorpId}", got "${corpId}"`);
  }

  return msg;
}
