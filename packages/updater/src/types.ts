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
  /** Download URL */
  url: string;
  /** SHA-256 checksum of the file */
  sha256: string;
  /** File size in bytes */
  size: number;
}

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
