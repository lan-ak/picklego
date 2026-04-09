#!/bin/bash
# Creates a symlink between phone and watch simulator App Group containers
# so the shared file approach works for WatchConnectivity testing.
#
# On real devices, App Groups share a container natively. On the simulator,
# each device has its own filesystem, so we bridge them with a symlink.
#
# Usage: ./scripts/setup-simulator-symlink.sh
# Run after booting both simulators and installing both apps.

set -euo pipefail

APP_GROUP="group.com.picklego.picklego"
PHONE_BUNDLE="com.picklego.picklego"
WATCH_BUNDLE="com.picklego.picklego.watchkitapp"
SHARED_FILE="scheduled_matches.json"

# Find booted paired simulators using simctl list pairs
echo "Looking for booted simulator pair..."

# Parse pairs to find a connected pair with both devices booted
PAIR_INFO=$(xcrun simctl list pairs | grep -A2 "active, connected")
WATCH_UDID=$(echo "$PAIR_INFO" | grep "Watch:" | grep "Booted" | head -1 | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}')
PHONE_UDID=$(echo "$PAIR_INFO" | grep "Phone:" | grep "Booted" | head -1 | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}')

if [ -z "$PHONE_UDID" ]; then
    echo "Error: No booted iPhone simulator with paired watch found."
    echo "Boot a paired iPhone+Watch combo first."
    exit 1
fi

if [ -z "$WATCH_UDID" ]; then
    echo "Error: No booted Apple Watch simulator found."
    exit 1
fi

echo "Phone simulator: $PHONE_UDID"
echo "Watch simulator: $WATCH_UDID"

# Get App Group containers
PHONE_GROUP=$(xcrun simctl get_app_container "$PHONE_UDID" "$PHONE_BUNDLE" groups 2>/dev/null | grep "$APP_GROUP" | awk '{print $2}')
WATCH_GROUP=$(xcrun simctl get_app_container "$WATCH_UDID" "$WATCH_BUNDLE" groups 2>/dev/null | grep "$APP_GROUP" | awk '{print $2}')

if [ -z "$PHONE_GROUP" ]; then
    echo "Error: Phone app not installed or App Group not configured."
    echo "Install the phone app first: xcrun simctl install $PHONE_UDID <path-to-app>"
    exit 1
fi

if [ -z "$WATCH_GROUP" ]; then
    echo "Error: Watch app not installed or App Group not configured."
    echo "Install the watch app first: xcrun simctl install $WATCH_UDID <path-to-app>"
    exit 1
fi

echo "Phone App Group: $PHONE_GROUP"
echo "Watch App Group: $WATCH_GROUP"

# Remove existing file/symlink in watch container
rm -f "$WATCH_GROUP/$SHARED_FILE"

# Create symlink: watch reads from phone's container
ln -sf "$PHONE_GROUP/$SHARED_FILE" "$WATCH_GROUP/$SHARED_FILE"

echo ""
echo "Symlink created:"
echo "  $WATCH_GROUP/$SHARED_FILE -> $PHONE_GROUP/$SHARED_FILE"
echo ""
echo "Done! The watch simulator can now read matches written by the phone simulator."
