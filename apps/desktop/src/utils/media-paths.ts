import { join } from "node:path";
import { resolveMediaDir as _resolveMediaDir } from "@rivonclaw/core/node";

/** Resolve the base media directory (~/.rivonclaw/openclaw/media). */
export function resolveMediaBase(): string {
  return _resolveMediaDir();
}

/** Resolve a media subdirectory (e.g. "inbound", "outbound"). */
export function resolveMediaDir(sub: "inbound" | "outbound"): string {
  return join(_resolveMediaDir(), sub);
}
