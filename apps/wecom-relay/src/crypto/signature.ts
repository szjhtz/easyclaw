import { createHash } from "node:crypto";

/**
 * Verify WeChat Work callback signature.
 *
 * Sort [token, timestamp, nonce, encrypt] lexicographically,
 * concatenate them, compute SHA1 hash, and compare with the provided signature.
 */
export function computeSignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string,
): string {
  const items = [token, timestamp, nonce, encrypt].sort();
  const str = items.join("");
  return createHash("sha1").update(str).digest("hex");
}

export function verifySignature(
  token: string,
  timestamp: string,
  nonce: string,
  encrypt: string,
  msgSignature: string,
): boolean {
  const computed = computeSignature(token, timestamp, nonce, encrypt);
  return computed === msgSignature;
}
