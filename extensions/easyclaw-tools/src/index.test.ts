import { describe, it, expect } from "vitest";
import plugin from "./index.js";

describe("easyclaw-tools plugin", () => {
  it("exports a valid plugin definition", () => {
    expect(plugin.id).toBe("easyclaw-tools");
    expect(plugin.name).toBe("EasyClaw Tools");
    expect(typeof plugin.activate).toBe("function");
  });

  it("registers before_prompt_build hook and tool on activate", () => {
    const hooks: string[] = [];
    const tools: unknown[] = [];

    const mockApi = {
      logger: { info: () => {} },
      on(event: string) { hooks.push(event); },
      registerTool(factory: unknown) { tools.push(factory); },
    };

    plugin.activate(mockApi);

    expect(hooks).toContain("before_prompt_build");
    expect(hooks).not.toContain("before_agent_start");
    expect(tools).toHaveLength(2);
  });
});
