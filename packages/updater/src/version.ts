/**
 * Parse a semver version string into a tuple of [major, minor, patch].
 * Throws if the string is not a valid semver version (e.g. "1.2.3").
 */
export function parseVersion(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid version string: "${version}"`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Compare two semver version strings.
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const [aMajor, aMinor, aPatch] = parseVersion(a);
  const [bMajor, bMinor, bPatch] = parseVersion(b);

  if (aMajor !== bMajor) return aMajor > bMajor ? 1 : -1;
  if (aMinor !== bMinor) return aMinor > bMinor ? 1 : -1;
  if (aPatch !== bPatch) return aPatch > bPatch ? 1 : -1;
  return 0;
}

/**
 * Returns true if the latest version is newer than the current version.
 */
export function isNewerVersion(current: string, latest: string): boolean {
  return compareVersions(latest, current) === 1;
}
