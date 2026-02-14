import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseVersion, compareVersions, isNewerVersion } from "./version.js";
import {
  fetchManifest,
  getPlatformKey,
  checkForUpdate,
  MANIFEST_URLS,
} from "./checker.js";
import { downloadAndVerify } from "./downloader.js";
import type { UpdateManifest, DownloadProgress } from "./types.js";

// ---------------------------------------------------------------------------
// parseVersion
// ---------------------------------------------------------------------------
describe("parseVersion", () => {
  it("parses a valid version string", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
  });

  it("parses version with zeros", () => {
    expect(parseVersion("0.0.0")).toEqual([0, 0, 0]);
  });

  it("parses multi-digit components", () => {
    expect(parseVersion("10.20.300")).toEqual([10, 20, 300]);
  });

  it("throws on invalid version (missing patch)", () => {
    expect(() => parseVersion("1.2")).toThrow('Invalid version string: "1.2"');
  });

  it("throws on invalid version (non-numeric)", () => {
    expect(() => parseVersion("1.2.x")).toThrow(
      'Invalid version string: "1.2.x"',
    );
  });

  it("throws on empty string", () => {
    expect(() => parseVersion("")).toThrow('Invalid version string: ""');
  });

  it("throws on version with pre-release suffix", () => {
    expect(() => parseVersion("1.2.3-beta")).toThrow(
      'Invalid version string: "1.2.3-beta"',
    );
  });
});

// ---------------------------------------------------------------------------
// compareVersions
// ---------------------------------------------------------------------------
describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("returns 1 when a > b (major)", () => {
    expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
  });

  it("returns -1 when a < b (major)", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
  });

  it("returns 1 when a > b (minor)", () => {
    expect(compareVersions("1.3.0", "1.2.0")).toBe(1);
  });

  it("returns -1 when a < b (minor)", () => {
    expect(compareVersions("1.2.0", "1.3.0")).toBe(-1);
  });

  it("returns 1 when a > b (patch)", () => {
    expect(compareVersions("1.2.4", "1.2.3")).toBe(1);
  });

  it("returns -1 when a < b (patch)", () => {
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
  });

  it("handles multi-digit version components", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
    expect(compareVersions("1.9.0", "1.10.0")).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// isNewerVersion
// ---------------------------------------------------------------------------
describe("isNewerVersion", () => {
  it("returns true when latest is newer", () => {
    expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
  });

  it("returns false when versions are equal", () => {
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
  });

  it("returns false when current is newer", () => {
    expect(isNewerVersion("2.0.0", "1.0.0")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fetchManifest
// ---------------------------------------------------------------------------
describe("fetchManifest", () => {
  const mockManifest: UpdateManifest = {
    latestVersion: "1.1.0",
    releaseDate: "2025-06-01T00:00:00Z",
    releaseNotes: "Bug fixes and improvements.",
    downloads: {
      mac: {
        url: "https://www.easy-claw.com/releases/EasyClaw-1.1.0.dmg",
        sha256: "abc123",
        size: 50_000_000,
      },
      win: {
        url: "https://www.easy-claw.com/releases/EasyClaw-1.1.0.exe",
        sha256: "def456",
        size: 55_000_000,
      },
    },
  };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockManifest),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and parses manifest from default URL", async () => {
    const manifest = await fetchManifest();
    expect(fetch).toHaveBeenCalledWith(MANIFEST_URLS.default, {
      signal: expect.any(AbortSignal),
    });
    expect(manifest).toEqual(mockManifest);
  });

  it("fetches from a custom URL when provided", async () => {
    const customUrl = "https://custom.example.com/manifest.json";
    await fetchManifest(customUrl);
    expect(fetch).toHaveBeenCalledWith(customUrl, {
      signal: expect.any(AbortSignal),
    });
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }),
    );
    await expect(fetchManifest()).rejects.toThrow(
      "Failed to fetch manifest: HTTP 404 Not Found",
    );
  });

  it("throws on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );
    await expect(fetchManifest()).rejects.toThrow("Network error");
  });
});

// ---------------------------------------------------------------------------
// getPlatformKey
// ---------------------------------------------------------------------------
describe("getPlatformKey", () => {
  it("returns 'mac' on darwin", () => {
    // We're running tests on macOS based on the env
    const result = getPlatformKey();
    // On macOS CI/local this should be "mac"
    if (process.platform === "darwin") {
      expect(result).toBe("mac");
    } else if (process.platform === "win32") {
      expect(result).toBe("win");
    }
  });
});

// ---------------------------------------------------------------------------
// checkForUpdate
// ---------------------------------------------------------------------------
describe("checkForUpdate", () => {
  const mockManifest: UpdateManifest = {
    latestVersion: "1.1.0",
    releaseDate: "2025-06-01T00:00:00Z",
    releaseNotes: "Bug fixes and improvements.",
    downloads: {
      mac: {
        url: "https://www.easy-claw.com/releases/EasyClaw-1.1.0.dmg",
        sha256: "abc123",
        size: 50_000_000,
      },
      win: {
        url: "https://www.easy-claw.com/releases/EasyClaw-1.1.0.exe",
        sha256: "def456",
        size: 55_000_000,
      },
    },
  };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockManifest),
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("detects when an update is available", async () => {
    const result = await checkForUpdate("1.0.0");
    expect(result.updateAvailable).toBe(true);
    expect(result.currentVersion).toBe("1.0.0");
    expect(result.latestVersion).toBe("1.1.0");
    expect(result.releaseNotes).toBe("Bug fixes and improvements.");
    expect(result.error).toBeUndefined();
  });

  it("detects when no update is available (same version)", async () => {
    const result = await checkForUpdate("1.1.0");
    expect(result.updateAvailable).toBe(false);
    expect(result.currentVersion).toBe("1.1.0");
    expect(result.latestVersion).toBe("1.1.0");
  });

  it("detects when no update is available (newer local)", async () => {
    const result = await checkForUpdate("2.0.0");
    expect(result.updateAvailable).toBe(false);
    expect(result.currentVersion).toBe("2.0.0");
    expect(result.latestVersion).toBe("1.1.0");
  });

  it("includes download info for the current platform", async () => {
    const result = await checkForUpdate("1.0.0");
    // Running on macOS
    if (process.platform === "darwin") {
      expect(result.download).toEqual(mockManifest.downloads.mac);
    } else if (process.platform === "win32") {
      expect(result.download).toEqual(mockManifest.downloads.win);
    }
  });

  it("returns error result on fetch failure (never throws)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Connection refused")),
    );
    const result = await checkForUpdate("1.0.0");
    expect(result.updateAvailable).toBe(false);
    expect(result.currentVersion).toBe("1.0.0");
    expect(result.latestVersion).toBeUndefined();
    expect(result.error).toBe("Connection refused");
  });

  it("returns error result on non-ok HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }),
    );
    const result = await checkForUpdate("1.0.0");
    expect(result.updateAvailable).toBe(false);
    expect(result.error).toContain("500");
  });

  it("passes custom manifestUrl to fetch", async () => {
    const customUrl = "https://staging.easy-claw.com/manifest.json";
    await checkForUpdate("1.0.0", { manifestUrl: customUrl });
    expect(fetch).toHaveBeenCalledWith(customUrl, {
      signal: expect.any(AbortSignal),
    });
  });

  it("uses CN manifest URL when region is cn", async () => {
    await checkForUpdate("1.0.0", { region: "cn" });
    expect(fetch).toHaveBeenCalledWith(
      MANIFEST_URLS.cn,
      { signal: expect.any(AbortSignal) },
    );
  });

  it("uses explicit manifestUrl over region", async () => {
    const customUrl = "https://staging.easy-claw.com/manifest.json";
    await checkForUpdate("1.0.0", { manifestUrl: customUrl, region: "cn" });
    expect(fetch).toHaveBeenCalledWith(
      customUrl,
      { signal: expect.any(AbortSignal) },
    );
  });

  it("handles manifest with no download for current platform", async () => {
    const manifestNoDownloads: UpdateManifest = {
      ...mockManifest,
      downloads: {},
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(manifestNoDownloads),
      }),
    );
    const result = await checkForUpdate("1.0.0");
    expect(result.updateAvailable).toBe(true);
    expect(result.download).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// downloadAndVerify
// ---------------------------------------------------------------------------
describe("downloadAndVerify", () => {
  const testContent = "Hello, EasyClaw update!";
  const testSha256 = createHash("sha256").update(testContent).digest("hex");
  const testSize = Buffer.byteLength(testContent);

  function createMockResponse(body: string, ok = true, status = 200) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(body));
        controller.close();
      },
    });
    return {
      ok,
      status,
      statusText: ok ? "OK" : "Not Found",
      body: stream,
    };
  }

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("downloads file and verifies checksum", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createMockResponse(testContent)));
    const destPath = join(tmpdir(), `easyclaw-test-${Date.now()}.bin`);

    try {
      const result = await downloadAndVerify(
        "https://example.com/update.zip",
        destPath,
        testSha256,
        testSize,
      );
      expect(result.verified).toBe(true);
      expect(result.filePath).toBe(destPath);

      const content = await readFile(destPath, "utf-8");
      expect(content).toBe(testContent);
    } finally {
      await unlink(destPath).catch(() => {});
    }
  });

  it("reports progress during download", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createMockResponse(testContent)));
    const destPath = join(tmpdir(), `easyclaw-test-${Date.now()}.bin`);
    const progressEvents: DownloadProgress[] = [];

    try {
      await downloadAndVerify(
        "https://example.com/update.zip",
        destPath,
        testSha256,
        testSize,
        (p) => progressEvents.push(p),
      );
      expect(progressEvents.length).toBeGreaterThan(0);
      const last = progressEvents[progressEvents.length - 1];
      expect(last.downloaded).toBe(testSize);
      expect(last.percent).toBe(100);
    } finally {
      await unlink(destPath).catch(() => {});
    }
  });

  it("throws and cleans up on checksum mismatch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createMockResponse(testContent)));
    const destPath = join(tmpdir(), `easyclaw-test-${Date.now()}.bin`);

    await expect(
      downloadAndVerify(
        "https://example.com/update.zip",
        destPath,
        "0000000000000000000000000000000000000000000000000000000000000000",
        testSize,
      ),
    ).rejects.toThrow("Checksum verification failed");

    // File should be cleaned up
    await expect(readFile(destPath)).rejects.toThrow();
  });

  it("throws on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(createMockResponse("", false, 404)));

    const destPath = join(tmpdir(), `easyclaw-test-${Date.now()}.bin`);
    await expect(
      downloadAndVerify("https://example.com/update.zip", destPath, testSha256, testSize),
    ).rejects.toThrow("Download failed: HTTP 404");
  });

  it("throws on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const destPath = join(tmpdir(), `easyclaw-test-${Date.now()}.bin`);
    await expect(
      downloadAndVerify("https://example.com/update.zip", destPath, testSha256, testSize),
    ).rejects.toThrow("Network error");
  });
});
