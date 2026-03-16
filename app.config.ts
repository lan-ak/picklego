import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "PickleGo",
  slug: "PickleGo",
  version: "1.0.0",
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
    supportsTablet: true,
    bundleIdentifier: "com.picklego.picklego",
    googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST ?? "./GoogleService-Info.plist",
    usesAppleSignIn: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocationWhenInUseUsageDescription:
        "PickleGo needs your location to show nearby pickleball courts and set match locations.",
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
    "react-native-appsflyer",
    ...(process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME
      ? [[
          "@react-native-google-signin/google-signin",
          { iosUrlScheme: process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME },
        ]]
      : [["@react-native-google-signin/google-signin"]]),
  ],
  extra: {
    eas: {
      projectId: "5ab7653e-2d17-4fb1-9f19-ad2c2c5bc710",
    },
  },
  owner: "lanre-25",
});
