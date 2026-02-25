import { describe, it, expect } from "vitest";
import { createEasyClawTool } from "./easyclaw-tool.js";

describe("createEasyClawTool", () => {
  const tool = createEasyClawTool({
    config: { provider: "anthropic", model: "claude-sonnet-4-5-20250929" },
  });

  it("returns a valid tool definition", () => {
    expect(tool.name).toBe("easyclaw");
    expect(tool.label).toBe("EasyClaw");
    expect(typeof tool.execute).toBe("function");
  });

  it("status action returns runtime info", async () => {
    const result = await tool.execute("test-id", { action: "status" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.runtime).toBe("easyclaw-desktop");
    expect(parsed.gatewayStatus).toBe("running");
    expect(parsed.provider).toBe("anthropic");
    expect(parsed.model).toBe("claude-sonnet-4-5-20250929");
    expect(parsed.platform).toBe(process.platform);
  });

  it("help action returns available tools", async () => {
    const result = await tool.execute("test-id", { action: "help" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.availableTools).toHaveLength(3);
    expect(parsed.availableTools[0].tool).toBe("gateway");
    expect(parsed.availableTools[1].tool).toBe("providers");
    expect(parsed.availableTools[2].tool).toBe("easyclaw");
    expect(parsed.tips).toBeDefined();
  });

  it("unknown action returns error", async () => {
    const result = await tool.execute("test-id", { action: "unknown" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain("Unknown action");
  });

  it("handles missing config gracefully", async () => {
    const noConfigTool = createEasyClawTool();
    const result = await noConfigTool.execute("test-id", { action: "status" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.provider).toBe("unknown");
    expect(parsed.model).toBe("unknown");
  });
});
