import { describe, it, expect } from "vitest";
import {
  isHelloFrame,
  isInboundFrame,
  isReplyFrame,
  isAckFrame,
  isErrorFrame,
  parseFrame,
  type WsFrame,
} from "./types.js";

/* ── Type guard tests ────────────────────────────────────────────── */

describe("type guards", () => {
  const helloFrame: WsFrame = {
    type: "hello",
    gateway_id: "gw-01",
    auth_token: "secret",
  };

  const inboundFrame: WsFrame = {
    type: "inbound",
    id: "msg-1",
    external_user_id: "user-1",
    msg_type: "text",
    content: "Hello",
    timestamp: Date.now(),
  };

  const replyFrame: WsFrame = {
    type: "reply",
    id: "reply-1",
    external_user_id: "user-1",
    content: "Hi there",
  };

  const ackFrame: WsFrame = {
    type: "ack",
    id: "msg-1",
  };

  const errorFrame: WsFrame = {
    type: "error",
    message: "unauthorized",
  };

  it("isHelloFrame identifies hello frames", () => {
    expect(isHelloFrame(helloFrame)).toBe(true);
    expect(isHelloFrame(inboundFrame)).toBe(false);
    expect(isHelloFrame(replyFrame)).toBe(false);
    expect(isHelloFrame(ackFrame)).toBe(false);
    expect(isHelloFrame(errorFrame)).toBe(false);
  });

  it("isInboundFrame identifies inbound frames", () => {
    expect(isInboundFrame(inboundFrame)).toBe(true);
    expect(isInboundFrame(helloFrame)).toBe(false);
    expect(isInboundFrame(ackFrame)).toBe(false);
  });

  it("isReplyFrame identifies reply frames", () => {
    expect(isReplyFrame(replyFrame)).toBe(true);
    expect(isReplyFrame(helloFrame)).toBe(false);
    expect(isReplyFrame(inboundFrame)).toBe(false);
  });

  it("isAckFrame identifies ack frames", () => {
    expect(isAckFrame(ackFrame)).toBe(true);
    expect(isAckFrame(helloFrame)).toBe(false);
    expect(isAckFrame(errorFrame)).toBe(false);
  });

  it("isErrorFrame identifies error frames", () => {
    expect(isErrorFrame(errorFrame)).toBe(true);
    expect(isErrorFrame(helloFrame)).toBe(false);
    expect(isErrorFrame(ackFrame)).toBe(false);
  });
});

/* ── parseFrame tests ────────────────────────────────────────────── */

describe("parseFrame", () => {
  it("parses a valid hello frame", () => {
    const raw = JSON.stringify({
      type: "hello",
      gateway_id: "gw-01",
      auth_token: "token",
    });
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect(frame!.type).toBe("hello");
  });

  it("parses a valid inbound frame", () => {
    const raw = JSON.stringify({
      type: "inbound",
      id: "msg-1",
      external_user_id: "user-1",
      msg_type: "text",
      content: "Hi",
      timestamp: 1700000000,
    });
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect(frame!.type).toBe("inbound");
    expect(isInboundFrame(frame!)).toBe(true);
  });

  it("parses a valid ack frame", () => {
    const raw = JSON.stringify({ type: "ack", id: "msg-1" });
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect(isAckFrame(frame!)).toBe(true);
  });

  it("parses a valid error frame", () => {
    const raw = JSON.stringify({ type: "error", message: "bad auth" });
    const frame = parseFrame(raw);
    expect(frame).not.toBeNull();
    expect(isErrorFrame(frame!)).toBe(true);
  });

  it("returns null for invalid JSON", () => {
    expect(parseFrame("not json")).toBeNull();
  });

  it("returns null for JSON without a known type", () => {
    expect(parseFrame(JSON.stringify({ type: "unknown" }))).toBeNull();
    expect(parseFrame(JSON.stringify({ foo: "bar" }))).toBeNull();
  });

  it("returns null for non-object JSON values", () => {
    expect(parseFrame('"hello"')).toBeNull();
    expect(parseFrame("42")).toBeNull();
    expect(parseFrame("null")).toBeNull();
    expect(parseFrame("true")).toBeNull();
  });
});
