/** The update manifest served at the static website */
export interface UpdateManifest {
  /** Latest version string (semver, e.g. "0.1.0") */
  latestVersion: string;
  /** ISO 8601 release date */
  releaseDate: string;
  /** Release notes (markdown) */
  releaseNotes: string;
  /** Per-platform download info */
  downloads: {
    mac?: PlatformDownload;
    win?: PlatformDownload;
  };
  /** Minimum version that can auto-update (older must re-download) */
  minVersion?: string;
}

export interface PlatformDownload {
  /** Download URL (DMG for macOS, NSIS .exe for Windows) */
  url: string;
  /** SHA-256 checksum of the primary file */
  sha256: string;
  /** File size in bytes */
  size: number;
  /** ZIP download URL for in-app update (macOS only) */
  zipUrl?: string;
  /** SHA-256 checksum of the ZIP file */
  zipSha256?: string;
  /** File size of the ZIP file in bytes */
  zipSize?: number;
}

/** Download progress event data */
export interface DownloadProgress {
  /** Bytes downloaded so far */
  downloaded: number;
  /** Total file size in bytes */
  total: number;
  /** Progress percentage (0-100) */
  percent: number;
}

/** Result of a download + verify operation */
export interface DownloadResult {
  /** Path to the downloaded file */
  filePath: string;
  /** Whether checksum verification passed */
  verified: boolean;
}

/** State of the update download/install process */
export type UpdateDownloadState =
  | { status: "idle" }
  | { status: "downloading"; percent: number; downloadedBytes: number; totalBytes: number }
  | { status: "verifying" }
  | { status: "ready"; filePath: string }
  | { status: "installing" }
  | { status: "error"; message: string };

export interface UpdateCheckResult {
  /** Whether an update is available */
  updateAvailable: boolean;
  /** Current version */
  currentVersion: string;
  /** Latest version from manifest (undefined if check failed) */
  latestVersion?: string;
  /** Download info for current platform */
  download?: PlatformDownload;
  /** Release notes */
  releaseNotes?: string;
  /** Error message if check failed */
  error?: string;
}
