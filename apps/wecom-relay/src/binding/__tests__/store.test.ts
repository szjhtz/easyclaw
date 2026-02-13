import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createBindingStore, type BindingStore } from "../store.js";

describe("BindingStore", () => {
  let store: BindingStore;

  beforeEach(() => {
    store = createBindingStore(":memory:");
  });

  afterEach(() => {
    store.close();
  });

  describe("bind / lookup / unbind", () => {
    it("should bind and lookup a user", () => {
      store.bind("user_001", "gateway_abc");
      expect(store.lookup("user_001")).toBe("gateway_abc");
    });

    it("should return undefined for unbound users", () => {
      expect(store.lookup("nonexistent")).toBeUndefined();
    });

    it("should update binding on re-bind", () => {
      store.bind("user_001", "gateway_abc");
      store.bind("user_001", "gateway_xyz");
      expect(store.lookup("user_001")).toBe("gateway_xyz");
    });

    it("should unbind a user", () => {
      store.bind("user_001", "gateway_abc");
      store.unbind("user_001");
      expect(store.lookup("user_001")).toBeUndefined();
    });

    it("should not throw when unbinding a non-existent user", () => {
      expect(() => store.unbind("nonexistent")).not.toThrow();
    });
  });

  describe("pending bindings", () => {
    it("should create and resolve a pending binding", () => {
      store.createPendingBinding("token123", "gateway_abc");
      const gatewayId = store.resolvePendingBinding("token123");
      expect(gatewayId).toBe("gateway_abc");
    });

    it("should delete pending binding after resolution", () => {
      store.createPendingBinding("token123", "gateway_abc");
      store.resolvePendingBinding("token123");
      // Second resolution should return undefined
      expect(store.resolvePendingBinding("token123")).toBeUndefined();
    });

    it("should return undefined for non-existent token", () => {
      expect(store.resolvePendingBinding("nonexistent")).toBeUndefined();
    });

    it("should overwrite pending binding with same token", () => {
      store.createPendingBinding("token123", "gateway_abc");
      store.createPendingBinding("token123", "gateway_xyz");
      expect(store.resolvePendingBinding("token123")).toBe("gateway_xyz");
    });

    it("should handle multiple pending bindings", () => {
      store.createPendingBinding("token_a", "gateway_1");
      store.createPendingBinding("token_b", "gateway_2");
      store.createPendingBinding("token_c", "gateway_3");

      expect(store.resolvePendingBinding("token_b")).toBe("gateway_2");
      expect(store.resolvePendingBinding("token_a")).toBe("gateway_1");
      expect(store.resolvePendingBinding("token_c")).toBe("gateway_3");
    });
  });

  describe("multiple bindings", () => {
    it("should handle multiple users bound to different gateways", () => {
      store.bind("user_001", "gateway_a");
      store.bind("user_002", "gateway_b");
      store.bind("user_003", "gateway_a");

      expect(store.lookup("user_001")).toBe("gateway_a");
      expect(store.lookup("user_002")).toBe("gateway_b");
      expect(store.lookup("user_003")).toBe("gateway_a");
    });
  });
});
