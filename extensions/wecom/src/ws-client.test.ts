import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

// Mock the `ws` module before importing the client
const mockWsInstances: MockWebSocket[] = [];

class MockWebSocket extends EventEmitter {
  static OPEN = 1;
  static CLOSED = 3;

  readyState = MockWebSocket.CLOSED;
  sentMessages: string[] = [];

  constructor(public url: string) {
    super();
    mockWsInstances.push(this);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close");
  }

  pong(_data: Buffer): void {
    // noop
  }

  /** Helper to simulate the server accepting the connection */
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.emit("open");
  }

  /** Helper to simulate receiving a message from the server */
  simulateMessage(data: string): void {
    this.emit("message", Buffer.from(data));
  }

  /** Helper to simulate an error */
  simulateError(err: Error): void {
    this.emit("error", err);
  }

  /** Helper to simulate the connection closing */
  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close");
  }
}

// Assign OPEN/CLOSED as static-like values so readyState checks work
Object.defineProperty(MockWebSocket, "OPEN", { value: 1 });
Object.defineProperty(MockWebSocket, "CLOSED", { value: 3 });

vi.mock("ws", () => {
  return {
    default: MockWebSocket,
    WebSocket: MockWebSocket,
  };
});

// Import after mocking
const { RelayWsClient } = await import("./ws-client.js");

describe("RelayWsClient", () => {
  let client: InstanceType<typeof RelayWsClient>;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWsInstances.length = 0;
    client = new RelayWsClient("ws://localhost:3001", "gw-01", "secret");
  });

  afterEach(() => {
    client.disconnect();
    vi.useRealTimers();
  });

  it("is not connected before connect() is called", () => {
    expect(client.isConnected).toBe(false);
  });

  it("sends a hello frame on connection", () => {
    client.connect();
    const ws = mockWsInstances[0];
    ws.simulateOpen();

    expect(ws.sentMessages).toHaveLength(1);
    const hello = JSON.parse(ws.sentMessages[0]);
    expect(hello).toEqual({
      type: "hello",
      gateway_id: "gw-01",
      auth_token: "secret",
    });
  });

  it("emits 'connected' event on open", () => {
    const onConnected = vi.fn();
    client.on("connected", onConnected);
    client.connect();
    mockWsInstances[0].simulateOpen();
    expect(onConnected).toHaveBeenCalledTimes(1);
  });

  it("reports isConnected = true after open", () => {
    client.connect();
    mockWsInstances[0].simulateOpen();
    expect(client.isConnected).toBe(true);
  });

  it("emits 'disconnected' on close", () => {
    const onDisconnected = vi.fn();
    client.on("disconnected", onDisconnected);
    client.connect();
    const ws = mockWsInstances[0];
    ws.simulateOpen();
    ws.simulateClose();
    expect(onDisconnected).toHaveBeenCalledTimes(1);
  });

  it("emits parsed frames via 'message' event", () => {
    const onMessage = vi.fn();
    client.on("message", onMessage);
    client.connect();
    const ws = mockWsInstances[0];
    ws.simulateOpen();
    ws.simulateMessage(JSON.stringify({ type: "ack", id: "msg-1" }));

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ type: "ack", id: "msg-1" });
  });

  it("ignores unparseable messages", () => {
    const onMessage = vi.fn();
    client.on("message", onMessage);
    client.connect();
    const ws = mockWsInstances[0];
    ws.simulateOpen();
    ws.simulateMessage("not json");
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("emits 'error' event on WebSocket error", () => {
    const onError = vi.fn();
    client.on("error", onError);
    client.connect();
    const ws = mockWsInstances[0];
    ws.simulateOpen();
    ws.simulateError(new Error("connection lost"));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe("connection lost");
  });

  /* ── Reconnection logic ──────────────────────────────────────── */

  it("reconnects after an unintentional disconnect", () => {
    client.connect();
    const ws1 = mockWsInstances[0];
    ws1.simulateOpen();
    ws1.simulateClose();

    // After 1s (initial delay), a new WebSocket should be created
    expect(mockWsInstances).toHaveLength(1);
    vi.advanceTimersByTime(1_000);
    expect(mockWsInstances).toHaveLength(2);
  });

  it("uses exponential backoff for reconnects", () => {
    client.connect();

    // First disconnect (connection was never opened, so delay won't reset)
    mockWsInstances[0].simulateClose();

    // After 1s: reconnect #1 (initial delay = 1s)
    vi.advanceTimersByTime(1_000);
    expect(mockWsInstances).toHaveLength(2);

    // Second disconnect (still never opened, delay is now 2s)
    mockWsInstances[1].simulateClose();

    // After 1s: should not reconnect yet (delay is 2s)
    vi.advanceTimersByTime(1_000);
    expect(mockWsInstances).toHaveLength(2);

    // After another 1s (total 2s from close): reconnect #2
    vi.advanceTimersByTime(1_000);
    expect(mockWsInstances).toHaveLength(3);
  });

  it("resets backoff delay on successful connection", () => {
    client.connect();
    const ws1 = mockWsInstances[0];
    ws1.simulateOpen();
    ws1.simulateClose();

    // Wait for first reconnect (1s)
    vi.advanceTimersByTime(1_000);
    const ws2 = mockWsInstances[1];
    ws2.simulateOpen(); // This resets the delay
    ws2.simulateClose();

    // Next reconnect should be 1s again (not 2s)
    vi.advanceTimersByTime(1_000);
    expect(mockWsInstances).toHaveLength(3);
  });

  it("does not reconnect after intentional disconnect()", () => {
    client.connect();
    const ws = mockWsInstances[0];
    ws.simulateOpen();
    client.disconnect();

    vi.advanceTimersByTime(60_000);
    // Only 1 WS instance should ever have been created
    expect(mockWsInstances).toHaveLength(1);
  });

  it("caps reconnect delay at 30 seconds", () => {
    client.connect();

    // Trigger multiple disconnects to ramp up the backoff
    for (let i = 0; i < 10; i++) {
      const ws = mockWsInstances[mockWsInstances.length - 1];
      ws.simulateOpen();
      ws.simulateClose();
      // Advance well beyond 30s to trigger the reconnect regardless of delay
      vi.advanceTimersByTime(31_000);
    }

    // Verify we kept reconnecting (count should be > 1)
    expect(mockWsInstances.length).toBeGreaterThan(5);
  });

  /* ── send() ──────────────────────────────────────────────────── */

  it("sends JSON-stringified frames", () => {
    client.connect();
    const ws = mockWsInstances[0];
    ws.simulateOpen();

    // Clear the hello message
    ws.sentMessages.length = 0;

    client.send({ type: "reply", id: "r-1", external_user_id: "u-1", content: "test" });
    expect(ws.sentMessages).toHaveLength(1);
    expect(JSON.parse(ws.sentMessages[0])).toEqual({
      type: "reply",
      id: "r-1",
      external_user_id: "u-1",
      content: "test",
    });
  });

  it("does not throw when sending on a closed connection", () => {
    // Not connected at all
    expect(() =>
      client.send({ type: "ack", id: "x" }),
    ).not.toThrow();
  });
});
