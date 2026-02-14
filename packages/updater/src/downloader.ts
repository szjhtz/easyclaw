import { createWriteStream, createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createLogger } from "@easyclaw/logger";
import type { DownloadProgress, DownloadResult } from "./types.js";

const log = createLogger("updater:downloader");

/**
 * Download a file from a URL to a local path with progress reporting,
 * then verify its SHA-256 checksum.
 *
 * @throws On network error, write error, checksum mismatch, or abort.
 */
export async function downloadAndVerify(
  url: string,
  destPath: string,
  expectedSha256: string,
  expectedSize: number,
  onProgress?: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<DownloadResult> {
  log.info(`Downloading update from ${url}`);

  const response = await fetch(url, { signal, redirect: "follow" });

  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("Download failed: no response body");
  }

  const total = expectedSize;
  let downloaded = 0;

  const reader = response.body.getReader();
  const nodeStream = new Readable({
    async read() {
      try {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
          return;
        }
        downloaded += value.byteLength;
        onProgress?.({
          downloaded,
          total,
          percent: Math.min(100, Math.round((downloaded / total) * 100)),
        });
        this.push(Buffer.from(value));
      } catch (err) {
        this.destroy(err instanceof Error ? err : new Error(String(err)));
      }
    },
  });

  const writeStream = createWriteStream(destPath);

  try {
    await pipeline(nodeStream, writeStream);
  } catch (err) {
    await unlink(destPath).catch(() => {});
    throw err;
  }

  // Verify SHA-256
  log.info("Download complete, verifying SHA-256 checksum...");
  const actualSha256 = await computeSha256(destPath);
  const verified = actualSha256 === expectedSha256.toLowerCase();

  if (!verified) {
    log.error(`Checksum mismatch: expected ${expectedSha256}, got ${actualSha256}`);
    await unlink(destPath).catch(() => {});
    throw new Error(`Checksum verification failed: expected ${expectedSha256}, got ${actualSha256}`);
  }

  log.info("SHA-256 checksum verified successfully");
  return { filePath: destPath, verified: true };
}

/** Compute SHA-256 hash of a file. */
async function computeSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  await pipeline(stream, hash);
  return hash.digest("hex");
}
