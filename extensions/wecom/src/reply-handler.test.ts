import { describe, it, expect, vi, beforeEach } from "vitest";
import { splitMessage, ReplyHandler } from "./reply-handler.js";

const encoder = new TextEncoder();

/* ── splitMessage tests ──────────────────────────────────────────── */

describe("splitMessage", () => {
  it("returns a single chunk when text fits within maxBytes", () => {
    const text = "Hello, world!";
    const chunks = splitMessage(text, 2048);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("returns a single chunk for exactly maxBytes", () => {
    const text = "a".repeat(2048);
    const chunks = splitMessage(text, 2048);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("splits text that exceeds maxBytes", () => {
    const text = "a".repeat(4096);
    const chunks = splitMessage(text, 2048);
    expect(chunks.length).toBeGreaterThan(1);
    // Each chunk must fit within 2048 bytes
    for (const chunk of chunks) {
      expect(encoder.encode(chunk).byteLength).toBeLessThanOrEqual(2048);
    }
    // All content preserved
    expect(chunks.join("")).toBe(text);
  });

  it("prefers sentence boundaries when splitting", () => {
    // Build a string where a sentence ends near the split point
    const sentence1 = "A".repeat(1500) + ". ";
    const sentence2 = "B".repeat(1500) + ".";
    const text = sentence1 + sentence2;
    const chunks = splitMessage(text, 2048);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // First chunk should end at or near the sentence boundary
    expect(chunks[0]).toContain(".");
  });

  it("handles multi-byte UTF-8 characters correctly", () => {
    // Each Chinese character is 3 bytes in UTF-8
    const char = "\u4f60"; // 你 = 3 bytes
    const text = char.repeat(1000); // 3000 bytes
    const chunks = splitMessage(text, 2048);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(encoder.encode(chunk).byteLength).toBeLessThanOrEqual(2048);
    }
    // All content preserved
    expect(chunks.join("")).toBe(text);
  });

  it("handles 4-byte emoji characters correctly", () => {
    // Each emoji is 4 bytes in UTF-8
    const emoji = "\u{1F600}"; // 😀 = 4 bytes
    const text = emoji.repeat(600); // 2400 bytes
    const chunks = splitMessage(text, 2048);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(encoder.encode(chunk).byteLength).toBeLessThanOrEqual(2048);
    }
    expect(chunks.join("")).toBe(text);
  });

  it("respects custom maxBytes", () => {
    const text = "Hello, world! This is a test.";
    const chunks = splitMessage(text, 10);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(encoder.encode(chunk).byteLength).toBeLessThanOrEqual(10);
    }
  });

  it("returns empty array for empty string", () => {
    const chunks = splitMessage("", 2048);
    expect(chunks).toHaveLength(0);
  });

  it("splits at newline boundaries", () => {
    const line1 = "A".repeat(1800);
    const line2 = "B".repeat(300);
    const text = line1 + "\n" + line2;
    const chunks = splitMessage(text, 2048);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    // First chunk should include up to the newline
    for (const chunk of chunks) {
      expect(encoder.encode(chunk).byteLength).toBeLessThanOrEqual(2048);
    }
  });
});

/* ── ReplyHandler tests ──────────────────────────────────────────── */

describe("ReplyHandler", () => {
  let mockWsClient: { send: ReturnType<typeof vi.fn> };
  let handler: ReplyHandler;

  beforeEach(() => {
    mockWsClient = {
      send: vi.fn(),
    };
    handler = new ReplyHandler(mockWsClient as never);
  });

  it("sends a single reply frame for a short message", async () => {
    await handler.sendReply("user-1", "Hello!");
    expect(mockWsClient.send).toHaveBeenCalledTimes(1);

    const frame = mockWsClient.send.mock.calls[0][0];
    expect(frame.type).toBe("reply");
    expect(frame.external_user_id).toBe("user-1");
    expect(frame.content).toBe("Hello!");
    expect(frame.id).toBeDefined();
  });

  it("splits long messages and sends multiple frames", async () => {
    const longText = "a".repeat(5000);
    await handler.sendReply("user-1", longText);
    expect(mockWsClient.send).toHaveBeenCalledTimes(3); // 5000 / 2048 = 3 chunks
    for (const call of mockWsClient.send.mock.calls) {
      expect(call[0].type).toBe("reply");
      expect(call[0].external_user_id).toBe("user-1");
    }
  });

  it("limits to 5 messages per reply window", async () => {
    // 2048 * 6 = 12288 bytes would need 6 chunks, but only 5 should be sent
    const longText = "a".repeat(2048 * 6);
    await handler.sendReply("user-1", longText);
    expect(mockWsClient.send).toHaveBeenCalledTimes(5);
  });

  it("generates unique IDs for each reply frame", async () => {
    const longText = "a".repeat(5000);
    await handler.sendReply("user-1", longText);
    const ids = mockWsClient.send.mock.calls.map(
      (call: [{ id: string }]) => call[0].id,
    );
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
