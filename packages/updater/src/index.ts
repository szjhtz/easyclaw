export type {
  UpdateManifest,
  PlatformDownload,
  UpdateCheckResult,
} from "./types.js";
export { parseVersion, compareVersions, isNewerVersion } from "./version.js";
export {
  MANIFEST_URLS,
  fetchManifest,
  getPlatformKey,
  checkForUpdate,
} from "./checker.js";
