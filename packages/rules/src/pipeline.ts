import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { Rule, RuleArtifact } from "@easyclaw/core";
import type { Storage } from "@easyclaw/storage";
import { createLogger } from "@easyclaw/logger";
import { compileRule } from "./compiler.js";

const log = createLogger("rules:pipeline");

export interface ArtifactPipelineEvents {
  compiled: [ruleId: string, artifact: RuleArtifact];
  failed: [ruleId: string, error: Error];
}

const DEFAULT_MAX_POLICY_LENGTH = 4000;

export class ArtifactPipeline extends EventEmitter<ArtifactPipelineEvents> {
  private storage: Storage;

  constructor(storage: Storage) {
    super();
    this.storage = storage;
  }

  /**
   * Compile (or recompile) a rule into an artifact, persisting to storage.
   *
   * Each rule produces exactly ONE artifact. If an artifact already exists
   * for this rule, it is updated in place (no duplicates).
   *
   * On failure, the last-known-good artifact is preserved (if any) and its
   * status is set to "failed".
   */
  compileRule(rule: Rule): RuleArtifact {
    const existingArtifacts = this.storage.artifacts.getByRuleId(rule.id);
    const existing = existingArtifacts.length > 0 ? existingArtifacts[0] : undefined;

    try {
      const result = compileRule(rule.text);
      const now = new Date().toISOString();

      let artifact: RuleArtifact;

      if (existing) {
        // Update existing artifact in place
        const updated = this.storage.artifacts.update(existing.id, {
          content: result.content,
          status: "ok",
          compiledAt: now,
        });

        if (!updated) {
          throw new Error(`Failed to update artifact ${existing.id} for rule ${rule.id}`);
        }

        // If the type changed, we need to reflect that — but the update API
        // only allows content/outputPath/status/compiledAt. Since type changes
        // are rare in practice (rule text changed significantly), we delete and
        // recreate if the type differs.
        if (existing.type !== result.artifactType) {
          this.storage.artifacts.deleteByRuleId(rule.id);
          artifact = this.storage.artifacts.create({
            id: existing.id,
            ruleId: rule.id,
            type: result.artifactType,
            content: result.content,
            status: "ok",
            compiledAt: now,
          });
        } else {
          artifact = { ...updated, type: result.artifactType };
        }
      } else {
        // Create a new artifact
        artifact = this.storage.artifacts.create({
          id: randomUUID(),
          ruleId: rule.id,
          type: result.artifactType,
          content: result.content,
          status: "ok",
          compiledAt: now,
        });
      }

      log.info(`Compiled rule ${rule.id} → ${result.artifactType} artifact ${artifact.id}`);
      this.emit("compiled", rule.id, artifact);
      return artifact;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.warn(`Failed to compile rule ${rule.id}: ${err.message}`);

      // Keep last-known-good: mark existing artifact as failed but preserve content.
      // Wrap storage operations in their own try/catch so that if storage itself
      // is broken, we still emit the event and return a meaningful result.
      if (existing) {
        try {
          const now = new Date().toISOString();
          const failed = this.storage.artifacts.update(existing.id, {
            status: "failed",
            compiledAt: now,
          });

          this.emit("failed", rule.id, err);
          return failed ?? { ...existing, status: "failed" as const };
        } catch {
          // Storage update itself failed — return the existing artifact
          // marked as failed in memory even if we can't persist that state.
          this.emit("failed", rule.id, err);
          return { ...existing, status: "failed" as const };
        }
      }

      // No previous artifact exists — create a failed placeholder
      try {
        const failedArtifact = this.storage.artifacts.create({
          id: randomUUID(),
          ruleId: rule.id,
          type: "policy-fragment",
          content: "",
          status: "failed",
          compiledAt: new Date().toISOString(),
        });

        this.emit("failed", rule.id, err);
        return failedArtifact;
      } catch {
        // Even creating a placeholder failed — return an in-memory-only artifact
        this.emit("failed", rule.id, err);
        return {
          id: randomUUID(),
          ruleId: rule.id,
          type: "policy-fragment" as const,
          content: "",
          status: "failed" as const,
          compiledAt: new Date().toISOString(),
        };
      }
    }
  }

  /**
   * Recompile all rules. Returns count of successes and failures.
   */
  recompileAll(): { succeeded: number; failed: number } {
    const rules = this.storage.rules.getAll();
    let succeeded = 0;
    let failed = 0;

    for (const rule of rules) {
      const artifact = this.compileRule(rule);
      if (artifact.status === "ok") {
        succeeded++;
      } else {
        failed++;
      }
    }

    log.info(`Recompiled all rules: ${succeeded} succeeded, ${failed} failed`);
    return { succeeded, failed };
  }

  /**
   * Remove artifacts for a deleted rule.
   */
  removeArtifacts(ruleId: string): void {
    const count = this.storage.artifacts.deleteByRuleId(ruleId);
    log.info(`Removed ${count} artifact(s) for rule ${ruleId}`);
  }

  /**
   * Get the compiled policy view: all policy-fragment artifacts with status "ok"
   * concatenated, bounded to maxLength (default 4000 chars), separated by newlines.
   */
  getCompiledPolicyView(maxLength: number = DEFAULT_MAX_POLICY_LENGTH): string {
    const allArtifacts = this.storage.artifacts.getAll();
    const policyArtifacts = allArtifacts.filter(
      (a) => a.type === "policy-fragment" && a.status === "ok",
    );

    const fragments: string[] = [];
    let totalLength = 0;

    for (const artifact of policyArtifacts) {
      const nextLength = totalLength + (fragments.length > 0 ? 1 : 0) + artifact.content.length;
      if (nextLength > maxLength) {
        break;
      }
      fragments.push(artifact.content);
      totalLength = nextLength;
    }

    return fragments.join("\n");
  }

  /**
   * Get all active guard artifacts (status "ok").
   */
  getActiveGuards(): RuleArtifact[] {
    const allArtifacts = this.storage.artifacts.getAll();
    return allArtifacts.filter((a) => a.type === "guard" && a.status === "ok");
  }
}
