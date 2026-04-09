#!/bin/bash
# Link the App Group container between paired iPhone and Watch simulators
# so they share the scheduled_matches.json file.
#
# Usage: ./scripts/link-sim-appgroup.sh
#
# This is only needed for simulator testing — on real devices, App Groups
# are shared automatically between the phone and watch apps.

set -euo pipefail

PHONE_BUNDLE="com.picklego.picklego"
WATCH_BUNDLE="com.picklego.picklego.watchkitapp"
APP_GROUP="group.com.picklego.picklego"
SHARED_FILE="scheduled_matches.json"

# Find the booted watch simulator
WATCH_UDID=$(xcrun simctl list devices watch | grep "Booted" | head -1 | sed -E 's/.*\(([A-F0-9-]+)\).*/\1/')
if [ -z "$WATCH_UDID" ]; then
  echo "Error: No booted watch simulator found"
  exit 1
fi

# Find the paired phone simulator
PHONE_UDID=$(xcrun simctl list pairs | grep -A3 "$WATCH_UDID" | grep "Phone:" | sed -E 's/.*\(([A-F0-9-]+)\).*/\1/')
if [ -z "$PHONE_UDID" ]; then
  echo "Error: No paired phone simulator found for watch $WATCH_UDID"
  exit 1
fi

echo "Phone simulator: $PHONE_UDID"
echo "Watch simulator: $WATCH_UDID"

# Get App Group container paths
PHONE_GROUP=$(xcrun simctl get_app_container "$PHONE_UDID" "$PHONE_BUNDLE" groups 2>/dev/null | grep "$APP_GROUP" | awk '{print $2}')
WATCH_GROUP=$(xcrun simctl get_app_container "$WATCH_UDID" "$WATCH_BUNDLE" groups 2>/dev/null | grep "$APP_GROUP" | awk '{print $2}')

if [ -z "$PHONE_GROUP" ]; then
  echo "Error: Phone app not installed or App Group not found"
  echo "Install the phone app first: xcrun simctl install $PHONE_UDID <path-to-app>"
  exit 1
fi

if [ -z "$WATCH_GROUP" ]; then
  echo "Error: Watch app not installed or App Group not found"
  echo "Install the watch app first: xcrun simctl install $WATCH_UDID <path-to-app>"
  exit 1
fi

echo "Phone App Group: $PHONE_GROUP"
echo "Watch App Group: $WATCH_GROUP"

# Create symlink from phone's shared file to watch's container
ln -sf "$PHONE_GROUP/$SHARED_FILE" "$WATCH_GROUP/$SHARED_FILE"
echo "Symlinked $SHARED_FILE from phone -> watch"

# Verify
if [ -L "$WATCH_GROUP/$SHARED_FILE" ]; then
  echo "Done! Watch simulator will now read matches from phone's App Group container."
  echo "Restart the watch app to pick up changes."
else
  echo "Error: Symlink creation failed"
  exit 1
fi
