// @ts-check
// afterPack hook for electron-builder — copies vendor/openclaw/node_modules
// into the packaged app's extraResources.
//
// electron-builder respects .gitignore files (including the root one that has
// "node_modules/"), which silently blocks node_modules from extraResources copy.
// This hook works around that by copying node_modules manually after packing.

const fs = require("fs");
const path = require("path");

/**
 * @param {import("electron-builder").AfterPackContext} context
 */
exports.default = async function copyVendorDeps(context) {
  const { appOutDir, electronPlatformName } = context;

  // Resolve paths based on platform
  let resourcesDir;
  if (electronPlatformName === "darwin") {
    const productName = context.packager.appInfo.productFilename;
    resourcesDir = path.join(appOutDir, `${productName}.app`, "Contents", "Resources");
  } else {
    // Windows / Linux
    resourcesDir = path.join(appOutDir, "resources");
  }

  const vendorDest = path.join(resourcesDir, "vendor", "openclaw", "node_modules");
  const vendorSrc = path.resolve(__dirname, "..", "..", "..", "vendor", "openclaw", "node_modules");

  if (!fs.existsSync(vendorSrc)) {
    console.log(`[copy-vendor-deps] vendor/openclaw/node_modules not found at ${vendorSrc}, skipping.`);
    return;
  }

  if (fs.existsSync(vendorDest)) {
    console.log("[copy-vendor-deps] vendor/openclaw/node_modules already present, skipping.");
    return;
  }

  console.log(`[copy-vendor-deps] Copying vendor node_modules...`);
  console.log(`  from: ${vendorSrc}`);
  console.log(`  to:   ${vendorDest}`);

  fs.cpSync(vendorSrc, vendorDest, { recursive: true });

  // Count top-level entries to report
  const entries = fs.readdirSync(vendorDest).filter((e) => !e.startsWith("."));
  console.log(`[copy-vendor-deps] Done — ${entries.length} top-level packages copied.`);
};
