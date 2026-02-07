import { describe, it, expect, vi } from "vitest";
import { createPolicyInjector } from "./policy-injector.js";
import { createGuardEvaluator } from "./guard-evaluator.js";
import { createEasyClawPlugin } from "./plugin.js";
import type {
  PolicyProvider,
  GuardProvider,
  AgentStartContext,
  ToolCallContext,
  OpenClawPluginAPI,
} from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePolicyProvider(policyView: string): PolicyProvider {
  return { getCompiledPolicyView: () => policyView };
}

function makeGuardProvider(
  guards: Array<{ id: string; ruleId: string; content: string }>,
): GuardProvider {
  return { getActiveGuards: () => guards };
}

function makeGuardContent(
  condition: string,
  action: string,
  reason: string,
): string {
  return JSON.stringify({ type: "guard", condition, action, reason });
}

// ---------------------------------------------------------------------------
// Policy Injector Tests
// ---------------------------------------------------------------------------

describe("createPolicyInjector", () => {
  it("returns original context when no policy is available", () => {
    const handler = createPolicyInjector(makePolicyProvider(""));
    const ctx: AgentStartContext = { prependContext: "existing context" };

    const result = handler(ctx);

    expect(result.prependContext).toBe("existing context");
  });

  it("prepends policy block when policy exists", () => {
    const handler = createPolicyInjector(
      makePolicyProvider("Do not use sudo."),
    );
    const ctx: AgentStartContext = { prependContext: "" };

    const result = handler(ctx);

    expect(result.prependContext).toContain("--- EasyClaw Policy ---");
    expect(result.prependContext).toContain("Do not use sudo.");
    expect(result.prependContext).toContain("--- End Policy ---");
  });

  it("preserves existing prependContext after policy block", () => {
    const handler = createPolicyInjector(
      makePolicyProvider("Be careful with files."),
    );
    const ctx: AgentStartContext = { prependContext: "System instructions here" };

    const result = handler(ctx);

    expect(result.prependContext).toContain("--- EasyClaw Policy ---");
    expect(result.prependContext).toContain("Be careful with files.");
    expect(result.prependContext).toContain("--- End Policy ---");
    expect(result.prependContext).toContain("System instructions here");
    // Policy should come before existing context
    const policyEnd = result.prependContext.indexOf("--- End Policy ---");
    const existingStart = result.prependContext.indexOf(
      "System instructions here",
    );
    expect(policyEnd).toBeLessThan(existingStart);
  });

  it("handles empty string policy by passing through", () => {
    const handler = createPolicyInjector(makePolicyProvider(""));
    const ctx: AgentStartContext = { prependContext: "" };

    const result = handler(ctx);

    expect(result.prependContext).toBe("");
  });

  it("handles empty prependContext with policy present", () => {
    const handler = createPolicyInjector(
      makePolicyProvider("Rule: always explain."),
    );
    const ctx: AgentStartContext = { prependContext: "" };

    const result = handler(ctx);

    expect(result.prependContext).toContain("Rule: always explain.");
    // Should not have a trailing newline + empty context appended
    expect(result.prependContext).not.toContain("\n\n\n");
  });
});

// ---------------------------------------------------------------------------
// Guard Evaluator Tests
// ---------------------------------------------------------------------------

describe("createGuardEvaluator", () => {
  it("returns pass-through when no guards exist", () => {
    const handler = createGuardEvaluator(makeGuardProvider([]));
    const ctx: ToolCallContext = {
      toolName: "write_file",
      params: { path: "/tmp/test.txt" },
    };

    const result = handler(ctx);

    expect(result.block).toBeUndefined();
    expect(result.blockReason).toBeUndefined();
  });

  it("blocks tool call matching tool name condition", () => {
    const guards = [
      {
        id: "g1",
        ruleId: "r1",
        content: makeGuardContent(
          "tool:write_file",
          "block",
          "File writing is not allowed",
        ),
      },
    ];
    const handler = createGuardEvaluator(makeGuardProvider(guards));
    const ctx: ToolCallContext = {
      toolName: "write_file",
      params: { path: "/tmp/test.txt" },
    };

    const result = handler(ctx);

    expect(result.block).toBe(true);
    expect(result.blockReason).toBe("File writing is not allowed");
  });

  it("blocks tool call matching path condition", () => {
    const guards = [
      {
        id: "g2",
        ruleId: "r2",
        content: makeGuardContent(
          "path:/etc/*",
          "block",
          "Cannot modify system files",
        ),
      },
    ];
    const handler = createGuardEvaluator(makeGuardProvider(guards));
    const ctx: ToolCallContext = {
      toolName: "write_file",
      params: { path: "/etc/passwd" },
    };

    const result = handler(ctx);

    expect(result.block).toBe(true);
    expect(result.blockReason).toBe("Cannot modify system files");
  });

  it("allows tool call that does not match any guard", () => {
    const guards = [
      {
        id: "g3",
        ruleId: "r3",
        content: makeGuardContent(
          "tool:delete_file",
          "block",
          "Deletion not allowed",
        ),
      },
      {
        id: "g4",
        ruleId: "r4",
        content: makeGuardContent(
          "path:/etc/*",
          "block",
          "System files protected",
        ),
      },
    ];
    const handler = createGuardEvaluator(makeGuardProvider(guards));
    const ctx: ToolCallContext = {
      toolName: "read_file",
      params: { path: "/home/user/doc.txt" },
    };

    const result = handler(ctx);

    expect(result.block).toBeUndefined();
  });

  it("first blocking guard wins when multiple guards match", () => {
    const guards = [
      {
        id: "g5",
        ruleId: "r5",
        content: makeGuardContent(
          "tool:write_file",
          "block",
          "First guard: no writing",
        ),
      },
      {
        id: "g6",
        ruleId: "r6",
        content: makeGuardContent(
          "tool:write_file",
          "block",
          "Second guard: also no writing",
        ),
      },
    ];
    const handler = createGuardEvaluator(makeGuardProvider(guards));
    const ctx: ToolCallContext = {
      toolName: "write_file",
      params: {},
    };

    const result = handler(ctx);

    expect(result.block).toBe(true);
    expect(result.blockReason).toBe("First guard: no writing");
  });

  it("handles malformed guard content gracefully without crashing", () => {
    const guards = [
      {
        id: "g7",
        ruleId: "r7",
        content: "this is not valid json",
      },
      {
        id: "g8",
        ruleId: "r8",
        content: JSON.stringify({ type: "guard" }), // missing required fields
      },
      {
        id: "g9",
        ruleId: "r9",
        content: makeGuardContent(
          "tool:write_file",
          "block",
          "Valid guard after malformed ones",
        ),
      },
    ];
    const handler = createGuardEvaluator(makeGuardProvider(guards));
    const ctx: ToolCallContext = {
      toolName: "write_file",
      params: {},
    };

    const result = handler(ctx);

    // Should skip malformed guards and still process the valid one
    expect(result.block).toBe(true);
    expect(result.blockReason).toBe("Valid guard after malformed ones");
  });

  it("catch-all guard (tool:*) blocks everything", () => {
    const guards = [
      {
        id: "g10",
        ruleId: "r10",
        content: makeGuardContent(
          "tool:*",
          "block",
          "All tools are blocked",
        ),
      },
    ];
    const handler = createGuardEvaluator(makeGuardProvider(guards));

    const result1 = handler({
      toolName: "write_file",
      params: {},
    });
    expect(result1.block).toBe(true);
    expect(result1.blockReason).toBe("All tools are blocked");

    const result2 = handler({
      toolName: "read_file",
      params: {},
    });
    expect(result2.block).toBe(true);
    expect(result2.blockReason).toBe("All tools are blocked");

    const result3 = handler({
      toolName: "execute_command",
      params: { cmd: "ls" },
    });
    expect(result3.block).toBe(true);
    expect(result3.blockReason).toBe("All tools are blocked");
  });

  it("path condition matches any string param, not just 'path'", () => {
    const guards = [
      {
        id: "g11",
        ruleId: "r11",
        content: makeGuardContent(
          "path:/etc/*",
          "block",
          "System path blocked",
        ),
      },
    ];
    const handler = createGuardEvaluator(makeGuardProvider(guards));
    const ctx: ToolCallContext = {
      toolName: "copy_file",
      params: { source: "/etc/hosts", destination: "/tmp/hosts" },
    };

    const result = handler(ctx);

    expect(result.block).toBe(true);
    expect(result.blockReason).toBe("System path blocked");
  });

  it("path condition does not match non-string param values", () => {
    const guards = [
      {
        id: "g12",
        ruleId: "r12",
        content: makeGuardContent(
          "path:/etc/*",
          "block",
          "System path blocked",
        ),
      },
    ];
    const handler = createGuardEvaluator(makeGuardProvider(guards));
    const ctx: ToolCallContext = {
      toolName: "some_tool",
      params: { count: 42, flag: true, nested: { path: "/etc/shadow" } },
    };

    const result = handler(ctx);

    expect(result.block).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Plugin Registration Tests
// ---------------------------------------------------------------------------

describe("createEasyClawPlugin", () => {
  it("plugin has correct name", () => {
    const plugin = createEasyClawPlugin({
      policyProvider: makePolicyProvider(""),
      guardProvider: makeGuardProvider([]),
    });

    expect(plugin.name).toBe("easyclaw");
  });

  it("plugin registers both hooks", () => {
    const plugin = createEasyClawPlugin({
      policyProvider: makePolicyProvider("Test policy"),
      guardProvider: makeGuardProvider([]),
    });

    const registeredHooks: string[] = [];
    const mockAPI: OpenClawPluginAPI = {
      registerHook: vi.fn((hookName: string) => {
        registeredHooks.push(hookName);
      }) as unknown as OpenClawPluginAPI["registerHook"],
    };

    plugin.register(mockAPI);

    expect(registeredHooks).toContain("before_agent_start");
    expect(registeredHooks).toContain("before_tool_call");
    expect(registeredHooks).toHaveLength(2);
  });

  it("full integration: policy injection + guard enforcement together", () => {
    const policyProvider = makePolicyProvider("Never modify system files.");
    const guardProvider = makeGuardProvider([
      {
        id: "g-int-1",
        ruleId: "r-int-1",
        content: makeGuardContent(
          "path:/etc/*",
          "block",
          "System directory protected",
        ),
      },
    ]);

    const plugin = createEasyClawPlugin({ policyProvider, guardProvider });

    // Capture registered handlers
    let agentStartHandler:
      | ((ctx: AgentStartContext) => { prependContext: string })
      | undefined;
    let toolCallHandler:
      | ((ctx: ToolCallContext) => {
          block?: boolean;
          blockReason?: string;
          params?: Record<string, unknown>;
        })
      | undefined;

    const mockAPI: OpenClawPluginAPI = {
      registerHook: vi.fn(
        (hookName: string, handler: (...args: unknown[]) => unknown) => {
          if (hookName === "before_agent_start") {
            agentStartHandler = handler as typeof agentStartHandler;
          } else if (hookName === "before_tool_call") {
            toolCallHandler = handler as typeof toolCallHandler;
          }
        },
      ) as unknown as OpenClawPluginAPI["registerHook"],
    };

    plugin.register(mockAPI);

    // Verify policy injection works
    expect(agentStartHandler).toBeDefined();
    const agentResult = agentStartHandler!({ prependContext: "" });
    expect(agentResult.prependContext).toContain("--- EasyClaw Policy ---");
    expect(agentResult.prependContext).toContain(
      "Never modify system files.",
    );

    // Verify guard enforcement works
    expect(toolCallHandler).toBeDefined();

    // Blocked call
    const blockedResult = toolCallHandler!({
      toolName: "write_file",
      params: { path: "/etc/hosts" },
    });
    expect(blockedResult.block).toBe(true);
    expect(blockedResult.blockReason).toBe("System directory protected");

    // Allowed call
    const allowedResult = toolCallHandler!({
      toolName: "write_file",
      params: { path: "/home/user/notes.txt" },
    });
    expect(allowedResult.block).toBeUndefined();
  });
});
