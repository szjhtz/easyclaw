#!/usr/bin/env bash
# =============================================================================
# release.sh — Build installers, compute hashes, update website & manifest
#
# Usage:
#   ./scripts/release.sh [version]
#
# Examples:
#   ./scripts/release.sh 0.1.0    # build + publish version 0.1.0
#   ./scripts/release.sh          # uses version from apps/desktop/package.json
#
# What it does:
#   1. Sets the version in apps/desktop/package.json
#   2. Builds all workspace packages (pnpm run build)
#   3. Builds macOS installer (DMG, universal)
#   4. Builds Windows installer (NSIS exe, cross-compiled)
#   5. Computes SHA-256 hashes
#   6. Copies installers to website/site/releases/
#   7. Updates website/site/update-manifest.json
#   8. Updates SHA-256 hashes in website/site/index.html
#
# Prerequisites:
#   - pnpm installed
#   - Node.js >= 22
#   - For Windows cross-compile: mono or wine (optional, NSIS works without)
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP_DIR="$REPO_ROOT/apps/desktop"
WEBSITE_DIR="$REPO_ROOT/website/site"
RELEASE_DIR="$DESKTOP_DIR/release"
WEBSITE_RELEASES="$WEBSITE_DIR/releases"

# ---- Helpers ----
info()  { echo "[INFO]  $*"; }
warn()  { echo "[WARN]  $*" >&2; }
error() { echo "[ERROR] $*" >&2; exit 1; }

# ---- Determine version ----
if [ -n "${1:-}" ]; then
  VERSION="$1"
else
  VERSION=$(node -e "console.log(require('$DESKTOP_DIR/package.json').version)")
fi

if [ "$VERSION" = "0.0.0" ] && [ -z "${1:-}" ]; then
  error "Version is 0.0.0. Pass a version argument: ./scripts/release.sh 0.1.0"
fi

info "Building EasyClaw v$VERSION"

# ---- Step 1: Set version in package.json ----
info "Setting version to $VERSION in apps/desktop/package.json ..."
node -e "
  const fs = require('fs');
  const path = '$DESKTOP_DIR/package.json';
  const pkg = JSON.parse(fs.readFileSync(path, 'utf-8'));
  pkg.version = '$VERSION';
  fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n');
"
info "Version set."

# ---- Step 2: Build all packages ----
info "Building all workspace packages ..."
(cd "$REPO_ROOT" && pnpm run build)
info "Build complete."

# ---- Step 3: Build macOS installer ----
info "Building macOS installer (DMG + ZIP, universal) ..."
(cd "$DESKTOP_DIR" && pnpm run dist:mac)
info "macOS installer built."

# ---- Step 4: Build Windows installer ----
info "Building Windows installer (NSIS + portable) ..."
(cd "$DESKTOP_DIR" && pnpm run dist:win) || {
  warn "Windows build failed (may need wine/mono for cross-compile). Skipping."
}

# ---- Step 5: Find built artifacts and compute hashes ----
info "Computing SHA-256 hashes ..."

DMG_FILE=$(ls "$RELEASE_DIR"/*.dmg 2>/dev/null | head -1 || true)
EXE_FILE=$(ls "$RELEASE_DIR"/*Setup*.exe 2>/dev/null | head -1 || true)

if [ -z "$DMG_FILE" ]; then
  warn "No .dmg file found in $RELEASE_DIR"
fi
if [ -z "$EXE_FILE" ]; then
  warn "No Setup .exe file found in $RELEASE_DIR"
fi

DMG_HASH=""
DMG_SIZE=0
DMG_NAME=""
if [ -n "$DMG_FILE" ]; then
  DMG_HASH=$(shasum -a 256 "$DMG_FILE" | awk '{print $1}')
  DMG_SIZE=$(stat -f%z "$DMG_FILE" 2>/dev/null || stat -c%s "$DMG_FILE" 2>/dev/null || echo 0)
  DMG_NAME=$(basename "$DMG_FILE")
  info "  macOS: $DMG_NAME"
  info "    SHA-256: $DMG_HASH"
  info "    Size: $DMG_SIZE bytes"
fi

EXE_HASH=""
EXE_SIZE=0
EXE_NAME=""
if [ -n "$EXE_FILE" ]; then
  EXE_HASH=$(shasum -a 256 "$EXE_FILE" | awk '{print $1}')
  EXE_SIZE=$(stat -f%z "$EXE_FILE" 2>/dev/null || stat -c%s "$EXE_FILE" 2>/dev/null || echo 0)
  EXE_NAME=$(basename "$EXE_FILE")
  info "  Windows: $EXE_NAME"
  info "    SHA-256: $EXE_HASH"
  info "    Size: $EXE_SIZE bytes"
fi

# ---- Step 6: Copy to website/site/releases/ ----
info "Copying installers to $WEBSITE_RELEASES ..."
mkdir -p "$WEBSITE_RELEASES"

if [ -n "$DMG_FILE" ]; then
  cp "$DMG_FILE" "$WEBSITE_RELEASES/"
  info "  Copied $DMG_NAME"
fi
if [ -n "$EXE_FILE" ]; then
  cp "$EXE_FILE" "$WEBSITE_RELEASES/"
  info "  Copied $EXE_NAME"
fi

# ---- Step 7: Update update-manifest.json ----
info "Updating update-manifest.json ..."
MANIFEST="$WEBSITE_DIR/update-manifest.json"
RELEASE_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

node -e "
  const fs = require('fs');
  const manifest = JSON.parse(fs.readFileSync('$MANIFEST', 'utf-8'));
  manifest.latestVersion = '$VERSION';
  manifest.releaseDate = '$RELEASE_DATE';
  if ('$DMG_HASH') {
    manifest.downloads.mac.url = 'https://www.easy-claw.com/releases/$DMG_NAME';
    manifest.downloads.mac.sha256 = '$DMG_HASH';
    manifest.downloads.mac.size = $DMG_SIZE;
  }
  if ('$EXE_HASH') {
    manifest.downloads.win.url = 'https://www.easy-claw.com/releases/$EXE_NAME';
    manifest.downloads.win.sha256 = '$EXE_HASH';
    manifest.downloads.win.size = $EXE_SIZE;
  }
  fs.writeFileSync('$MANIFEST', JSON.stringify(manifest, null, 2) + '\n');
"
info "Manifest updated."

# ---- Step 8: Update index.html hashes and download links ----
info "Updating index.html ..."
HTML="$WEBSITE_DIR/index.html"

if [ -n "$DMG_HASH" ]; then
  # Update macOS download link href
  sed -i.bak "s|/releases/EasyClaw-[^\"]*\.dmg|/releases/$DMG_NAME|g" "$HTML"
  # Update macOS hash — first hash-value code block
  node -e "
    let html = require('fs').readFileSync('$HTML', 'utf-8');
    // Replace first placeholder/old hash in the macOS card
    html = html.replace(
      /(<!-- macOS -->[\s\S]*?<code class=\"hash-value\">)[^<]*/,
      '\$1$DMG_HASH'
    );
    require('fs').writeFileSync('$HTML', html);
  "
fi

if [ -n "$EXE_HASH" ]; then
  # Update Windows download link href
  sed -i.bak "s|/releases/EasyClaw-Setup-[^\"]*\.exe|/releases/$EXE_NAME|g" "$HTML"
  # Update Windows hash — second hash-value code block
  node -e "
    let html = require('fs').readFileSync('$HTML', 'utf-8');
    // Replace hash in the Windows card
    html = html.replace(
      /(<!-- Windows -->[\s\S]*?<code class=\"hash-value\">)[^<]*/,
      '\$1$EXE_HASH'
    );
    require('fs').writeFileSync('$HTML', html);
  "
fi

# Update version strings in index.html
sed -i.bak "s|<span class=\"version\">[^<]*|<span class=\"version\">$VERSION|g" "$HTML"
sed -i.bak "s|<p class=\"download-version\">v[^<]*|<p class=\"download-version\">v$VERSION|g" "$HTML"

# Clean up sed backup files
rm -f "$HTML.bak"

info "index.html updated."

# ---- Done ----
echo ""
info "==============================================="
info "  Release v$VERSION built successfully!"
info ""
if [ -n "$DMG_FILE" ]; then
  info "  macOS:   $DMG_NAME ($DMG_HASH)"
fi
if [ -n "$EXE_FILE" ]; then
  info "  Windows: $EXE_NAME ($EXE_HASH)"
fi
info ""
info "  Files are in: $WEBSITE_RELEASES/"
info "  Manifest:     $MANIFEST"
info ""
info "  Next steps:"
info "    1. git add && git commit && git push"
info "    2. On server: git pull && docker compose restart nginx"
info "==============================================="
