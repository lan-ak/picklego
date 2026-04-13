#!/bin/bash
# Symlink App Group containers between paired iPhone and Watch simulators
# so they share scheduled_matches.json for local testing.
#
# On real devices, App Groups share a container natively. On the simulator,
# each device has its own filesystem, so we bridge them with a symlink.
#
# Usage:
#   ./scripts/sim-watch-override.sh           # Create the symlink
#   ./scripts/sim-watch-override.sh --check   # Verify existing symlink
#
# Run after booting both simulators and installing both apps.
# Re-run after reinstalling either app (container paths change).

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
RESET='\033[0m'

APP_GROUP="group.com.picklego.picklego"
PHONE_BUNDLE="com.picklego.picklego"
WATCH_BUNDLE="com.picklego.picklego.watchkitapp"
SHARED_FILE="scheduled_matches.json"

info()  { echo -e "${GREEN}✓${RESET} $1"; }
warn()  { echo -e "${YELLOW}!${RESET} $1"; }
fail()  { echo -e "${RED}✗${RESET} $1"; exit 1; }

find_simulators() {
  PAIR_INFO=$(xcrun simctl list pairs | grep -A2 "active, connected" || true)

  WATCH_UDID=$(echo "$PAIR_INFO" | grep "Watch:" | grep "Booted" | head -1 \
    | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' || true)
  PHONE_UDID=$(echo "$PAIR_INFO" | grep "Phone:" | grep "Booted" | head -1 \
    | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' || true)

  if [ -z "$PHONE_UDID" ]; then fail "No booted iPhone simulator with paired watch found. Boot a paired iPhone+Watch combo first."; fi
  if [ -z "$WATCH_UDID" ]; then fail "No booted Apple Watch simulator found."; fi

  info "Phone simulator: $PHONE_UDID"
  info "Watch simulator: $WATCH_UDID"
}

find_app_groups() {
  PHONE_GROUP=$(xcrun simctl get_app_container "$PHONE_UDID" "$PHONE_BUNDLE" groups 2>/dev/null \
    | grep "$APP_GROUP" | awk '{print $2}' || true)
  WATCH_GROUP=$(xcrun simctl get_app_container "$WATCH_UDID" "$WATCH_BUNDLE" groups 2>/dev/null \
    | grep "$APP_GROUP" | awk '{print $2}' || true)

  if [ -z "$PHONE_GROUP" ]; then fail "Phone app not installed or App Group not configured."; fi
  if [ -z "$WATCH_GROUP" ]; then fail "Watch app not installed or App Group not configured."; fi
}

cmd_check() {
  find_simulators
  find_app_groups

  LINK="$WATCH_GROUP/$SHARED_FILE"
  if [ -L "$LINK" ]; then
    TARGET=$(readlink "$LINK")
    if [ "$TARGET" = "$PHONE_GROUP/$SHARED_FILE" ]; then
      info "Symlink is valid: $LINK -> $TARGET"
    else
      warn "Symlink exists but points to wrong target: $TARGET"
      warn "Expected: $PHONE_GROUP/$SHARED_FILE"
      warn "Re-run without --check to fix."
    fi
  else
    warn "No symlink found at $LINK"
    warn "Run without --check to create it."
  fi
}

cmd_link() {
  find_simulators
  find_app_groups

  # Clean up any existing file/symlink
  rm -f "$WATCH_GROUP/$SHARED_FILE"

  # Create symlink: watch reads from phone's container
  ln -sf "$PHONE_GROUP/$SHARED_FILE" "$WATCH_GROUP/$SHARED_FILE"

  info "Symlink created:"
  echo "  $WATCH_GROUP/$SHARED_FILE -> $PHONE_GROUP/$SHARED_FILE"
  echo ""
  info "Watch simulator will now read matches from the phone's App Group container."
  info "Restart the watch app to pick up changes."
}

case "${1:-}" in
  --check) cmd_check ;;
  *)       cmd_link ;;
esac
