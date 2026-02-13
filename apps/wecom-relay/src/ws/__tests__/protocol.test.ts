import { describe, it, expect } from "vitest";
import { encodeFrame, decodeFrame } from "../protocol.js";
import type {
  HelloFrame,
  InboundFrame,
  ReplyFrame,
  AckFrame,
  ErrorFrame,
} from "../../types.js";

describe("protocol", () => {
  describe("encodeFrame / decodeFrame roundtrip", () => {
    it("should roundtrip a hello frame", () => {
      const frame: HelloFrame = {
        type: "hello",
        gateway_id: "gw-123",
        auth_token: "secret-token",
      };

      const encoded = encodeFrame(frame);
      const decoded = decodeFrame(encoded);

      expect(decoded).toEqual(frame);
    });

    it("should roundtrip an inbound frame", () => {
      const frame: InboundFrame = {
        type: "inbound",
        id: "msg-001",
        external_user_id: "user-ext-001",
        msg_type: "text",
        content: "Hello, world!",
        timestamp: 1700000000,
      };

      const encoded = encodeFrame(frame);
      const decoded = decodeFrame(encoded);

      expect(decoded).toEqual(frame);
    });

    it("should roundtrip a reply frame", () => {
      const frame: ReplyFrame = {
        type: "reply",
        id: "msg-001",
        external_user_id: "user-ext-001",
        content: "Here is my response",
      };

      const encoded = encodeFrame(frame);
      const decoded = decodeFrame(encoded);

      expect(decoded).toEqual(frame);
    });

    it("should roundtrip an ack frame", () => {
      const frame: AckFrame = {
        type: "ack",
        id: "msg-001",
      };

      const encoded = encodeFrame(frame);
      const decoded = decodeFrame(encoded);

      expect(decoded).toEqual(frame);
    });

    it("should roundtrip an error frame", () => {
      const frame: ErrorFrame = {
        type: "error",
        message: "Something went wrong",
      };

      const encoded = encodeFrame(frame);
      const decoded = decodeFrame(encoded);

      expect(decoded).toEqual(frame);
    });
  });

  describe("decodeFrame error handling", () => {
    it("should throw on invalid JSON", () => {
      expect(() => decodeFrame("not json")).toThrow();
    });

    it("should throw on missing type field", () => {
      expect(() => decodeFrame('{"id": "123"}')).toThrow("missing type");
    });

    it("should throw on non-string type", () => {
      expect(() => decodeFrame('{"type": 123}')).toThrow("type must be a string");
    });

    it("should throw on unknown frame type", () => {
      expect(() => decodeFrame('{"type": "unknown_type"}')).toThrow("Invalid frame type");
    });

    it("should throw on null input", () => {
      expect(() => decodeFrame("null")).toThrow();
    });
  });

  describe("encodeFrame", () => {
    it("should produce valid JSON", () => {
      const frame: AckFrame = { type: "ack", id: "test" };
      const encoded = encodeFrame(frame);

      expect(() => JSON.parse(encoded)).not.toThrow();
    });

    it("should handle special characters in content", () => {
      const frame: ReplyFrame = {
        type: "reply",
        id: "1",
        external_user_id: "user",
        content: 'Hello "world"\n\ttab & <xml>',
      };

      const encoded = encodeFrame(frame);
      const decoded = decodeFrame(encoded);

      expect(decoded).toEqual(frame);
    });
  });
});
