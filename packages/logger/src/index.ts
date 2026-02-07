import { Logger } from "tslog";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const LOG_DIR = join(homedir(), ".easyclaw", "logs");

export function ensureLogDir(): void {
  mkdirSync(LOG_DIR, { recursive: true });
}

export function createLogger(name: string): Logger<unknown> {
  return new Logger({
    name,
    type: "pretty",
    minLevel: process.env.NODE_ENV === "production" ? 3 : 0,
  });
}
