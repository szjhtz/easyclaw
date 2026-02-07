export type {
  UpdateManifest,
  PlatformDownload,
  UpdateCheckResult,
} from "./types.js";
export { parseVersion, compareVersions, isNewerVersion } from "./version.js";
export {
  DEFAULT_MANIFEST_URL,
  fetchManifest,
  getPlatformKey,
  checkForUpdate,
} from "./checker.js";
