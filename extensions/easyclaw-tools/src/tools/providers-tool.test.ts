import { describe, it, expect, vi, beforeEach } from "vitest";
import { createProvidersTool } from "./providers-tool.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(status: number, body: unknown) {
  return { status, json: () => Promise.resolve(body) };
}

describe("createProvidersTool", () => {
  const tool = createProvidersTool();

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns a valid tool definition", () => {
    expect(tool.name).toBe("providers");
    expect(tool.label).toBe("Providers");
    expect(tool.ownerOnly).toBe(true);
    expect(typeof tool.execute).toBe("function");
  });

  // --- list ---

  it("list action calls GET /api/provider-keys", async () => {
    const keys = [{ id: "k1", provider: "openai", label: "Default" }];
    mockFetch.mockResolvedValueOnce(mockResponse(200, { keys }));

    const result = await tool.execute("t1", { action: "list" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.keys).toEqual(keys);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3210/api/provider-keys",
      expect.objectContaining({ headers: expect.objectContaining({ "Content-Type": "application/json" }) }),
    );
  });

  // --- add ---

  it("add action calls POST with provider and apiKey", async () => {
    const entry = { id: "new-id", provider: "anthropic", label: "My Key", model: "claude-sonnet-4-5-20250929" };
    mockFetch.mockResolvedValueOnce(mockResponse(201, entry));

    const result = await tool.execute("t2", {
      action: "add",
      provider: "anthropic",
      apiKey: "sk-ant-xxx",
      label: "My Key",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe("new-id");
    expect(parsed.provider).toBe("anthropic");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:3210/api/provider-keys");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.provider).toBe("anthropic");
    expect(body.apiKey).toBe("sk-ant-xxx");
    expect(body.label).toBe("My Key");
  });

  it("add action returns error when provider is missing", async () => {
    const result = await tool.execute("t3", { action: "add", apiKey: "sk-xxx" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain("provider");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("add action returns error when apiKey is missing", async () => {
    const result = await tool.execute("t4", { action: "add", provider: "openai" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain("apiKey");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("add action surfaces server validation error (422)", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(422, { error: "Invalid API key" }));

    const result = await tool.execute("t5", {
      action: "add",
      provider: "openai",
      apiKey: "bad-key",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe("Invalid API key");
  });

  // --- activate ---

  it("activate action calls POST to /activate endpoint", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const result = await tool.execute("t6", { action: "activate", id: "key-uuid" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:3210/api/provider-keys/key-uuid/activate");
    expect(init.method).toBe("POST");
  });

  it("activate action returns error when id is missing", async () => {
    const result = await tool.execute("t7", { action: "activate" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain("id");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("activate action surfaces 404 error", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(404, { error: "Key not found" }));

    const result = await tool.execute("t8", { action: "activate", id: "no-such" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBe("Key not found");
  });

  // --- remove ---

  it("remove action calls DELETE", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse(200, { ok: true }));

    const result = await tool.execute("t9", { action: "remove", id: "key-uuid" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:3210/api/provider-keys/key-uuid");
    expect(init.method).toBe("DELETE");
  });

  it("remove action returns error when id is missing", async () => {
    const result = await tool.execute("t10", { action: "remove" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain("id");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // --- error handling ---

  it("returns helpful error when panel-server is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("fetch failed"));

    const result = await tool.execute("t11", { action: "list" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain("panel server");
    expect(parsed.error).toContain("fetch failed");
  });

  it("unknown action returns error", async () => {
    const result = await tool.execute("t12", { action: "unknown" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain("Unknown action");
  });
});
