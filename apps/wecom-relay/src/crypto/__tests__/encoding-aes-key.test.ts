import { describe, it, expect } from "vitest";
import { decodeEncodingAESKey } from "../encoding-aes-key.js";

describe("decodeEncodingAESKey", () => {
  it("should decode a 43-char base64 key to a 32-byte buffer", () => {
    // 43 base64 chars (without =) that decode to exactly 32 bytes
    const encodingAESKey = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

    const { aesKey, iv } = decodeEncodingAESKey(encodingAESKey);

    expect(aesKey).toBeInstanceOf(Buffer);
    expect(aesKey.length).toBe(32);
    expect(iv).toBeInstanceOf(Buffer);
    expect(iv.length).toBe(16);
  });

  it("should use first 16 bytes of key as IV", () => {
    const encodingAESKey = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
    const { aesKey, iv } = decodeEncodingAESKey(encodingAESKey);

    expect(iv).toEqual(aesKey.subarray(0, 16));
  });

  it("should throw if key is not 43 characters", () => {
    expect(() => decodeEncodingAESKey("short")).toThrow("43 characters");
    expect(() => decodeEncodingAESKey("a".repeat(42))).toThrow("43 characters");
    expect(() => decodeEncodingAESKey("a".repeat(44))).toThrow("43 characters");
  });

  it("should produce consistent output for the same input", () => {
    const key = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
    const result1 = decodeEncodingAESKey(key);
    const result2 = decodeEncodingAESKey(key);

    expect(result1.aesKey).toEqual(result2.aesKey);
    expect(result1.iv).toEqual(result2.iv);
  });
});
