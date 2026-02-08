import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse, Server } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, resolve, normalize } from "node:path";
import { randomUUID } from "node:crypto";
import { createLogger } from "@easyclaw/logger";
import type { Storage } from "@easyclaw/storage";
import type { SecretStore } from "@easyclaw/secrets";
import type { ArtifactStatus, ArtifactType, LLMProvider } from "@easyclaw/core";
import { PROVIDER_BASE_URLS, getDefaultModelForProvider, providerSecretKey } from "@easyclaw/core";
import { readFullModelCatalog, resolveOpenClawConfigPath, readExistingConfig, resolveOpenClawStateDir } from "@easyclaw/gateway";
import { loadCostUsageSummary, discoverAllSessions, loadSessionCostSummary } from "../../../vendor/openclaw/src/infra/session-cost-usage.js";
import type { CostUsageSummary, SessionCostSummary } from "../../../vendor/openclaw/src/infra/session-cost-usage.js";

const log = createLogger("panel-server");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// --- Usage Types and Helpers ---

interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalEstimatedCostUsd: number;
  recordCount: number;
  byModel: Record<string, {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    count: number;
  }>;
  byProvider: Record<string, {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    count: number;
  }>;
}

interface UsageFilter {
  since?: string;
  until?: string;
  model?: string;
  provider?: string;
}

// Simple cache with TTL for usage data
const usageCache = new Map<string, { data: UsageSummary; expiresAt: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds (matching OpenClaw's cache)

function getCachedUsage(cacheKey: string): UsageSummary | null {
  const cached = usageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  usageCache.delete(cacheKey);
  return null;
}

function setCachedUsage(cacheKey: string, data: UsageSummary): void {
  usageCache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function transformToUsageSummary(
  costSummary: CostUsageSummary,
  sessionSummaries: SessionCostSummary[]
): UsageSummary {
  // Aggregate byModel and byProvider from session summaries
  const byModelMap = new Map<string, {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    count: number;
  }>();

  const byProviderMap = new Map<string, {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    count: number;
  }>();

  for (const session of sessionSummaries) {
    if (!session.modelUsage) continue;

    for (const modelUsage of session.modelUsage) {
      const model = modelUsage.model || "unknown";
      const provider = modelUsage.provider || "unknown";

      // Aggregate by model
      const modelKey = `${provider}/${model}`;
      const modelEntry = byModelMap.get(modelKey) || {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        count: 0,
      };
      modelEntry.inputTokens += modelUsage.totals.input;
      modelEntry.outputTokens += modelUsage.totals.output;
      modelEntry.totalTokens += modelUsage.totals.totalTokens;
      modelEntry.estimatedCostUsd += modelUsage.totals.totalCost;
      modelEntry.count += modelUsage.count;
      byModelMap.set(modelKey, modelEntry);

      // Aggregate by provider
      const providerEntry = byProviderMap.get(provider) || {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        count: 0,
      };
      providerEntry.inputTokens += modelUsage.totals.input;
      providerEntry.outputTokens += modelUsage.totals.output;
      providerEntry.totalTokens += modelUsage.totals.totalTokens;
      providerEntry.estimatedCostUsd += modelUsage.totals.totalCost;
      providerEntry.count += modelUsage.count;
      byProviderMap.set(provider, providerEntry);
    }
  }

  return {
    totalInputTokens: costSummary.totals.input,
    totalOutputTokens: costSummary.totals.output,
    totalTokens: costSummary.totals.totalTokens,
    totalEstimatedCostUsd: costSummary.totals.totalCost,
    recordCount: costSummary.daily.length,
    byModel: Object.fromEntries(byModelMap),
    byProvider: Object.fromEntries(byProviderMap),
  };
}

function emptyUsageSummary(): UsageSummary {
  return {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalTokens: 0,
    totalEstimatedCostUsd: 0,
    recordCount: 0,
    byModel: {},
    byProvider: {},
  };
}

export interface PanelServerOptions {
  /** Port to listen on. Default: 3210 */
  port?: number;
  /** Directory containing the built panel files. */
  panelDistDir: string;
  /** Storage instance for SQLite-backed persistence. */
  storage: Storage;
  /** Secret store for API keys (Keychain on macOS, encrypted file elsewhere). */
  secretStore: SecretStore;
  /** Callback fired when a rule is created, updated, or deleted. */
  onRuleChange?: (action: "created" | "updated" | "deleted", ruleId: string) => void;
  /** Callback fired when provider settings change (API key added/removed or default changed). */
  onProviderChange?: () => void;
  /** Callback to open a native file/directory picker dialog. Returns the selected path or null. */
  onOpenFileDialog?: () => Promise<string | null>;
}

/**
 * Parse the JSON body from an incoming HTTP request.
 */
function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        resolve(raw.length > 0 ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Validate an API key by making a lightweight call to the provider's API.
 * Returns { valid: true } or { valid: false, error: "..." }.
 */
async function validateProviderApiKey(
  provider: string,
  apiKey: string,
): Promise<{ valid: boolean; error?: string }> {
  const baseUrl = PROVIDER_BASE_URLS[provider as LLMProvider];
  if (!baseUrl) {
    return { valid: false, error: "Unknown provider" };
  }

  // Amazon Bedrock uses AWS Sig v4 — skip validation
  if (provider === "amazon-bedrock") {
    return { valid: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    let res: Response;

    if (provider === "anthropic") {
      const isOAuthToken = apiKey.startsWith("sk-ant-oat01-");
      log.info(`Validating Anthropic ${isOAuthToken ? "OAuth token" : "API key"}...`);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      };

      if (isOAuthToken) {
        // OAuth/setup tokens require Claude Code identity headers to authenticate.
        headers["Authorization"] = `Bearer ${apiKey}`;
        headers["anthropic-beta"] = "claude-code-20250219,oauth-2025-04-20";
        headers["user-agent"] = "claude-cli/2.1.2 (external, cli)";
        headers["x-app"] = "cli";
        headers["anthropic-dangerous-direct-browser-access"] = "true";
      } else {
        headers["x-api-key"] = apiKey;
      }

      const body: Record<string, unknown> = {
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      };

      if (isOAuthToken) {
        body.system = "You are Claude Code, Anthropic's official CLI for Claude.";
      }

      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } else {
      // OpenAI-compatible providers: GET /models
      log.info(`Validating ${provider} API key via ${baseUrl}/models ...`);
      res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
    }

    log.info(`Validation response: ${res.status} ${res.statusText}`);
    if (res.status === 401 || res.status === 403) {
      // Read response body to distinguish real auth errors from firewall blocks
      const body = await res.text().catch(() => "");
      log.info(`Validation response body: ${body.slice(0, 300)}`);

      // Anthropic returns {"type":"error","error":{"type":"authentication_error",...}}
      // OpenAI returns {"error":{"code":"invalid_api_key",...}}
      // A firewall 403 will have completely different content (HTML block page, etc.)
      const isRealAuthError =
        body.includes("authentication_error") ||
        body.includes("invalid_api_key") ||
        body.includes("invalid_x-api-key") ||
        body.includes("Incorrect API key") ||
        body.includes('"unauthorized"');

      if (isRealAuthError) {
        return { valid: false, error: "Invalid API key" };
      }

      // 403 from firewall/proxy — not a key issue, likely network restriction
      return { valid: false, error: `Provider returned ${res.status} — this may be a network issue (firewall/proxy). Response: ${body.slice(0, 200)}` };
    }

    // Any non-2xx response is suspicious — don't accept the key
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log.info(`Validation non-2xx response: ${res.status} body: ${body.slice(0, 300)}`);
      return { valid: false, error: `Provider returned ${res.status}: ${body.slice(0, 200)}` };
    }

    return { valid: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("API key validation failed:", msg);
    if (msg.includes("abort")) {
      return { valid: false, error: "Validation timed out — check your network connection" };
    }
    return { valid: false, error: `Network error: ${msg}` };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sync the active key for a provider to the canonical secret store slot.
 * The gateway reads `{provider}-api-key` — this keeps it in sync with multi-key management.
 */
async function syncActiveKey(
  provider: string,
  storage: Storage,
  secretStore: SecretStore,
): Promise<void> {
  const activeKey = storage.providerKeys.getDefault(provider);
  const canonicalKey = providerSecretKey(provider as LLMProvider);
  if (activeKey) {
    const keyValue = await secretStore.get(`provider-key-${activeKey.id}`);
    if (keyValue) {
      await secretStore.set(canonicalKey, keyValue);
      log.info(`Synced active key for ${provider} (${activeKey.label}) to ${canonicalKey}`);
    }
  } else {
    await secretStore.delete(canonicalKey);
    log.info(`No active key for ${provider}, removed ${canonicalKey}`);
  }
}

/**
 * Create and start a local HTTP server that serves the panel SPA
 * and provides REST API endpoints backed by real storage.
 *
 * Binds to 127.0.0.1 only for security (no external access).
 */
export function startPanelServer(options: PanelServerOptions): Server {
  const port = options.port ?? 3210;
  const distDir = resolve(options.panelDistDir);
  const { storage, secretStore, onRuleChange, onProviderChange, onOpenFileDialog } = options;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const pathname = url.pathname;

    // CORS headers for local development
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // API routes
    if (pathname.startsWith("/api/")) {
      try {
        await handleApiRoute(req, res, url, pathname, storage, secretStore, onRuleChange, onProviderChange, onOpenFileDialog);
      } catch (err) {
        log.error("API error:", err);
        sendJson(res, 500, { error: "Internal server error" });
      }
      return;
    }

    // Static file serving for panel SPA
    serveStatic(res, distDir, pathname);
  });

  server.listen(port, "127.0.0.1", () => {
    log.info("Panel server listening on http://127.0.0.1:" + port);
  });

  return server;
}

/**
 * Extract a route parameter from a pathname pattern like /api/rules/:id
 */
function extractIdFromPath(pathname: string, prefix: string): string | null {
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  // Must be a single path segment (no slashes)
  if (rest.length === 0 || rest.includes("/")) return null;
  return rest;
}

async function handleApiRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  pathname: string,
  storage: Storage,
  secretStore: SecretStore,
  onRuleChange?: (action: "created" | "updated" | "deleted", ruleId: string) => void,
  onProviderChange?: () => void,
  onOpenFileDialog?: () => Promise<string | null>,
): Promise<void> {
  // --- Status ---
  if (pathname === "/api/status" && req.method === "GET") {
    const ruleCount = storage.rules.getAll().length;
    const artifactCount = storage.artifacts.getAll().length;
    sendJson(res, 200, { status: "ok", ruleCount, artifactCount });
    return;
  }

  // --- Rules ---
  if (pathname === "/api/rules" && req.method === "GET") {
    const rules = storage.rules.getAll();
    const allArtifacts = storage.artifacts.getAll();

    // Build a map of ruleId -> latest artifact
    const artifactByRuleId = new Map<string, { status: ArtifactStatus; type: ArtifactType }>();
    for (const artifact of allArtifacts) {
      // Last artifact wins (they are ordered by compiled_at ASC, so last is most recent)
      artifactByRuleId.set(artifact.ruleId, {
        status: artifact.status,
        type: artifact.type,
      });
    }

    const enrichedRules = rules.map((rule) => {
      const artifact = artifactByRuleId.get(rule.id);
      return {
        ...rule,
        artifactStatus: artifact?.status,
        artifactType: artifact?.type,
      };
    });

    sendJson(res, 200, { rules: enrichedRules });
    return;
  }

  if (pathname === "/api/rules" && req.method === "POST") {
    const body = (await parseBody(req)) as { text?: string };
    if (!body.text || typeof body.text !== "string") {
      sendJson(res, 400, { error: "Missing required field: text" });
      return;
    }

    const id = randomUUID();
    const created = storage.rules.create({ id, text: body.text });
    onRuleChange?.("created", id);
    sendJson(res, 201, created);
    return;
  }

  // Rules with ID: PUT /api/rules/:id, DELETE /api/rules/:id
  const ruleId = extractIdFromPath(pathname, "/api/rules/");
  if (ruleId) {
    if (req.method === "PUT") {
      const body = (await parseBody(req)) as { text?: string };
      if (!body.text || typeof body.text !== "string") {
        sendJson(res, 400, { error: "Missing required field: text" });
        return;
      }

      const updated = storage.rules.update(ruleId, { text: body.text });
      if (!updated) {
        sendJson(res, 404, { error: "Rule not found" });
        return;
      }

      onRuleChange?.("updated", ruleId);
      sendJson(res, 200, updated);
      return;
    }

    if (req.method === "DELETE") {
      storage.artifacts.deleteByRuleId(ruleId);
      const deleted = storage.rules.delete(ruleId);
      if (!deleted) {
        sendJson(res, 404, { error: "Rule not found" });
        return;
      }

      onRuleChange?.("deleted", ruleId);
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  // --- Settings ---
  if (pathname === "/api/settings" && req.method === "GET") {
    const settings = storage.settings.getAll();
    const masked: Record<string, string> = {};
    for (const [key, value] of Object.entries(settings)) {
      masked[key] = value;
    }

    // Check the secret store for API keys and report as "configured" (never expose actual keys)
    const provider = settings["llm-provider"];
    if (provider) {
      const secretKey = `${provider}-api-key`;
      const keyValue = await secretStore.get(secretKey);
      const hasKey = keyValue !== null && keyValue !== "";
      if (hasKey) {
        masked[secretKey] = "configured";
      }
    }

    sendJson(res, 200, { settings: masked });
    return;
  }

  if (pathname === "/api/settings/validate-key" && req.method === "POST") {
    const body = (await parseBody(req)) as { provider?: string; apiKey?: string };
    if (!body.provider || !body.apiKey) {
      sendJson(res, 400, { valid: false, error: "Missing provider or apiKey" });
      return;
    }
    const result = await validateProviderApiKey(body.provider, body.apiKey);
    sendJson(res, 200, result);
    return;
  }

  if (pathname === "/api/settings" && req.method === "PUT") {
    const body = (await parseBody(req)) as Record<string, string>;
    let providerChanged = false;
    for (const [key, value] of Object.entries(body)) {
      if (typeof key === "string" && typeof value === "string") {
        if (key.endsWith("-api-key")) {
          // API keys go to the secure secret store (Keychain/encrypted file),
          // NOT SQLite — so they are available to buildGatewayEnv.
          if (value) {
            await secretStore.set(key, value);
          } else {
            await secretStore.delete(key);
          }
          providerChanged = true;
        } else {
          storage.settings.set(key, value);
          if (key === "llm-provider") {
            providerChanged = true;
          }
        }
      }
    }
    sendJson(res, 200, { ok: true });
    if (providerChanged) {
      onProviderChange?.();
    }
    return;
  }

  // --- Provider Keys ---
  if (pathname === "/api/provider-keys" && req.method === "GET") {
    const keys = storage.providerKeys.getAll();
    sendJson(res, 200, { keys });
    return;
  }

  if (pathname === "/api/provider-keys" && req.method === "POST") {
    const body = (await parseBody(req)) as {
      provider?: string;
      label?: string;
      model?: string;
      apiKey?: string;
    };
    if (!body.provider || !body.apiKey) {
      sendJson(res, 400, { error: "Missing required fields: provider, apiKey" });
      return;
    }

    // Validate key before saving
    const validation = await validateProviderApiKey(body.provider, body.apiKey);
    if (!validation.valid) {
      sendJson(res, 422, { error: validation.error || "Invalid API key" });
      return;
    }

    const id = randomUUID();
    const model = body.model || getDefaultModelForProvider(body.provider as LLMProvider).modelId;
    const label = body.label || "Default";

    // Check if this is the first key for this provider
    const existingKeys = storage.providerKeys.getByProvider(body.provider);
    const isFirst = existingKeys.length === 0;

    const entry = storage.providerKeys.create({
      id,
      provider: body.provider,
      label,
      model,
      isDefault: isFirst,
      createdAt: "",
      updatedAt: "",
    });

    // Store the actual key in secret store
    await secretStore.set(`provider-key-${id}`, body.apiKey);

    // If first key for this provider, set as active provider
    if (isFirst) {
      const currentProvider = storage.settings.get("llm-provider");
      if (!currentProvider) {
        storage.settings.set("llm-provider", body.provider);
      }
    }

    // Sync the active key to canonical slot
    await syncActiveKey(body.provider, storage, secretStore);
    onProviderChange?.();

    sendJson(res, 201, entry);
    return;
  }

  // Provider key activate: POST /api/provider-keys/:id/activate
  if (pathname.startsWith("/api/provider-keys/") && pathname.endsWith("/activate") && req.method === "POST") {
    const id = pathname.slice("/api/provider-keys/".length, -"/activate".length);
    const entry = storage.providerKeys.getById(id);
    if (!entry) {
      sendJson(res, 404, { error: "Key not found" });
      return;
    }

    storage.providerKeys.setDefault(id);
    await syncActiveKey(entry.provider, storage, secretStore);
    onProviderChange?.();

    sendJson(res, 200, { ok: true });
    return;
  }

  // Provider key with ID: PUT /api/provider-keys/:id, DELETE /api/provider-keys/:id
  if (pathname.startsWith("/api/provider-keys/")) {
    const id = pathname.slice("/api/provider-keys/".length);
    // Skip if contains slash (handled by activate above)
    if (!id.includes("/")) {
      if (req.method === "PUT") {
        const body = (await parseBody(req)) as { label?: string; model?: string };
        const existing = storage.providerKeys.getById(id);
        if (!existing) {
          sendJson(res, 404, { error: "Key not found" });
          return;
        }

        const updated = storage.providerKeys.update(id, {
          label: body.label,
          model: body.model,
        });

        // If model changed on the active key of the active provider, trigger gateway update
        const activeProvider = storage.settings.get("llm-provider");
        if (existing.isDefault && existing.provider === activeProvider && body.model && body.model !== existing.model) {
          onProviderChange?.();
        }

        sendJson(res, 200, updated);
        return;
      }

      if (req.method === "DELETE") {
        const existing = storage.providerKeys.getById(id);
        if (!existing) {
          sendJson(res, 404, { error: "Key not found" });
          return;
        }

        // Delete from DB and secret store
        storage.providerKeys.delete(id);
        await secretStore.delete(`provider-key-${id}`);

        // If was default, promote next key for same provider
        if (existing.isDefault) {
          const remaining = storage.providerKeys.getByProvider(existing.provider);
          if (remaining.length > 0) {
            storage.providerKeys.setDefault(remaining[0].id);
          }
        }

        // Sync active key
        await syncActiveKey(existing.provider, storage, secretStore);
        onProviderChange?.();

        sendJson(res, 200, { ok: true });
        return;
      }
    }
  }

  // --- Model Catalog ---
  if (pathname === "/api/models" && req.method === "GET") {
    const catalog = await readFullModelCatalog();
    sendJson(res, 200, { models: catalog });
    return;
  }

  // --- Channels ---
  if (pathname === "/api/channels" && req.method === "GET") {
    const channels = storage.channels.getAll();
    sendJson(res, 200, { channels });
    return;
  }

  if (pathname === "/api/channels" && req.method === "POST") {
    const body = (await parseBody(req)) as {
      channelType?: string;
      enabled?: boolean;
      accountId?: string;
      settings?: Record<string, unknown>;
    };
    const id = crypto.randomUUID();
    const channel = storage.channels.create({
      id,
      channelType: body.channelType ?? "",
      enabled: body.enabled ?? true,
      accountId: body.accountId ?? "",
      settings: body.settings ?? {},
    });
    onRuleChange?.("channel-created", id);
    sendJson(res, 201, channel);
    return;
  }

  if (pathname.startsWith("/api/channels/") && req.method === "DELETE") {
    const id = pathname.slice("/api/channels/".length);
    const deleted = storage.channels.delete(id);
    if (deleted) {
      onRuleChange?.("channel-deleted", id);
      sendJson(res, 200, { ok: true });
    } else {
      sendJson(res, 404, { error: "Channel not found" });
    }
    return;
  }

  // --- Permissions ---
  if (pathname === "/api/permissions" && req.method === "GET") {
    const permissions = storage.permissions.get();
    sendJson(res, 200, { permissions });
    return;
  }

  if (pathname === "/api/permissions" && req.method === "PUT") {
    const body = (await parseBody(req)) as { readPaths?: string[]; writePaths?: string[] };
    const permissions = storage.permissions.update({
      readPaths: body.readPaths ?? [],
      writePaths: body.writePaths ?? [],
    });
    sendJson(res, 200, { permissions });
    return;
  }

  // --- Usage ---
  if (pathname === "/api/usage" && req.method === "GET") {
    const filter: UsageFilter = {};
    const since = url.searchParams.get("since");
    const until = url.searchParams.get("until");
    if (since) filter.since = since;
    if (until) filter.until = until;

    // Check cache first
    const cacheKey = `usage-${filter.since ?? "all"}-${filter.until ?? "all"}`;
    const cached = getCachedUsage(cacheKey);
    if (cached) {
      sendJson(res, 200, cached);
      return;
    }

    try {
      // Parse date filters to timestamps
      const startMs = filter.since ? new Date(filter.since).getTime() : undefined;
      const endMs = filter.until ? new Date(filter.until).getTime() : undefined;

      // Load OpenClaw config for cost estimation
      const configPath = resolveOpenClawConfigPath();
      const config = readExistingConfig(configPath);

      // Call OpenClaw's aggregation function for totals
      const costSummary = await loadCostUsageSummary({
        startMs,
        endMs,
        config,
        // agentId: undefined (scan all agents)
      });

      // Discover all sessions and load their summaries for byModel/byProvider breakdown
      const sessions = await discoverAllSessions({ startMs, endMs });
      const sessionSummaries: SessionCostSummary[] = [];

      for (const session of sessions) {
        const summary = await loadSessionCostSummary({
          sessionFile: session.sessionFile,
          config,
          startMs,
          endMs,
        });
        if (summary && summary.modelUsage) {
          sessionSummaries.push(summary);
        }
      }

      // Transform to frontend UsageSummary format with byModel/byProvider
      const summary = transformToUsageSummary(costSummary, sessionSummaries);

      // Cache the result
      setCachedUsage(cacheKey, summary);

      sendJson(res, 200, summary);
    } catch (error) {
      log.error("Failed to load usage data", error);
      sendJson(res, 200, emptyUsageSummary());
    }
    return;
  }

  // --- File Dialog ---
  if (pathname === "/api/file-dialog" && req.method === "POST") {
    if (!onOpenFileDialog) {
      sendJson(res, 501, { error: "File dialog not available" });
      return;
    }
    const selected = await onOpenFileDialog();
    sendJson(res, 200, { path: selected });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

function serveStatic(
  res: ServerResponse,
  distDir: string,
  pathname: string,
): void {
  // Prevent directory traversal
  const safePath = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = join(distDir, safePath);

  // If the path doesn't point to an existing file, serve index.html (SPA fallback)
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(distDir, "index.html");
  }

  if (!existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return;
  }

  // Ensure the resolved path is within distDir (prevent traversal)
  const resolvedFile = resolve(filePath);
  const resolvedDist = resolve(distDir);
  if (!resolvedFile.startsWith(resolvedDist)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}
