/**
 * EasyClaw System Tool
 *
 * Provides system status and help information to the AI agent.
 * Runs inside the gateway process — reads config directly, no HTTP calls.
 */

import { Type } from "@sinclair/typebox";

// Minimal tool types — inlined to avoid depending on vendor internals.
// Matches the shape expected by OpenClaw's registerTool().
type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

type EasyClawToolDef = {
  label: string;
  name: string;
  description: string;
  ownerOnly?: boolean;
  parameters: ReturnType<typeof Type.Object>;
  execute: (toolCallId: string, args: unknown) => Promise<ToolResult>;
};

// Minimal config shape — only the fields we actually read.
type GatewayConfig = {
  provider?: string;
  model?: string;
  channels?: Record<string, unknown>;
};

function jsonResult(payload: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function stringEnum<T extends readonly string[]>(values: T) {
  return Type.Unsafe<T[number]>({ type: "string", enum: [...values] });
}

const EASYCLAW_ACTIONS = ["status", "help"] as const;

export function createEasyClawTool(opts?: {
  config?: GatewayConfig;
}): EasyClawToolDef {
  return {
    label: "EasyClaw",
    name: "easyclaw",
    ownerOnly: true,
    description:
      "Get EasyClaw system status or help. " +
      "Use `status` to check the current runtime state (provider, model, gateway). " +
      "Use `help` to see all available tool actions and tips.",
    parameters: Type.Object({
      action: stringEnum(EASYCLAW_ACTIONS),
    }),
    execute: async (_toolCallId: string, args: unknown): Promise<ToolResult> => {
      const action = (args as Record<string, unknown>).action as string;

      if (action === "status") {
        const config = opts?.config;
        const channels = config?.channels;
        const enabledChannels = channels
          ? Object.keys(channels).filter((k) => {
              const ch = channels[k] as Record<string, unknown> | undefined;
              return ch && ch.enabled !== false;
            })
          : [];

        return jsonResult({
          runtime: "easyclaw-desktop",
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          gatewayStatus: "running",
          provider: config?.provider ?? "unknown",
          model: config?.model ?? "unknown",
          enabledChannels: enabledChannels.length > 0 ? enabledChannels : "none",
        });
      }

      if (action === "help") {
        return jsonResult({
          availableTools: [
            {
              tool: "gateway",
              description: "Restart, apply config, or update the gateway",
              actions: ["restart", "config.get", "config.patch", "config.apply", "update.run"],
            },
            {
              tool: "providers",
              description: "Manage LLM provider API keys",
              actions: ["list", "add", "activate", "remove"],
            },
            {
              tool: "easyclaw",
              description: "EasyClaw system status and help",
              actions: ["status", "help"],
            },
          ],
          tips: [
            "Gateway lifecycle is auto-managed by EasyClaw — no need to start/stop manually",
            "To change provider or model, use the gateway tool's config.patch action",
            "Do NOT run `openclaw` CLI commands — they are not available in EasyClaw",
            "Use the providers tool to add, list, or switch API keys through conversation",
          ],
        });
      }

      return jsonResult({ error: `Unknown action: ${action}` });
    },
  };
}
