import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

/** Module-level cache: computed once per process lifetime. */
let cachedDeviceId: string | null = null;

/**
 * Get a stable, privacy-preserving device identifier.
 *
 * Derived by SHA-256 hashing a platform-specific hardware identifier:
 * - macOS: IOPlatformUUID from `ioreg`
 * - Windows: MachineGuid from registry
 *
 * The result is cached in memory for the process lifetime.
 * Since the ID is deterministic from hardware, it survives app reinstalls.
 *
 * @returns A 64-character lowercase hex SHA-256 hash string.
 */
export function getDeviceId(): string {
  if (cachedDeviceId !== null) {
    return cachedDeviceId;
  }

  const rawId = getHardwareId();
  cachedDeviceId = createHash("sha256").update(rawId).digest("hex");
  return cachedDeviceId;
}

function getHardwareId(): string {
  switch (process.platform) {
    case "darwin":
      return getMacHardwareId();
    case "win32":
      return getWindowsHardwareId();
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

/**
 * macOS: Extract IOPlatformUUID from IOPlatformExpertDevice.
 */
function getMacHardwareId(): string {
  const output = execSync("ioreg -rd1 -c IOPlatformExpertDevice", {
    encoding: "utf-8",
    timeout: 5000,
  });

  const match = output.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
  if (!match?.[1]) {
    throw new Error("Failed to extract IOPlatformUUID from ioreg output");
  }

  return match[1];
}

/**
 * Windows: Read MachineGuid from the Cryptography registry key.
 */
function getWindowsHardwareId(): string {
  const output = execSync(
    'reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid',
    { encoding: "utf-8", timeout: 5000 },
  );

  const match = output.match(/MachineGuid\s+REG_SZ\s+(\S+)/);
  if (!match?.[1]) {
    throw new Error("Failed to extract MachineGuid from registry");
  }

  return match[1];
}
