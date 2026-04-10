#!/bin/bash
# Build iOS + watchOS archive and open in Xcode for upload to TestFlight.
#
# Usage: ./scripts/release.sh
#
# This archives both the iOS app and watchOS companion, then opens
# Xcode Organizer where you click "Distribute App" → "App Store Connect" → "Upload".
#
# Prerequisites:
#   - Xcode with Apple Developer account signed in
#   - Distribution certificate (Apple Distribution) in keychain
#   - xcodeproj gem: gem install xcodeproj

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_DIR/build"
ARCHIVE_PATH="$BUILD_DIR/PickleGo.xcarchive"
TEAM_ID="2Q87Z7RM4V"

cd "$PROJECT_DIR"

echo "================================"
echo "  PickleGo — Release Build"
echo "================================"
echo ""

# Step 1: Prebuild
echo "[1/4] Running expo prebuild..."
npx expo prebuild --platform ios --clean
echo ""

# Step 2: Fix watch target
echo "[2/4] Fixing watch target references..."
ruby scripts/fix-watch-target.rb
echo ""

# Step 3: Archive
echo "[3/4] Archiving (iOS + watchOS)..."
rm -rf "$ARCHIVE_PATH"
xcodebuild archive \
  -workspace ios/PickleGo.xcworkspace \
  -scheme PickleGo \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_STYLE="Automatic" \
  | tail -5

if [ ! -d "$ARCHIVE_PATH" ]; then
  echo "error: Archive failed"
  exit 1
fi

# Verify watch app is embedded
WATCH_APP="$ARCHIVE_PATH/Products/Applications/PickleGo.app/Watch/PickleGoWatch.app"
if [ -d "$WATCH_APP" ] && [ -f "$WATCH_APP/Info.plist" ]; then
  echo "✓ Watch app embedded with Info.plist"
else
  echo "⚠ Warning: Watch app may not be properly embedded"
fi

# Step 4: Open in Xcode Organizer
echo ""
echo "[4/4] Opening Xcode Organizer..."
open "$ARCHIVE_PATH"

echo ""
echo "================================"
echo "  Archive complete!"
echo ""
echo "  In Xcode Organizer:"
echo "  1. Select the PickleGo archive"
echo "  2. Click 'Distribute App'"
echo "  3. Select 'App Store Connect'"
echo "  4. Click 'Upload'"
echo "================================"
