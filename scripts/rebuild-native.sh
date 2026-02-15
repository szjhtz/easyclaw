#!/usr/bin/env bash
# =============================================================================
# rebuild-native.sh — Build better-sqlite3 for both Node.js and Electron
#
# Creates ABI-specific prebuilds so that unit tests (Node.js) and E2E dev
# tests (Electron) can coexist without rebuilding.
#
# The `bindings` package resolves native addons using this path pattern:
#   lib/binding/node-v{ABI}-{platform}-{arch}/better_sqlite3.node
#
# By placing both builds there and removing build/Release/, the correct
# binary is loaded automatically based on the runtime's ABI version.
#
# Usage:
#   ./scripts/rebuild-native.sh           # skip if prebuilds already exist
#   ./scripts/rebuild-native.sh --force   # always rebuild
# =============================================================================
set -euo pipefail

unset ELECTRON_RUN_AS_NODE

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DESKTOP_DIR="$REPO_ROOT/apps/desktop"

# ---- Parse flags ----
FORCE=false
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=true ;;
  esac
done

# Resolve better-sqlite3 location in pnpm store
SQLITE_DIR=$(ls -d "$REPO_ROOT"/node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 | tail -1)
PLATFORM="$(node -p "process.platform + '-' + process.arch")"

echo "==> better-sqlite3 at: $SQLITE_DIR"
echo "==> Platform: $PLATFORM"

# ---- Quick check: skip if both prebuilds already exist ----
if [ "$FORCE" = false ]; then
  NODE_ABI=$(node -p "process.versions.modules")
  ELECTRON_ABI=$(cd "$DESKTOP_DIR" && ELECTRON_RUN_AS_NODE=1 npx electron -e "process.stdout.write(process.versions.modules)")
  NODE_BIN="$SQLITE_DIR/lib/binding/node-v${NODE_ABI}-${PLATFORM}/better_sqlite3.node"
  ELECTRON_BIN="$SQLITE_DIR/lib/binding/node-v${ELECTRON_ABI}-${PLATFORM}/better_sqlite3.node"

  if [ -f "$NODE_BIN" ] && [ -f "$ELECTRON_BIN" ] && [ ! -d "$SQLITE_DIR/build" ]; then
    echo ""
    echo "✅ Prebuilds already exist and build/ is absent — skipping rebuild."
    echo "   Node.js ABI $NODE_ABI: $NODE_BIN"
    echo "   Electron ABI $ELECTRON_ABI: $ELECTRON_BIN"
    echo "   Use --force to rebuild anyway."
    exit 0
  fi
fi

# ---- 1. Build for Node.js ----
echo ""
echo "==> Building for Node.js..."
rm -rf "$SQLITE_DIR/build"
(cd "$SQLITE_DIR" && npx node-gyp rebuild --release 2>&1 | tail -3)

NODE_ABI=$(node -p "process.versions.modules")
NODE_BINDING_DIR="$SQLITE_DIR/lib/binding/node-v${NODE_ABI}-${PLATFORM}"
mkdir -p "$NODE_BINDING_DIR"
cp "$SQLITE_DIR/build/Release/better_sqlite3.node" "$NODE_BINDING_DIR/"
echo "    Copied to lib/binding/node-v${NODE_ABI}-${PLATFORM}/"

# ---- 2. Build for Electron ----
echo ""
echo "==> Building for Electron..."
(cd "$DESKTOP_DIR" && npx electron-rebuild -f -o better-sqlite3 2>&1 | tail -3)

# Get Electron's internal Node.js ABI version
# ELECTRON_RUN_AS_NODE=1 makes Electron run as its internal Node.js
ELECTRON_ABI=$(cd "$DESKTOP_DIR" && ELECTRON_RUN_AS_NODE=1 npx electron -e "process.stdout.write(process.versions.modules)")
ELECTRON_BINDING_DIR="$SQLITE_DIR/lib/binding/node-v${ELECTRON_ABI}-${PLATFORM}"
mkdir -p "$ELECTRON_BINDING_DIR"
cp "$SQLITE_DIR/build/Release/better_sqlite3.node" "$ELECTRON_BINDING_DIR/"
echo "    Copied to lib/binding/node-v${ELECTRON_ABI}-${PLATFORM}/"

# ---- 3. Remove build/ so bindings falls through to lib/binding/ ----
rm -rf "$SQLITE_DIR/build"
echo ""
echo "==> Removed build/ directory (forces bindings to use lib/binding/)"

# ---- Done ----
echo ""
echo "✅ Native prebuilds ready:"
ls -la "$NODE_BINDING_DIR/"
ls -la "$ELECTRON_BINDING_DIR/"
echo ""
echo "Node.js (ABI $NODE_ABI) and Electron (ABI $ELECTRON_ABI) can now coexist."
