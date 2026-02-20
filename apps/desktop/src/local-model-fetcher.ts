import { createLogger } from "@easyclaw/logger";

const log = createLogger("local-model-fetcher");

const FETCH_TIMEOUT_MS = 5000;

/**
 * Derive the Ollama native API base from a baseUrl.
 * If baseUrl ends with /v1 (OpenAI compat), strip it.
 * e.g. "http://localhost:11434/v1" -> "http://localhost:11434"
 *      "http://localhost:11434"    -> "http://localhost:11434"
 */
function deriveOllamaBase(baseUrl: string): string {
  return baseUrl.replace(/\/v1\/?$/, "");
}

/**
 * Fetch installed models from an Ollama server via GET /api/tags.
 */
export async function fetchOllamaModels(
  baseUrl: string,
): Promise<Array<{ id: string; name: string }>> {
  const base = deriveOllamaBase(baseUrl);
  const url = `${base}/api/tags`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Ollama /api/tags returned ${res.status}`);
    }
    const data = await res.json() as { models?: Array<{ name: string; model?: string }> };
    const models = (data.models ?? []).map((m) => ({
      id: m.name,
      name: m.name,
    }));
    log.info(`Fetched ${models.length} model(s) from ${base}`);
    return models;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Check health of a local model server.
 */
export async function checkHealth(
  baseUrl: string,
): Promise<{ ok: boolean; version?: string; error?: string }> {
  const base = deriveOllamaBase(baseUrl);
  const url = `${base}/api/version`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return { ok: false, error: `Server returned ${res.status}` };
    }
    const data = await res.json() as { version?: string };
    return { ok: true, version: data.version };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}
