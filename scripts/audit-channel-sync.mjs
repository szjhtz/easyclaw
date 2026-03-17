#!/usr/bin/env node
/**
 * Audit channel/schema sync between RivonClaw UI schemas and vendor (OpenClaw).
 *
 * For each channel with declared critical fields, verifies that:
 *   1) All requiredFieldIds appear as field `id` values in RivonClaw's channel-schemas.ts
 *   2) New vendor fields not in RivonClaw schema are reported as informational notes
 *
 * Usage:
 *   node scripts/audit-channel-sync.mjs
 *
 * Exit codes:
 *   0 - All critical fields present
 *   1 - Critical field(s) missing from RivonClaw schema
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Critical fields per channel — fields that MUST exist in RivonClaw's schema
// ---------------------------------------------------------------------------
const CRITICAL_CHANNEL_FIELDS = {
  telegram: {
    schemaFile: "apps/panel/src/channel-schemas.ts",
    vendorTypeFile: "vendor/openclaw/src/config/types.telegram.ts",
    requiredFieldIds: ["botToken", "dmPolicy", "groupPolicy"],
  },
  feishu: {
    schemaFile: "apps/panel/src/channel-schemas.ts",
    vendorTypeFile: "vendor/openclaw/extensions/feishu/src/config-schema.ts",
    requiredFieldIds: [
      "appId",
      "appSecret",
      "domain",
      "connectionMode",
      "dmPolicy",
      "groupPolicy",
      "verificationToken",
    ],
  },
  // Other channels can be added as needed
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract field IDs from RivonClaw's channel-schemas.ts for a given channel.
 *
 * Handles two patterns:
 *   1) Inline field objects with `id: "fieldName"` in the channel block
 *   2) Helper function calls like `dmPolicyField()` — resolves by finding
 *      the function definition elsewhere in the file and extracting its `id`
 */
function getRivonClawFieldIds(schemaFilePath, channelId) {
  if (!existsSync(schemaFilePath)) {
    console.error(`  [error] Schema file not found: ${schemaFilePath}`);
    return null;
  }
  const content = readFileSync(schemaFilePath, "utf-8");

  // Find the channel block — starts with `channelId: {` and ends at matching `}`
  const channelPattern = new RegExp(
    `\\b${channelId}:\\s*\\{`,
    "g",
  );
  const match = channelPattern.exec(content);
  if (!match) {
    return null;
  }

  // Extract from the match position to the end of the channel block
  // Track brace depth to find the closing brace
  let depth = 0;
  let startIdx = match.index + match[0].length - 1; // position of opening {
  let endIdx = startIdx;
  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === "{") depth++;
    if (content[i] === "}") depth--;
    if (depth === 0) {
      endIdx = i;
      break;
    }
  }

  const channelBlock = content.slice(startIdx, endIdx + 1);

  const fieldIds = new Set();

  // Pattern 1: Inline id: "..." values within the channel block
  const idPattern = /id:\s*"(\w+)"/g;
  let idMatch;
  while ((idMatch = idPattern.exec(channelBlock)) !== null) {
    fieldIds.add(idMatch[1]);
  }

  // Pattern 2: Helper function calls like `dmPolicyField()` or `groupPolicyField()`
  // Find function call names in the channel block's fields array
  const fnCallPattern = /(\w+Field)\s*\(/g;
  let fnMatch;
  while ((fnMatch = fnCallPattern.exec(channelBlock)) !== null) {
    const fnName = fnMatch[1];
    // Find the function definition in the full file and extract its id
    const fnDefPattern = new RegExp(
      `function\\s+${fnName}\\b[^{]*\\{([\\s\\S]*?)^\\}`,
      "m",
    );
    const fnDef = fnDefPattern.exec(content);
    if (fnDef) {
      const fnIdPattern = /id:\s*"(\w+)"/;
      const fnIdMatch = fnIdPattern.exec(fnDef[1]);
      if (fnIdMatch) {
        fieldIds.add(fnIdMatch[1]);
      }
    }
  }

  return fieldIds;
}

/**
 * Extract property names from a vendor TypeScript type/interface file.
 * Looks for patterns like `propertyName:` or `propertyName?:` in type definitions.
 */
function getVendorFieldNames(vendorFilePath) {
  if (!existsSync(vendorFilePath)) {
    console.warn(`  [warn] Vendor type file not found: ${vendorFilePath}`);
    return null;
  }
  const content = readFileSync(vendorFilePath, "utf-8");

  const fields = new Set();
  // Match property patterns: word followed by optional ? then :
  // Excludes lines that are comments, imports, or function calls
  const propPattern = /^\s+(\w+)\??:\s/gm;
  let m;
  while ((m = propPattern.exec(content)) !== null) {
    const field = m[1];
    // Skip common TypeScript noise
    if (["type", "export", "import", "const", "function", "return", "if", "else"].includes(field)) {
      continue;
    }
    fields.add(field);
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log("=== Channel Schema Sync Audit ===\n");

  const schemaFile = join(rootDir, "apps/panel/src/channel-schemas.ts");
  if (!existsSync(schemaFile)) {
    console.error("[error] apps/panel/src/channel-schemas.ts not found");
    process.exit(2);
  }

  let totalCriticalMissing = 0;
  const channelIds = Object.keys(CRITICAL_CHANNEL_FIELDS);

  for (const channelId of channelIds) {
    const config = CRITICAL_CHANNEL_FIELDS[channelId];
    const fullSchemaPath = join(rootDir, config.schemaFile);
    const fullVendorPath = join(rootDir, config.vendorTypeFile);

    console.log(`--- ${channelId} ---`);

    // 1) Check critical fields in RivonClaw schema
    const rivonClawFields = getRivonClawFieldIds(fullSchemaPath, channelId);
    if (rivonClawFields === null) {
      console.log(`  [FAIL] Channel "${channelId}" not found in ${config.schemaFile}`);
      totalCriticalMissing += config.requiredFieldIds.length;
      console.log();
      continue;
    }

    const missingCritical = config.requiredFieldIds.filter(
      (f) => !rivonClawFields.has(f),
    );

    if (missingCritical.length === 0) {
      console.log(`  [PASS] All ${config.requiredFieldIds.length} critical fields present`);
    } else {
      console.log(`  [FAIL] Missing critical fields:`);
      for (const f of missingCritical) {
        console.log(`    - ${f}`);
      }
      totalCriticalMissing += missingCritical.length;
    }

    // 2) Check for new vendor fields not in RivonClaw (informational)
    const vendorFields = getVendorFieldNames(fullVendorPath);
    if (vendorFields !== null) {
      const newVendorFields = [];
      for (const vf of vendorFields) {
        if (!rivonClawFields.has(vf)) {
          newVendorFields.push(vf);
        }
      }
      if (newVendorFields.length > 0) {
        console.log(`  [INFO] Vendor fields not in RivonClaw schema (may not need UI):`);
        for (const f of newVendorFields) {
          console.log(`    - ${f}`);
        }
      } else {
        console.log(`  [INFO] No new vendor-only fields detected`);
      }
    }

    console.log();
  }

  // Summary
  console.log("--- Summary ---");
  console.log(`  Channels audited:       ${channelIds.length}`);
  console.log(`  Critical fields missing: ${totalCriticalMissing}`);

  if (totalCriticalMissing > 0) {
    console.log();
    console.log("HOW TO FIX:");
    console.log("  Missing critical fields must be added to the channel schema in");
    console.log("  apps/panel/src/channel-schemas.ts. Each field needs an entry in the");
    console.log("  channel's `fields` array with appropriate id, label, type, and other");
    console.log("  properties. See existing entries for reference.");
    console.log();
    console.log("  After fixing, re-run: node scripts/audit-channel-sync.mjs");
    process.exit(1);
  }
}

main();
