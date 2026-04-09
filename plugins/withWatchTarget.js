const { withXcodeProject, withEntitlementsPlist } = require("expo/config-plugins");
const path = require("path");
const fs = require("fs");

/**
 * Expo config plugin that adds an Apple Watch (watchOS) target to the Xcode project.
 *
 * Watch source files live in /watch (outside /ios) so expo prebuild --clean doesn't delete them.
 * This plugin copies them into ios/PickleGoWatch/ and configures the Xcode project.
 */

const WATCH_APP_NAME = "PickleGoWatch";
const WATCH_BUNDLE_ID = "com.picklego.picklego.watchkitapp";
const WATCH_DEPLOYMENT_TARGET = "10.0";
const APP_GROUP_ID = "group.com.picklego.picklego";

function withWatchTarget(config) {
  // Add App Groups to iOS entitlements
  config = withEntitlementsPlist(config, (config) => {
    config.modResults["com.apple.security.application-groups"] = [APP_GROUP_ID];
    return config;
  });

  // Modify the Xcode project
  config = withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;
    const projectRoot = config.modRequest.projectRoot;
    const watchSourceDir = path.join(projectRoot, "watch");
    const watchDestDir = path.join(projectRoot, "ios", WATCH_APP_NAME);

    // Step 1: Copy watch/ source files into ios/PickleGoWatch/
    console.log(`[withWatchTarget] Copying watch source files to ${watchDestDir}...`);
    copyDirRecursive(watchSourceDir, watchDestDir);

    // Step 2: Write entitlements file
    const entitlementsPath = path.join(watchDestDir, `${WATCH_APP_NAME}.entitlements`);
    fs.writeFileSync(entitlementsPath, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.application-groups</key>
    <array>
      <string>${APP_GROUP_ID}</string>
    </array>
  </dict>
</plist>`);

    // Step 3: Write Info.plist
    const infoPlistPath = path.join(watchDestDir, "Info.plist");
    fs.writeFileSync(infoPlistPath, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>$(DEVELOPMENT_LANGUAGE)</string>
    <key>CFBundleDisplayName</key>
    <string>PickleGo</string>
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    <key>CFBundlePackageType</key>
    <string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
    <key>CFBundleShortVersionString</key>
    <string>$(MARKETING_VERSION)</string>
    <key>CFBundleVersion</key>
    <string>$(CURRENT_PROJECT_VERSION)</string>
    <key>UISupportedInterfaceOrientations</key>
    <array>
      <string>UIInterfaceOrientationPortrait</string>
    </array>
    <key>WKApplication</key>
    <true/>
    <key>WKCompanionAppBundleIdentifier</key>
    <string>com.picklego.picklego</string>
    <key>UIAppFonts</key>
    <array>
      <string>Fredoka-Regular.ttf</string>
      <string>Fredoka-Medium.ttf</string>
      <string>Fredoka-SemiBold.ttf</string>
      <string>Fredoka-Bold.ttf</string>
    </array>
  </dict>
</plist>`);

    // Also write as PickleGoWatch-Info.plist (the name xcode npm package auto-generates)
    const altInfoPlistPath = path.join(watchDestDir, `${WATCH_APP_NAME}-Info.plist`);
    fs.copyFileSync(infoPlistPath, altInfoPlistPath);

    // Step 4: Check if watch target already exists
    const existingTargets = xcodeProject.pbxNativeTargetSection();
    const watchTargetExists = Object.values(existingTargets).some(
      (target) => target.name === WATCH_APP_NAME
    );

    let watchTargetUuid;

    if (watchTargetExists) {
      console.log(`[withWatchTarget] Watch target already exists, skipping target creation`);
      // Find existing target UUID for build settings update
      for (const key in existingTargets) {
        const target = existingTargets[key];
        if (target.name === WATCH_APP_NAME) {
          watchTargetUuid = key;
          break;
        }
      }
    } else {
      // Step 5: Add watch target to Xcode project
      console.log(`[withWatchTarget] Adding watch target "${WATCH_APP_NAME}"...`);

      const watchTarget = xcodeProject.addTarget(
        WATCH_APP_NAME,
        "application",
        WATCH_APP_NAME,
        WATCH_BUNDLE_ID
      );

      if (!watchTarget) {
        console.error("[withWatchTarget] Failed to create watch target");
        return config;
      }

      watchTargetUuid = watchTarget.uuid;

      // Step 7: Add source files and resources (only for new targets)
      const watchGroupKey = xcodeProject.pbxCreateGroup(WATCH_APP_NAME, WATCH_APP_NAME);

      const swiftFiles = collectFiles(watchDestDir, ".swift");
      for (const file of swiftFiles) {
        const relativePath = path.relative(path.join(projectRoot, "ios"), file);
        xcodeProject.addSourceFile(relativePath, { target: watchTargetUuid }, watchGroupKey);
      }

      // Note: Font resources (.ttf) and Assets.xcassets are added by scripts/fix-watch-target.rb
      // to avoid duplicate resource references. Only add Assets.xcassets here for initial setup.
      xcodeProject.addFile(`${WATCH_APP_NAME}/Assets.xcassets`, watchGroupKey, {
        target: watchTargetUuid,
        lastKnownFileType: "folder.assetcatalog",
      });

      // Note: "Embed Watch Content" build phase must be added manually in Xcode.
      // The xcode npm package's addBuildPhase creates orphan references that break pod install.
      // In Xcode: select PickleGo target > Build Phases > + > Copy Files > Destination: Watch Content
      console.log(`[withWatchTarget] NOTE: Add "Embed Watch Content" build phase manually in Xcode`);
    }

    // Step 6: Always apply build settings to watch target's build configurations.
    console.log(`[withWatchTarget] Applying watch build settings...`);
    const watchBuildSettings = {
      SDKROOT: "watchos",
      WATCHOS_DEPLOYMENT_TARGET: WATCH_DEPLOYMENT_TARGET,
      TARGETED_DEVICE_FAMILY: '"4"',
      SWIFT_VERSION: "5.0",
      CODE_SIGN_ENTITLEMENTS: `"${WATCH_APP_NAME}/${WATCH_APP_NAME}.entitlements"`,
      INFOPLIST_FILE: `"${WATCH_APP_NAME}/Info.plist"`,
      PRODUCT_BUNDLE_IDENTIFIER: WATCH_BUNDLE_ID,
      MARKETING_VERSION: config.version || "1.0.0",
      CURRENT_PROJECT_VERSION: String(config.ios?.buildNumber || "1"),
      GENERATE_INFOPLIST_FILE: "NO",
      ASSETCATALOG_COMPILER_APPICON_NAME: "AppIcon",
      SUPPORTS_MACCATALYST: "NO",
      SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD: "NO",
    };

    // Iterate all build configurations and match by bundle ID
    const allBuildConfigs = xcodeProject.pbxXCBuildConfigurationSection();
    let appliedCount = 0;
    for (const key in allBuildConfigs) {
      const bc = allBuildConfigs[key];
      if (typeof bc !== "object" || !bc.buildSettings) continue;
      const bid = bc.buildSettings.PRODUCT_BUNDLE_IDENTIFIER;
      // The xcode npm package may quote the bundle ID
      const normalizedBid = typeof bid === "string" ? bid.replace(/"/g, "") : bid;
      if (normalizedBid !== WATCH_BUNDLE_ID) continue;
      for (const [k, v] of Object.entries(watchBuildSettings)) {
        bc.buildSettings[k] = v;
      }
      appliedCount++;
      console.log(`[withWatchTarget] Applied settings to config: ${bc.name}`);
    }
    console.log(`[withWatchTarget] Applied to ${appliedCount} build configurations`);

    console.log(`[withWatchTarget] Successfully configured watch target "${WATCH_APP_NAME}"`);
    return config;
  });

  return config;
}

/** Recursively copy a directory, adding DO NOT EDIT headers to .swift files */
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.name === "Tests") continue; // Tests require XCTest, not available in app target
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.name.endsWith(".swift")) {
      const relativeSrc = path.relative(path.join(src, ".."), srcPath);
      const header = `// DO NOT EDIT — generated from ${relativeSrc}\n// Edit the source file in watch/ instead.\n\n`;
      const content = fs.readFileSync(srcPath, "utf8");
      fs.writeFileSync(destPath, header + content);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/** Recursively collect files matching an extension */
function collectFiles(dir, ext) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      files.push(fullPath);
    }
  }
  return files;
}

module.exports = withWatchTarget;
