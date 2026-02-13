import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { computeSignature, verifySignature } from "../signature.js";

describe("computeSignature", () => {
  it("should compute SHA1 of sorted, concatenated inputs", () => {
    const token = "testtoken";
    const timestamp = "1409659813";
    const nonce = "nonce123";
    const encrypt = "encrypteddata";

    // Manually compute expected signature
    const items = [token, timestamp, nonce, encrypt].sort();
    const expected = createHash("sha1").update(items.join("")).digest("hex");

    const result = computeSignature(token, timestamp, nonce, encrypt);
    expect(result).toBe(expected);
  });

  it("should produce same result regardless of input order significance", () => {
    // The function sorts the inputs, so the order of parameters should not matter
    // in terms of final hash (but the function signature fixes the order)
    const sig = computeSignature("B", "A", "D", "C");
    // Sorted: A, B, C, D → "ABCD"
    const expected = createHash("sha1").update("ABCD").digest("hex");
    expect(sig).toBe(expected);
  });
});

describe("verifySignature", () => {
  it("should return true for matching signature", () => {
    const token = "testtoken";
    const timestamp = "1409659813";
    const nonce = "nonce123";
    const encrypt = "encrypteddata";

    const items = [token, timestamp, nonce, encrypt].sort();
    const validSignature = createHash("sha1").update(items.join("")).digest("hex");

    expect(verifySignature(token, timestamp, nonce, encrypt, validSignature)).toBe(true);
  });

  it("should return false for non-matching signature", () => {
    const token = "testtoken";
    const timestamp = "1409659813";
    const nonce = "nonce123";
    const encrypt = "encrypteddata";

    expect(verifySignature(token, timestamp, nonce, encrypt, "invalidsignature")).toBe(false);
  });
});
