/**
 * RivonClaw Runtime Context — prependContext injection
 *
 * Uses the `before_prompt_build` hook to prepend RivonClaw runtime context
 * to the user's prompt. This tells the AI it's inside RivonClaw and must
 * use `gateway`/`rivonclaw` tools instead of `openclaw` CLI commands.
 *
 * Architecture note: `before_prompt_build` does NOT expose the built system
 * prompt in event.prompt (that field is the user's message). The hook can
 * only provide a full replacement via `systemPrompt` or prepend to the user
 * message via `prependContext`. Since we cannot read/modify the existing
 * system prompt without vendor changes, we use `prependContext`.
 *
 * The OpenClaw system prompt still contains the CLI Quick Reference section,
 * but the prepended context takes priority — the AI sees "do NOT use openclaw
 * CLI" before it sees the CLI instructions.
 */

type PromptBuildEvent = {
  prompt: string;
  messages?: unknown[];
};

type PromptBuildResult = {
  prependContext?: string;
};

const RIVONCLAW_CONTEXT = [
  "--- RivonClaw Runtime Environment ---",
  "CRITICAL: You are running inside RivonClaw Desktop Application.",
  "The `openclaw` CLI binary is NOT available in PATH.",
  "Do NOT attempt to run any `openclaw` commands via exec or shell — they will fail.",
  "",
  'Ignore the "OpenClaw CLI Quick Reference" section in the system prompt — those commands do not work here.',
  "",
  "Instead, use these built-in tools:",
  "- `gateway` tool: restart gateway, get/patch/apply config, run updates",
  "- `rivonclaw` tool: check system status, get available actions",
  "",
  "Gateway lifecycle (start/stop) is automatically managed by RivonClaw.",
  "You do not need to start, stop, or install the gateway service.",
  "--- End RivonClaw Runtime ---",
].join("\n");

export function createRivonClawContext(): (event: PromptBuildEvent) => PromptBuildResult {
  return function handlePromptBuild(_event: PromptBuildEvent): PromptBuildResult {
    return { prependContext: RIVONCLAW_CONTEXT };
  };
}
