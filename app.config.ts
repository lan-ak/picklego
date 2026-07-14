import { ExpoConfig, ConfigContext } from "expo/config";
import buildNumberJson from "./build-number.json";

const BUILD_NUMBER = String(buildNumberJson.buildNumber);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "PickleGo",
  slug: "PickleGo",
  version: "1.0.4",
  scheme: "picklego",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#55A04D",
  },
  ios: {
    supportsTablet: false,
    buildNumber: BUILD_NUMBER,
    bundleIdentifier: "com.picklego.picklego",
    googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST ?? "./GoogleService-Info.plist",
    usesAppleSignIn: true,
    associatedDomains: [
      "applinks:picklego.onelink.me",
    ],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        "PickleGo needs your location to show nearby pickleball courts and set match locations.",
      NSLocationAlwaysUsageDescription:
        "PickleGo uses your location to find nearby pickleball courts and set match locations.",
      NSPhotoLibraryUsageDescription:
        "PickleGo uses your photo library to let you choose a profile picture. For example, you can select an existing photo to represent yourself to other players.",
      // NSUserTrackingUsageDescription is owned by the expo-tracking-transparency
      // plugin. Setting it here too would make the winner order-dependent.
      SKAdNetworkItems: [
        { SKAdNetworkIdentifier: "v9wttpbfk9.skadnetwork" }, // Meta / Facebook
        { SKAdNetworkIdentifier: "n38lu8286q.skadnetwork" }, // Meta / Instagram
      ],
    },
    // Merged into the prebuild-generated ios/PickleGo/PrivacyInfo.xcprivacy, which
    // otherwise declares NSPrivacyTracking:false — a false statement once the Meta
    // SDK ships, and one Apple's automated check rejects.
    // NSPrivacyTrackingDomains is deliberately omitted: iOS blocks listed domains
    // outright when ATT is denied, and graph.facebook.com carries the SDK's
    // non-tracking traffic too.
    privacyManifests: {
      NSPrivacyTracking: true,
      NSPrivacyCollectedDataTypes: [
        "NSPrivacyCollectedDataTypeDeviceID",
        "NSPrivacyCollectedDataTypeUserID",
        "NSPrivacyCollectedDataTypeProductInteraction",
        "NSPrivacyCollectedDataTypeEmailAddress",
        "NSPrivacyCollectedDataTypePhoneNumber",
      ].map((NSPrivacyCollectedDataType) => ({
        NSPrivacyCollectedDataType,
        NSPrivacyCollectedDataTypeLinked: true,
        NSPrivacyCollectedDataTypeTracking: true,
        NSPrivacyCollectedDataTypePurposes: [
          "NSPrivacyCollectedDataTypePurposeThirdPartyAdvertising",
          "NSPrivacyCollectedDataTypePurposeAnalytics",
        ],
      })),
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#4A8B3F",
    },
    package: "com.picklego.picklego",
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? "",
      },
    },
    permissions: ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "picklego.onelink.me", pathPrefix: "/" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    [
      "expo-build-properties",
      {
        ios: {
          deploymentTarget: "16.0",
        },
        android: {},
      },
    ],
    "expo-font",
    [
      "expo-image-picker",
      {
        photosPermission:
          "PickleGo uses your photo library to let you choose a profile picture. For example, you can select an existing photo to represent yourself to other players.",
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "Allow PickleGo to use your location to find nearby pickleball courts.",
        locationWhenInUsePermission:
          "Allow PickleGo to use your location to find nearby pickleball courts.",
      },
    ],
    [
      "expo-notifications",
      {
        color: "#4CAF50",
        mode: "production",
      },
    ],
    "expo-apple-authentication",
    [
      "expo-contacts",
      {
        contactsPermission:
          "Allow PickleGo to access your contacts to invite friends to play pickleball.",
      },
    ],
    [
      "react-native-appsflyer",
      {
        devKey: process.env.EXPO_PUBLIC_APPSFLYER_DEV_KEY,
        appId: "6743630735",
        // Hold the install postback until ATT resolves, so it can carry the IDFA.
        timeToWaitForATTUserAuthorization: 60,
      },
    ],
    [
      "expo-tracking-transparency",
      {
        userTrackingPermission:
          "This allows PickleGo to provide personalized recommendations and measure the effectiveness of our campaigns.",
      },
    ],
    // Env-gated so a missing .env never breaks prebuild (same shape as google-signin below).
    ...(process.env.EXPO_PUBLIC_META_APP_ID && process.env.EXPO_PUBLIC_META_CLIENT_TOKEN
      ? [
          [
            "react-native-fbsdk-next",
            {
              appID: process.env.EXPO_PUBLIC_META_APP_ID,
              clientToken: process.env.EXPO_PUBLIC_META_CLIENT_TOKEN,
              displayName: "PickleGo",
              scheme: `fb${process.env.EXPO_PUBLIC_META_APP_ID}`,
              advertiserIDCollectionEnabled: true,
              // Gives us fb_mobile_activate_app + install for free.
              autoLogAppEventsEnabled: true,
              // We initialize in src/services/meta.ts instead, after ATT resolves, so
              // the first activate-app event carries the right tracking flag.
              isAutoInitEnabled: false,
              // expo-tracking-transparency owns NSUserTrackingUsageDescription.
              iosUserTrackingPermission: false,
            },
          ] as [string, any],
        ]
      : []),
    "./plugins/withWatchTarget",
    ...(process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME
      ? [
          [
            "@react-native-google-signin/google-signin",
            { iosUrlScheme: process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME },
          ] as [string, any],
        ]
      : ["@react-native-google-signin/google-signin"]),
  ],
  updates: {
    url: "https://u.expo.dev/5ab7653e-2d17-4fb1-9f19-ad2c2c5bc710",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  extra: {
    eas: {
      projectId: "5ab7653e-2d17-4fb1-9f19-ad2c2c5bc710",
    },
  },
  owner: "lanre-25",
});
