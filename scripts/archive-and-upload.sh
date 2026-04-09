#!/bin/bash
# Build iOS + watchOS and upload to App Store Connect / TestFlight.
# Usage: ./scripts/archive-and-upload.sh
#
# Prerequisites:
#   - Xcode with signing configured (automatic signing recommended)
#   - Apple Developer account signed in to Xcode
#   - xcodeproj gem: gem install xcodeproj

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$PROJECT_DIR/build"
ARCHIVE_PATH="$BUILD_DIR/PickleGo.xcarchive"
EXPORT_PATH="$BUILD_DIR/export"
EXPORT_OPTIONS="$SCRIPT_DIR/ExportOptions.plist"

cd "$PROJECT_DIR"

echo "============================================"
echo "  PickleGo — Archive & Upload to TestFlight"
echo "============================================"
echo ""

# Step 1: Prebuild
echo "[1/5] Running expo prebuild..."
npx expo prebuild --platform ios --clean

# Step 2: Fix watch target
echo ""
echo "[2/5] Fixing watch target references..."
ruby scripts/fix-watch-target.rb

# Step 3: Archive
echo ""
echo "[3/5] Archiving (iOS + watchOS)..."
TEAM_ID="2Q87Z7RM4V"
rm -rf "$ARCHIVE_PATH"
xcodebuild archive \
  -workspace ios/PickleGo.xcworkspace \
  -scheme PickleGo \
  -configuration Release \
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
if [ -d "$ARCHIVE_PATH/Products/Applications/PickleGo.app/Watch/PickleGoWatch.app" ]; then
  echo "Watch app embedded successfully"
else
  echo "warning: PickleGoWatch.app not found in archive"
fi

# Step 4: Export
echo ""
echo "[4/5] Exporting for App Store..."
rm -rf "$EXPORT_PATH"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates \
  | tail -5

if [ ! -f "$EXPORT_PATH/PickleGo.ipa" ]; then
  echo "error: Export failed — no IPA produced"
  exit 1
fi

# Step 5: Upload
echo ""
echo "[5/5] Uploading to App Store Connect..."
xcrun altool --upload-app \
  --type ios \
  --file "$EXPORT_PATH/PickleGo.ipa" \
  --apiKey "" \
  --apiIssuer "" \
  2>&1 || {
  # altool with API key may not be configured — fall back to Transporter prompt
  echo ""
  echo "Auto-upload requires App Store Connect API key."
  echo "To upload manually, open Transporter.app and drag in:"
  echo "  $EXPORT_PATH/PickleGo.ipa"
  echo ""
  echo "Or use: xcrun altool --upload-app --type ios --file $EXPORT_PATH/PickleGo.ipa -u YOUR_APPLE_ID -p APP_SPECIFIC_PASSWORD"
}

echo ""
echo "Done! Archive: $ARCHIVE_PATH"
echo "       IPA:     $EXPORT_PATH/PickleGo.ipa"
