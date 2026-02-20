import { createLogger } from "@easyclaw/logger";

const log = createLogger("local-model-detector");

export interface LocalModelServer {
  type: "ollama" | "lmstudio" | "vllm" | "custom";
  baseUrl: string;
  version?: string;
  status: "detected" | "offline";
}

interface ProbeTarget {
  type: LocalModelServer["type"];
  host: string;
  port: number;
  versionPath: string;
}

const PROBE_TARGETS: ProbeTarget[] = [
  { type: "ollama", host: "127.0.0.1", port: 11434, versionPath: "/api/version" },
];

const PROBE_TIMEOUT_MS = 2000;

/**
 * Probe a single local model server.
 * Returns a detected server or null if unreachable.
 */
async function probeServer(target: ProbeTarget): Promise<LocalModelServer | null> {
  const url = `http://${target.host}:${target.port}${target.versionPath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json() as { version?: string };
    return {
      type: target.type,
      baseUrl: `http://${target.host}:${target.port}`,
      version: data.version,
      status: "detected",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Detect all running local model servers by probing known ports.
 */
export async function detectLocalServers(): Promise<LocalModelServer[]> {
  const results = await Promise.all(PROBE_TARGETS.map(probeServer));
  const detected = results.filter((r): r is LocalModelServer => r !== null);
  log.info(`Detected ${detected.length} local model server(s)`);
  return detected;
}
