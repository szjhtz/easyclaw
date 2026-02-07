import { createLogger } from "@easyclaw/logger";
import { createGuardEvaluator } from "./guard-evaluator.js";
import { createPolicyInjector } from "./policy-injector.js";
import type {
  GuardProvider,
  OpenClawPluginAPI,
  PolicyProvider,
} from "./types.js";

const log = createLogger("easyclaw:plugin");

/** Options for creating the EasyClaw OpenClaw plugin. */
export interface EasyClawPluginOptions {
  policyProvider: PolicyProvider;
  guardProvider: GuardProvider;
}

/**
 * Creates the EasyClaw plugin that registers with the OpenClaw gateway.
 * It wires the policy injector (before_agent_start) and guard evaluator
 * (before_tool_call) hooks.
 */
export function createEasyClawPlugin(options: EasyClawPluginOptions) {
  return {
    name: "easyclaw" as const,

    register(api: OpenClawPluginAPI): void {
      const policyHandler = createPolicyInjector(options.policyProvider);
      const guardHandler = createGuardEvaluator(options.guardProvider);

      api.registerHook("before_agent_start", policyHandler);
      api.registerHook("before_tool_call", guardHandler);

      log.info("EasyClaw plugin registered");
    },
  };
}
