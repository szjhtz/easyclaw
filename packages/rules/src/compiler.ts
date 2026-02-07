import type { ArtifactType } from "@easyclaw/core";

export interface CompileResult {
  artifactType: ArtifactType;
  content: string;
}

/**
 * Keywords that indicate a guard artifact (blocking / restricting behavior).
 */
const GUARD_KEYWORDS = [
  "block",
  "deny",
  "forbid",
  "prevent",
  "must not",
  "never allow",
  "restrict",
];

/**
 * Keywords that indicate an action-bundle artifact (adding capabilities).
 */
const ACTION_BUNDLE_KEYWORDS = [
  "skill",
  "action",
  "capability",
  "can do",
  "enable",
  "add ability",
];

/**
 * Classify a rule's text into an artifact type using heuristic keyword matching.
 *
 * Priority:
 * 1. Guard keywords → "guard"
 * 2. Action-bundle keywords → "action-bundle"
 * 3. Default → "policy-fragment"
 */
function classifyRule(ruleText: string): ArtifactType {
  const lower = ruleText.toLowerCase();

  for (const keyword of GUARD_KEYWORDS) {
    if (lower.includes(keyword)) {
      return "guard";
    }
  }

  for (const keyword of ACTION_BUNDLE_KEYWORDS) {
    if (lower.includes(keyword)) {
      return "action-bundle";
    }
  }

  return "policy-fragment";
}

/**
 * Extract a short condition phrase from rule text for use in guard specs.
 * Takes the first sentence (up to 120 chars) as the condition description.
 */
function extractCondition(ruleText: string): string {
  const firstSentence = ruleText.split(/[.!?\n]/)[0]?.trim() ?? ruleText;
  return firstSentence.length > 120
    ? firstSentence.slice(0, 117) + "..."
    : firstSentence;
}

/**
 * Derive a short skill name from rule text for action-bundle SKILL.md frontmatter.
 * Uses the first few words, lowercased and kebab-cased.
 */
function deriveSkillName(ruleText: string): string {
  return ruleText
    .split(/\s+/)
    .slice(0, 5)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Generate artifact content for a policy-fragment.
 */
function generatePolicyFragment(ruleText: string): string {
  return `[POLICY] ${ruleText}`;
}

/**
 * Generate artifact content for a guard (JSON spec).
 */
function generateGuard(ruleText: string): string {
  const spec = {
    type: "guard",
    condition: extractCondition(ruleText),
    action: "block",
    reason: ruleText,
  };
  return JSON.stringify(spec, null, 2);
}

/**
 * Generate artifact content for an action-bundle (SKILL.md skeleton).
 */
function generateActionBundle(ruleText: string): string {
  const name = deriveSkillName(ruleText);
  const lines = [
    "---",
    `name: ${name}`,
    `description: ${extractCondition(ruleText)}`,
    "---",
    "",
    ruleText,
    "",
  ];
  return lines.join("\n");
}

/**
 * Compile a rule's natural language text into a typed artifact.
 *
 * This is a heuristic placeholder for V0 — a real implementation would
 * call an LLM to classify and generate structured output.
 */
export function compileRule(ruleText: string): CompileResult {
  const artifactType = classifyRule(ruleText);

  let content: string;
  switch (artifactType) {
    case "guard":
      content = generateGuard(ruleText);
      break;
    case "action-bundle":
      content = generateActionBundle(ruleText);
      break;
    case "policy-fragment":
    default:
      content = generatePolicyFragment(ruleText);
      break;
  }

  return { artifactType, content };
}
