import { spawn } from "node:child_process";
import { writeFile, mkdir, access, constants } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createLogger } from "@easyclaw/logger";

const log = createLogger("updater:installer");

/**
 * Launch the downloaded NSIS installer in silent mode and quit the app.
 * The NSIS installer handles killing the old process and replacing files.
 */
export function installWindows(exePath: string, quitApp: () => void): void {
  log.info(`Launching NSIS installer: ${exePath} /S`);

  const child = spawn(exePath, ["/S"], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  // Give the installer a moment to start, then quit
  setTimeout(() => {
    quitApp();
  }, 500);
}

/**
 * Extract the zip, write a helper shell script that swaps the .app bundle
 * after this process exits, then quit.
 *
 * @throws If the app's parent directory is not writable.
 */
export async function installMacOS(
  zipPath: string,
  appBundlePath: string,
  quitApp: () => void,
): Promise<void> {
  const tempDir = dirname(zipPath);
  const extractDir = join(tempDir, "easyclaw-update-extract");

  // Check write permissions on the app's parent directory
  const appParent = dirname(appBundlePath);
  try {
    await access(appParent, constants.W_OK);
  } catch {
    throw new Error(
      `No write permission to ${appParent}. Please update manually.`,
    );
  }

  // Extract using ditto (macOS native, handles resource forks correctly)
  await mkdir(extractDir, { recursive: true });
  log.info(`Extracting ${zipPath} to ${extractDir}`);

  await new Promise<void>((res, rej) => {
    const child = spawn("ditto", ["-xk", zipPath, extractDir]);
    child.on("close", (code) => {
      if (code === 0) res();
      else rej(new Error(`ditto extract failed with exit code ${code}`));
    });
    child.on("error", rej);
  });

  // electron-builder zip contains EasyClaw.app at the root
  const appName = "EasyClaw.app";
  const newAppPath = join(extractDir, appName);

  // Write updater shell script
  const scriptPath = join(tempDir, "easyclaw-update.sh");
  const script = `#!/bin/bash
# EasyClaw auto-update helper script
PID=${process.pid}
APP_PATH="${appBundlePath}"
NEW_APP="${newAppPath}"

# Wait for the old process to exit (max 30s)
WAIT=0
while kill -0 "$PID" 2>/dev/null; do
  sleep 0.5
  WAIT=$((WAIT + 1))
  if [ "$WAIT" -gt 60 ]; then
    echo "Timeout waiting for process to exit"
    exit 1
  fi
done

sleep 0.5

# Move old app to trash
if [ -d "$APP_PATH" ]; then
  mv "$APP_PATH" "$HOME/.Trash/EasyClaw-old-$(date +%s).app" 2>/dev/null || rm -rf "$APP_PATH"
fi

# Move new app into place
mv "$NEW_APP" "$APP_PATH"

# Clear quarantine attribute
xattr -cr "$APP_PATH" 2>/dev/null

# Relaunch
open "$APP_PATH"

# Cleanup
rm -rf "${extractDir}"
rm -f "${zipPath}"
rm -f "$0"
`;

  await writeFile(scriptPath, script, { mode: 0o755 });

  log.info(`Spawning update helper script: ${scriptPath}`);
  const child = spawn("bash", [scriptPath], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  setTimeout(() => {
    quitApp();
  }, 500);
}

/**
 * Resolve the path to the current .app bundle on macOS.
 * process.resourcesPath → .../EasyClaw.app/Contents/Resources
 * We go up 2 levels to get the .app directory.
 */
export function resolveAppBundlePath(): string {
  return resolve(process.resourcesPath, "..", "..");
}
