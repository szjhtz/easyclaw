/**
 * Decode WeChat Work's 43-character EncodingAESKey into a 32-byte AES key and 16-byte IV.
 *
 * WeChat Work provides a 43-char base64-encoded key (without trailing `=`).
 * We append `=` to make valid base64, decode to 32 bytes.
 * The IV is the first 16 bytes of the key.
 */
export interface AESKeyPair {
  aesKey: Buffer;
  iv: Buffer;
}

export function decodeEncodingAESKey(encodingAESKey: string): AESKeyPair {
  if (encodingAESKey.length !== 43) {
    throw new Error(`EncodingAESKey must be 43 characters, got ${encodingAESKey.length}`);
  }

  const aesKey = Buffer.from(encodingAESKey + "=", "base64");

  if (aesKey.length !== 32) {
    throw new Error(`Decoded AES key must be 32 bytes, got ${aesKey.length}`);
  }

  const iv = aesKey.subarray(0, 16);

  return { aesKey, iv };
}
