import { describe, it, expect } from "vitest";
import { createCipheriv, randomBytes } from "node:crypto";
import { decrypt } from "../decrypt.js";
import { decodeEncodingAESKey } from "../encoding-aes-key.js";

/**
 * Helper to create an encrypted test payload in WeCom format:
 *   random(16 bytes) + msg_length(4 bytes big-endian) + msg(msg_length bytes) + corpid
 * Then AES-256-CBC encrypt with PKCS#7 padding, and base64 encode.
 */
function createTestEncrypted(
  message: string,
  corpId: string,
  aesKey: Buffer,
  iv: Buffer,
): string {
  const msgBuf = Buffer.from(message, "utf-8");
  const corpIdBuf = Buffer.from(corpId, "utf-8");
  const randomBuf = randomBytes(16);

  const msgLenBuf = Buffer.alloc(4);
  msgLenBuf.writeUInt32BE(msgBuf.length, 0);

  const plaintext = Buffer.concat([randomBuf, msgLenBuf, msgBuf, corpIdBuf]);

  // Add PKCS#7 padding
  const blockSize = 32;
  const padLength = blockSize - (plaintext.length % blockSize);
  const padding = Buffer.alloc(padLength, padLength);
  const padded = Buffer.concat([plaintext, padding]);

  const cipher = createCipheriv("aes-256-cbc", aesKey, iv);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);

  return encrypted.toString("base64");
}

describe("decrypt", () => {
  // Use a known 43-char key for testing
  const encodingAESKey = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
  const keyPair = decodeEncodingAESKey(encodingAESKey);
  const corpId = "testcorpid123";

  it("should decrypt a known test vector", () => {
    const originalMessage = "<xml><Content>Hello World</Content></xml>";
    const encrypted = createTestEncrypted(originalMessage, corpId, keyPair.aesKey, keyPair.iv);

    const result = decrypt(encrypted, keyPair, corpId);
    expect(result).toBe(originalMessage);
  });

  it("should decrypt messages with Unicode content", () => {
    const originalMessage = "<xml><Content>你好世界 🌍</Content></xml>";
    const encrypted = createTestEncrypted(originalMessage, corpId, keyPair.aesKey, keyPair.iv);

    const result = decrypt(encrypted, keyPair, corpId);
    expect(result).toBe(originalMessage);
  });

  it("should throw on corpid mismatch", () => {
    const originalMessage = "<xml><Content>Test</Content></xml>";
    const encrypted = createTestEncrypted(originalMessage, corpId, keyPair.aesKey, keyPair.iv);

    expect(() => decrypt(encrypted, keyPair, "wrongcorpid")).toThrow("CorpID mismatch");
  });

  it("should decrypt empty messages", () => {
    const originalMessage = "";
    const encrypted = createTestEncrypted(originalMessage, corpId, keyPair.aesKey, keyPair.iv);

    const result = decrypt(encrypted, keyPair, corpId);
    expect(result).toBe(originalMessage);
  });
});
