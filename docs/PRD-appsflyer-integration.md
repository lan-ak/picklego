# PRD: Complete AppsFlyer Integration

## Context

PickleGo has a partially integrated AppsFlyer SDK (`react-native-appsflyer` v6.17.8). The current integration handles deep link capture and OneLink generation for SMS invites, but lacks event tracking, user identification, iOS Universal Links, and proper Expo plugin configuration. The OneLink subdomain has not been configured in the AppsFlyer dashboard yet — that is a prerequisite before Universal/App Links can work.

This PRD covers everything needed to complete the AppsFlyer installation so PickleGo can measure attribution, track conversions, and ensure deep links work reliably on both platforms.

---

## Current State

### What's working
- SDK initialization in `src/services/appsflyer.ts` with dev key + debug mode
- `onInstallConversionData` listener for deferred deep links (install attribution)
- `onDeepLink` listener for direct deep links (app already installed)
- `generateOneLink()` for SMS invite deep links with fallback to custom scheme
- Deep link URL parsing and AsyncStorage persistence (`pendingSMSInviteId`)
- SMS invite flow end-to-end (create invite → generate link → claim on signup)
- Dev key configured in `.env` (`EXPO_PUBLIC_APPSFLYER_DEV_KEY`)

### What's missing
1. **No event tracking** — zero `logEvent()` calls anywhere in the codebase
2. **No user identification** — `setCustomerUserId()` never called
3. **No iOS Universal Links** — `associatedDomains` not configured in `app.config.ts`
4. **No Android App Links verification** — intent filters use custom scheme only
5. **Expo plugin not configured** — `react-native-appsflyer` added without config object
6. **No ATT prompt** — `expo-tracking-transparency` not installed; IDFA not collected on iOS 14.5+
7. **No revenue/conversion tracking** — can't measure install→signup→engagement funnel
8. **No uninstall tracking** — push token not sent to AppsFlyer
9. **OneLink template** — not yet configured in AppsFlyer dashboard
10. **Test device not registered** — debug data won't appear in dashboard

---

## Implementation Plan

### 1. AppsFlyer Dashboard Configuration (Do First)

These are **prerequisites** before the code changes will work.

#### 1a. Register Test Device(s) (FIRST STEP)
- In AppsFlyer dashboard → Settings → Test Devices
- Add your iOS device IDFA or Android GAID
- This allows real-time debug data to appear in the dashboard during development
- Without this, test installs won't show in real-time logs

#### 1b. OneLink Template Setup (BLOCKING)
- Create OneLink template in AppsFlyer dashboard
- Set subdomain (e.g., `picklego.onelink.me`) — update `associatedDomains` and intent filters in code to match the actual subdomain assigned
- Configure deep link path: `/invite/{inviteId}`
- Set iOS fallback to App Store (app ID: `6743630735`)
- Set Android fallback to Play Store (package: `com.picklego.picklego`)

#### 1c. App Settings
- Verify iOS App ID: `6743630735`
- Verify Android package: `com.picklego.picklego`
- Set iOS bundle ID: `com.picklego.picklego`
- Confirm dev key matches `.env` value (`EXPO_PUBLIC_APPSFLYER_DEV_KEY` is already set)

#### 1d. iOS Universal Links
- AppsFlyer auto-generates `apple-app-site-association` for their OneLink domains
- Verify `associatedDomains` in `app.config.ts` matches the OneLink subdomain
- Requires an EAS build (not Expo Go) to test

#### 1e. Android App Links
- Upload SHA-256 signing certificate fingerprint to AppsFlyer dashboard
- Get fingerprint from EAS: `eas credentials` → Android → Keystore
- AppsFlyer auto-generates `assetlinks.json` for their domains

#### 1f. In-App Events
- Register custom event names in AppsFlyer dashboard for reporting
- Mark key events as "conversion events" (e.g., `af_complete_registration`, `af_purchase`)
- Set up postbacks to ad networks if running paid campaigns

#### 1g. Enable Uninstall Measurement
- In AppsFlyer dashboard → App Settings → Uninstall Measurement
- For iOS: upload APNs certificate or configure APNs auth key
- For Android: add Firebase Server Key

---

### 2. Configure Expo Plugin with AppsFlyer Settings

**File:** `app.config.ts`

Update the `react-native-appsflyer` plugin entry from bare string to configured array:

```typescript
[
  "react-native-appsflyer",
  {
    devKey: process.env.EXPO_PUBLIC_APPSFLYER_DEV_KEY,
    appId: "6743630735", // iOS App Store ID
    timeToWaitForATTUserAuthorization: 10,
  },
],
```

Add iOS `associatedDomains` for Universal Links:
```typescript
ios: {
  ...existing,
  associatedDomains: [
    "applinks:picklego.onelink.me",  // AppsFlyer OneLink domain — update to match actual subdomain
  ],
},
```

Add Android intent filters for App Links:
```typescript
android: {
  ...existing,
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
```

Add ATT usage description to `infoPlist`:
```typescript
NSUserTrackingUsageDescription: "This allows PickleGo to provide personalized recommendations and measure the effectiveness of our campaigns.",
```

---

### 3. Add ATT (App Tracking Transparency) Prompt for iOS

**New dependency:** `expo-tracking-transparency`
- Install via `npx expo install expo-tracking-transparency`
- Add to `app.config.ts` plugins array
- **Requires EAS build** (`eas build`) — this is a native module that gets baked into the binary at build time, not installed after
- Cannot be tested in Expo Go — only works on physical iOS devices via dev/production builds
- Same pattern as existing native plugins (`expo-contacts`, `expo-notifications`, etc.)

**File:** `App.tsx`

Before `initAppsFlyer()`, request ATT permission on iOS:

```typescript
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';

// In app initialization
if (Platform.OS === 'ios') {
  const { status } = await requestTrackingPermissionsAsync();
  // AppsFlyer SDK respects the ATT status automatically
}
initAppsFlyer();
```

---

### 4. Set Customer User ID After Authentication

**File:** `src/services/appsflyer.ts`

Add a function to identify the user to AppsFlyer after login/signup:

```typescript
export function setAppsFlyerUserId(userId: string) {
  appsflyer.setCustomerUserId(userId);
}
```

**File:** `src/context/DataContext.tsx`

Call `setAppsFlyerUserId(user.uid)` in the `onAuthStateChanged` handler when a user is authenticated.

---

### 5. Add Conversion Event Tracking

**File:** `src/services/appsflyer.ts`

Add a `logAppsFlyerEvent` wrapper function:

```typescript
export function logAppsFlyerEvent(eventName: string, eventValues: Record<string, string> = {}) {
  appsflyer.logEvent(eventName, eventValues);
}
```

**Events to track (with locations):**

| Event | AppsFlyer Event Name | Where to Call | File |
|-------|---------------------|---------------|------|
| Sign up complete | `af_complete_registration` | After `addPlayer()` or `completeSocialSignUp()` | `src/context/DataContext.tsx` |
| Phone number added | `phone_number_added` | After phone saved in onboarding | `src/screens/onboarding/PhoneNumberScreen.tsx` |
| SMS invite sent | `af_invite` | After `createSMSInvite` succeeds | `src/context/DataContext.tsx` |
| SMS invite claimed | `invite_claimed` | After `claimSMSInvite` succeeds | `src/context/DataContext.tsx` |
| Onboarding complete | `onboarding_complete` | In `completeOnboarding()` | `src/context/DataContext.tsx` |
| Match created | `af_add_to_cart` | After match document created | `src/context/DataContext.tsx` |
| Match complete | `match_complete` | After match results are saved/finalized | `src/context/DataContext.tsx` |
| Player connection made | `player_connected` | After `acceptPlayerInvite` or invite claimed | `src/context/DataContext.tsx` |

---

### 6. Forward Push Token for Uninstall Tracking

**File:** `src/services/appsflyer.ts`

Add push token forwarding function:

```typescript
export function updateAppsFlyerPushToken(token: string) {
  appsflyer.updateServerUninstallToken(token);
}
```

**File:** `src/services/pushNotifications.ts`

The push token is already obtained via `getDevicePushToken()` using `Notifications.getExpoPushTokenAsync()`. After obtaining the token, forward it to AppsFlyer:

```typescript
import { updateAppsFlyerPushToken } from './appsflyer';

// Inside registerPushToken() after getDevicePushToken() returns
updateAppsFlyerPushToken(token);
```

---

### 7. Superwall ↔ AppsFlyer Revenue Attribution (Optional)

Superwall is fully integrated with 13 placements and tracks paywall conversions. To attribute revenue back to acquisition channels in AppsFlyer:

- Use Superwall's server-side integration or delegate callbacks to fire `af_purchase` events via `logAppsFlyerEvent()` when a subscription is completed
- Event values should include `af_revenue`, `af_currency`, and `af_content_id`
- This enables AppsFlyer to calculate ROI per acquisition channel

---

## Files to Modify

| File | Changes |
|------|---------|
| `app.config.ts` | Add AppsFlyer plugin config, `associatedDomains`, intent filters, ATT usage description |
| `src/services/appsflyer.ts` | Add `setAppsFlyerUserId()`, `logAppsFlyerEvent()`, `updateAppsFlyerPushToken()` |
| `src/context/DataContext.tsx` | Call `setAppsFlyerUserId()` on auth, add event tracking calls at key conversion points |
| `App.tsx` | Add ATT prompt before `initAppsFlyer()` |
| `src/services/pushNotifications.ts` | Forward push token to AppsFlyer via `updateAppsFlyerPushToken()` |
| `src/screens/onboarding/PhoneNumberScreen.tsx` | Track `phone_number_added` event |
| `package.json` | Add `expo-tracking-transparency` |

---

## Implementation Order

1. **Dashboard first** — Register test device, create OneLink template, configure app settings
2. **ATT + plugin config** — `app.config.ts` changes, install `expo-tracking-transparency`, ATT prompt in `App.tsx`
3. **User identification** — `setCustomerUserId()` in appsflyer.ts, call from DataContext
4. **Event tracking** — Add `logAppsFlyerEvent()` wrapper, instrument 7 conversion events
5. **Universal/App Links** — Add `associatedDomains` and intent filters (requires OneLink subdomain from step 1)
6. **Uninstall tracking** — Forward push token in `pushNotifications.ts`
7. **Revenue attribution** — Superwall → AppsFlyer purchase events (optional, can defer)

---

## Verification Plan

### Dashboard Setup Verification
1. **Test device**: Register device in AppsFlyer → verify it appears in test devices list
2. **OneLink template**: Create template → copy subdomain for code configuration

### Code Integration Verification (requires EAS dev build — not Expo Go)
3. **SDK Initialization**: Run dev build → check AppsFlyer debug logs show successful init with dev key
4. **ATT Prompt**: Run on iOS device → verify tracking permission dialog appears before SDK init
5. **User ID**: Sign up → verify `setCustomerUserId` appears in AppsFlyer debug logs
6. **Event Tracking**: Complete signup → check AppsFlyer debug logs for `af_complete_registration` event; create match → check for `af_add_to_cart`
7. **Push Token**: Register for push → verify `updateServerUninstallToken` in debug logs

### Deep Link Verification
8. **Direct Deep Link**: Generate OneLink → tap on device with app installed → verify app opens and `pendingSMSInviteId` set in AsyncStorage
9. **Deferred Deep Link**: Generate OneLink → tap on device without app → install from TestFlight/internal track → verify invite ID captured on first launch
10. **Universal Links (iOS)**: Tap `https://{subdomain}.onelink.me/...` → verify opens app directly (no Safari bounce)
11. **App Links (Android)**: Tap OneLink → verify opens app directly (no disambiguation dialog)

### End-to-End Verification
12. **Dashboard data**: Check AppsFlyer dashboard → verify test install appears with attribution data, events visible in real-time logs
13. **Full invite flow**: Send SMS invite → recipient installs via link → signs up → verify connection created AND attribution tracked in dashboard
