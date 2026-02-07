import { createLogger } from "@easyclaw/logger";
import type {
  AgentStartContext,
  AgentStartResult,
  PolicyProvider,
} from "./types.js";

const log = createLogger("easyclaw:policy-injector");

/**
 * Creates a before_agent_start handler that injects the compiled policy view
 * as prependContext. The policy block is wrapped with delimiters and placed
 * before any existing prependContext.
 */
export function createPolicyInjector(
  provider: PolicyProvider,
): (ctx: AgentStartContext) => AgentStartResult {
  return function handleAgentStart(ctx: AgentStartContext): AgentStartResult {
    const policyView = provider.getCompiledPolicyView();

    if (!policyView) {
      log.debug("No compiled policy view available; passing through context");
      return { prependContext: ctx.prependContext };
    }

    log.info("Injecting compiled policy view into prependContext");
    const block =
      "--- EasyClaw Policy ---\n" + policyView + "\n--- End Policy ---\n";

    return {
      prependContext:
        block + (ctx.prependContext ? "\n" + ctx.prependContext : ""),
    };
  };
}
