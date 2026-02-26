/** Per-key/model usage snapshot — cumulative usage at a point in time. */
export interface UsageSnapshot {
  keyId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCostUsd: string; // string for decimal precision
  snapshotTime: number; // epoch ms
}

/** Historical usage record for a key/model over a time interval. */
export interface KeyModelUsageRecord {
  keyId: string;
  provider: string;
  model: string;
  startTime: number; // epoch ms
  endTime: number; // epoch ms
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCostUsd: string;
}

/** Aggregated usage summary for a key/model (returned by time-window queries). */
export interface KeyModelUsageSummary {
  keyId: string;
  keyLabel: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCostUsd: string;
  authType: "api_key" | "oauth" | "local" | "custom";
}

/** Daily-bucketed usage for a key/model (for time-series charts). */
export interface KeyUsageDailyBucket {
  keyId: string;
  keyLabel: string;
  provider: string;
  model: string;
  date: string; // "2026-02-10"
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: string;
}

/** Query parameters for per-key/model usage. */
export interface KeyUsageQueryParams {
  keyId?: string;
  provider?: string;
  model?: string;
  windowStart: number; // epoch ms
  windowEnd: number; // epoch ms
}
