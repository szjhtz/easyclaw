export type ArtifactType = "policy-fragment" | "guard" | "action-bundle";

export type ArtifactStatus = "ok" | "failed" | "pending";

export interface RuleArtifact {
  id: string;
  ruleId: string;
  type: ArtifactType;
  content: string;
  outputPath?: string;
  status: ArtifactStatus;
  compiledAt: string;
}
