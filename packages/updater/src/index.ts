export type {
  UpdateManifest,
  PlatformDownload,
  UpdateCheckResult,
  DownloadProgress,
  DownloadResult,
  UpdateDownloadState,
} from "./types.js";
export { parseVersion, compareVersions, isNewerVersion } from "./version.js";
export {
  MANIFEST_URLS,
  fetchManifest,
  getPlatformKey,
  checkForUpdate,
} from "./checker.js";
export { downloadAndVerify } from "./downloader.js";
export {
  installWindows,
  installMacOS,
  resolveAppBundlePath,
} from "./installer.js";
