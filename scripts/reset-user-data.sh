#!/usr/bin/env bash
# reset-user-data.sh — Wipe all EasyClaw + OpenClaw user data to simulate fresh onboarding.
#
# What gets cleaned:
#   1. SQLite database          ~/.easyclaw/db.sqlite*
#   2. Gateway state            ~/.easyclaw/openclaw/
#   3. Logs                     ~/.easyclaw/logs/
#   4. OpenClaw workspace       ~/.openclaw/workspace/
#   5. OpenClaw subagents       ~/.openclaw/subagents/
#   6. OpenClaw canvas          ~/.openclaw/canvas/
#   7. macOS Keychain entries   account=easyclaw, service=easyclaw/*
#
# Usage:
#   ./scripts/reset-user-data.sh          # interactive (asks for confirmation)
#   ./scripts/reset-user-data.sh --force  # skip confirmation

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

EASYCLAW_DIR="$HOME/.easyclaw"
OPENCLAW_DIR="$HOME/.openclaw"

# ── Pre-flight: kill running EasyClaw / OpenClaw processes ────────────────────

check_running_processes() {
  local pids
  # Match the Electron app or the openclaw gateway process, but NOT dev tools
  # like turbo/node/pnpm that happen to run inside the easyclaw directory.
  pids=$(pgrep -f 'EasyClaw\.app|easyclaw.*Electron|openclaw.*gateway' 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    echo -e "${YELLOW}Warning: EasyClaw/OpenClaw processes are still running:${NC}"
    ps -p "$pids" -o pid,command 2>/dev/null || true
    echo ""
    echo -e "${YELLOW}Please quit EasyClaw before running this script.${NC}"
    exit 1
  fi
}

# ── Confirmation ──────────────────────────────────────────────────────────────

confirm() {
  if [[ "${1:-}" == "--force" ]]; then
    return 0
  fi

  echo -e "${RED}This will permanently delete ALL EasyClaw user data:${NC}"
  echo ""
  echo "  - SQLite database     ($EASYCLAW_DIR/db.sqlite*)"
  echo "  - Gateway config      ($EASYCLAW_DIR/openclaw/)"
  echo "  - Logs                ($EASYCLAW_DIR/logs/)"
  echo "  - Agent workspace     ($OPENCLAW_DIR/workspace/)"
  echo "  - Agent subagents     ($OPENCLAW_DIR/subagents/)"
  echo "  - Keychain secrets    (account: easyclaw)"
  echo ""
  read -rp "Type 'yes' to confirm: " answer
  if [[ "$answer" != "yes" ]]; then
    echo "Aborted."
    exit 0
  fi
}

# ── Cleanup functions ─────────────────────────────────────────────────────────

clean_filesystem() {
  local count=0

  # ~/.easyclaw/
  if [[ -d "$EASYCLAW_DIR" ]]; then
    rm -rf "$EASYCLAW_DIR"
    echo -e "  ${GREEN}✓${NC} Removed $EASYCLAW_DIR"
    ((count++))
  fi

  # ~/.openclaw/workspace/ and related dirs (keep .openclaw itself if other tools use it)
  for subdir in workspace subagents canvas; do
    if [[ -d "$OPENCLAW_DIR/$subdir" ]]; then
      rm -rf "$OPENCLAW_DIR/$subdir"
      echo -e "  ${GREEN}✓${NC} Removed $OPENCLAW_DIR/$subdir/"
      ((count++))
    fi
  done

  if [[ $count -eq 0 ]]; then
    echo -e "  ${YELLOW}-${NC} No filesystem data found"
  fi
}

clean_keychain() {
  if [[ "$(uname)" != "Darwin" ]]; then
    echo -e "  ${YELLOW}-${NC} Not macOS, skipping Keychain"
    return
  fi

  # List all easyclaw/* service names from Keychain
  local keys
  keys=$(security dump-keychain 2>/dev/null \
    | grep -oE '"svce"<blob>="easyclaw/[^"]+"' \
    | sed 's/"svce"<blob>="easyclaw\///' \
    | sed 's/"$//' \
    || true)

  if [[ -z "$keys" ]]; then
    echo -e "  ${YELLOW}-${NC} No Keychain entries found"
    return
  fi

  local count=0
  while IFS= read -r key; do
    if security delete-generic-password -a easyclaw -s "easyclaw/$key" >/dev/null 2>&1; then
      ((count++))
    fi
  done <<< "$keys"

  echo -e "  ${GREEN}✓${NC} Deleted $count Keychain entries"
}

# ── Main ──────────────────────────────────────────────────────────────────────

main() {
  check_running_processes
  confirm "${1:-}"

  echo ""
  echo "Cleaning filesystem..."
  clean_filesystem

  echo ""
  echo "Cleaning Keychain..."
  clean_keychain

  echo ""
  echo -e "${GREEN}Done! EasyClaw is now in a fresh state.${NC}"
  echo "Launch EasyClaw to start onboarding from scratch."
}

main "$@"
