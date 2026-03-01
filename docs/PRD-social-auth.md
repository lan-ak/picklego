# PRD: Apple & Google Authentication for PickleGo

**Document Version:** 1.0
**Date:** March 1, 2026
**Status:** Draft

---

## 1. Overview

Add "Sign in with Apple" and "Sign in with Google" as authentication options alongside the existing email/password flow. This gives users faster onboarding with fewer form fields and leverages trusted identity providers.

## 2. Goals

- Reduce sign-up friction — one tap instead of filling out name, email, password, and confirm password
- Increase conversion rate on the Auth screen
- Meet App Store requirement (apps offering third-party sign-in must also offer Sign in with Apple)
- Keep existing email/password auth fully functional

## 3. Non-Goals

- Removing or deprecating email/password auth
- Adding other social providers (Facebook, Twitter, etc.)
- Implementing account linking UI for merging duplicate accounts (handled silently when possible)

---

## 4. Current State

| Component | Details |
|---|---|
| **Auth Provider** | Firebase Auth (email/password) |
| **Auth Screen** | `src/screens/AuthScreen.tsx` — Sign Up / Login tabs with form validation |
| **Firebase Config** | `src/config/firebase.ts` — email auth functions, `onAuthStateChanged` listener |
| **Data Context** | `src/context/DataContext.tsx` — `signIn()`, `addPlayer()`, auth state sync |
| **User Model** | `Player` type in `src/types/index.ts` — `id`, `name`, `email`, `rating`, `stats`, etc. |
| **Firestore Rules** | `firestore.rules` — UID-based read/write on `/players/{playerId}` |
| **App Config** | `app.config.ts` — Expo SDK 54, `@react-native-firebase/app` + `@react-native-firebase/auth` |
| **Bundle ID** | `com.akinyemi.picklego` (iOS & Android) |

---

## 5. User Experience

### 5.1 Auth Screen Changes

The Auth screen will add two social sign-in buttons **above** the existing form, separated by an "or" divider.

```
┌──────────────────────────────┐
│       🏓 PicklePete          │
│      Welcome to PickleGo     │
│                              │
│  ┌──────────────────────┐    │
│  │  Sign in with Apple  │    │
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │  Sign in with Google │    │
│  └──────────────────────┘    │
│                              │
│  ──────── or ────────        │
│                              │
│  [ Sign Up ]  [ Login ]      │
│  ┌──────────────────────┐    │
│  │ Email                │    │
│  ├──────────────────────┤    │
│  │ Password             │    │
│  └──────────────────────┘    │
│  [ Continue ]                │
└──────────────────────────────┘
```

### 5.2 Sign-in Flow (Both Providers)

1. User taps "Sign in with Apple" or "Sign in with Google"
2. Native OS prompt appears (Apple sheet / Google account picker)
3. User authenticates with their provider
4. App receives credential → exchanges it for a Firebase Auth token
5. App checks Firestore for an existing `/players/{uid}` document
   - **Existing user:** Load player data → navigate to MainTabs
   - **New user:** Create a `Player` document with name/email from the provider → navigate to MainTabs
6. If the provider doesn't return a display name (Apple allows hiding it), prompt the user to enter one on first login

### 5.3 Account Linking

- If a user already has an email/password account and signs in with a social provider using the same email, Firebase will link the accounts automatically (when configured to use a single account per email)
- If a social sign-in collides with an existing email, show an informative error and suggest signing in with the original method

### 5.4 Sign Out

No changes needed — existing `signOut()` via Firebase Auth already handles all provider types.

---

## 6. Technical Design

### 6.1 New Dependencies

| Package | Purpose |
|---|---|
| `@react-native-google-signin/google-signin` | Native Google Sign-In SDK for iOS/Android |
| `expo-apple-authentication` | Expo module for Apple Sign-In (iOS native) |
| `expo-crypto` | Generate nonce for Apple auth (required for Firebase) |

### 6.2 Firebase Console Setup

#### Google Sign-In
1. Enable **Google** provider in Firebase Console → Authentication → Sign-in method
2. Download updated `GoogleService-Info.plist` (iOS) and `google-services.json` (Android)
3. Note the **Web Client ID** from Firebase Console (needed for `@react-native-google-signin`)

#### Apple Sign-In
1. Enable **Apple** provider in Firebase Console → Authentication → Sign-in method
2. In Apple Developer Console:
   - Enable "Sign in with Apple" capability for App ID `com.akinyemi.picklego`
   - Create a Services ID (for Firebase server-side verification)
   - Register a private key for Sign in with Apple
3. Add the Service ID and key to Firebase Console's Apple provider config

### 6.3 App Configuration Changes

**`app.config.ts`** — Add plugins and entitlements:

```typescript
plugins: [
  // ... existing plugins
  "@react-native-google-signin/google-signin",
  [
    "expo-apple-authentication",
    // iOS entitlement is auto-configured
  ],
  "expo-crypto",
]

ios: {
  // ... existing config
  entitlements: {
    "com.apple.developer.applesignin": ["Default"],
  },
}
```

### 6.4 New Auth Functions

Add to `src/config/firebase.ts`:

```typescript
// Google Sign-In
signInWithGoogle(): Promise<FirebaseAuthTypes.UserCredential>
  1. Configure GoogleSignin with webClientId
  2. Call GoogleSignin.signIn()
  3. Create GoogleAuthProvider.credential(idToken)
  4. Call auth().signInWithCredential(credential)

// Apple Sign-In
signInWithApple(): Promise<FirebaseAuthTypes.UserCredential>
  1. Generate random nonce via expo-crypto
  2. Call AppleAuthentication.signInAsync() with nonce
  3. Create AppleAuthProvider.credential(identityToken, nonce)
  4. Call auth().signInWithCredential(credential)
```

### 6.5 Data Context Changes

Update `src/context/DataContext.tsx`:

- Add `signInWithGoogle()` and `signInWithApple()` to the context provider
- Both call the corresponding firebase function, then:
  - Check if `/players/{uid}` exists in Firestore
  - If not, create a new `Player` document using provider profile data (name, email, photo URL)
  - Handle the `pendingClaim` / placeholder profile merging (existing invited user logic)
- Expose `isAppleAuthAvailable` boolean (Apple Sign-In is only available on iOS 13+)

### 6.6 Auth Screen Changes

Update `src/screens/AuthScreen.tsx`:

- Add Apple and Google sign-in buttons at the top of the screen
- Apple button: only render on iOS (use `AppleAuthentication.isAvailableAsync()`)
- Google button: render on both platforms
- Add "or" divider between social buttons and email form
- Handle loading states per button (prevent double-taps)
- Handle errors (user cancelled, network failure, account collision)

### 6.7 Player Creation for Social Auth

When creating a `Player` from a social sign-in:

```typescript
{
  id: firebaseUser.uid,
  name: firebaseUser.displayName ?? "",   // May be empty for Apple
  email: firebaseUser.email ?? "",
  profilePic: firebaseUser.photoURL ?? undefined,
  rating: undefined,
  stats: { totalMatches: 0, wins: 0, losses: 0, winPercentage: 0 },
  createdAt: Date.now(),
  updatedAt: Date.now(),
}
```

If `name` is empty (Apple privacy), navigate to a one-time "Enter your name" prompt before proceeding.

### 6.8 Firestore Rules

No changes required — existing rules use `request.auth.uid` which works identically for all Firebase Auth providers.

---

## 7. Platform Considerations

| | iOS | Android |
|---|---|---|
| **Apple Sign-In** | Native (required by App Store if other social auth offered) | Not supported — hide button |
| **Google Sign-In** | Via `@react-native-google-signin` | Via `@react-native-google-signin` |
| **Button Styling** | Apple: use official `AppleAuthentication.AppleAuthenticationButton` | N/A |
| | Google: custom button matching PickleGo theme | Google: custom button matching PickleGo theme |

---

## 8. Edge Cases & Error Handling

| Scenario | Handling |
|---|---|
| User cancels the sign-in prompt | Silently return to auth screen (no error message) |
| Network failure during sign-in | Show toast: "Network error. Please try again." |
| Email already exists with different provider | Show alert: "An account with this email already exists. Please sign in with [original method]." |
| Apple hides email (private relay) | Use the relay email — Firebase handles it transparently |
| Apple hides name | Prompt user for display name after first sign-in |
| Google Play Services unavailable (Android) | Show toast: "Google Play Services required." Hide Google button if unavailable |
| Placeholder profile exists for same email | Run existing `claimPlaceholderProfile()` logic to merge stats |
| Token expiration | Firebase SDK handles refresh automatically |

---

## 9. Testing Plan

### Manual Testing
- [ ] Apple Sign-In on physical iOS device (simulators don't support Apple Sign-In)
- [ ] Google Sign-In on iOS device and Android emulator/device
- [ ] New user flow — verify Player document created in Firestore
- [ ] Existing user flow — verify no duplicate Player documents
- [ ] Cancel flow — verify graceful return to auth screen
- [ ] Account collision — verify error message
- [ ] Apple hidden email — verify relay email works
- [ ] Apple hidden name — verify name prompt appears
- [ ] Placeholder claim — invite a user by email, then sign in with that email via social auth
- [ ] Sign out and re-sign in with social provider
- [ ] Offline/poor connectivity behavior

### Automated Testing
- Unit tests for `signInWithGoogle()` and `signInWithApple()` (mock native modules)
- Unit test for Player document creation from social provider profile
- Unit test for name-prompt logic (empty displayName)

---

## 10. Implementation Phases

### Phase 1: Infrastructure (Firebase + dependencies)
1. Enable Google and Apple providers in Firebase Console
2. Configure Apple Developer entitlements
3. Install `@react-native-google-signin/google-signin`, `expo-apple-authentication`, `expo-crypto`
4. Update `app.config.ts` with new plugins and entitlements
5. Rebuild native apps (`npx expo prebuild --clean`)

### Phase 2: Auth Logic
1. Add `signInWithGoogle()` to `src/config/firebase.ts`
2. Add `signInWithApple()` to `src/config/firebase.ts`
3. Add social sign-in methods to `DataContext` with Player creation logic
4. Handle account linking / collision detection
5. Add name-prompt flow for Apple users with hidden names

### Phase 3: UI
1. Add social sign-in buttons to `AuthScreen.tsx`
2. Add "or" divider component
3. Implement platform-conditional rendering (Apple button iOS-only)
4. Add loading and error states per button
5. Build "Enter your name" prompt screen/modal

### Phase 4: Testing & Polish
1. Test on physical iOS device (Apple Sign-In)
2. Test on Android device/emulator (Google Sign-In)
3. Test edge cases (cancellation, collisions, placeholder claims)
4. Verify EAS builds work with new native dependencies

---

## 11. Success Metrics

- **Adoption:** >40% of new sign-ups use social auth within first month
- **Conversion:** Sign-up completion rate increases (fewer drop-offs on the form)
- **Errors:** Social auth error rate < 2%

---

## 12. Files to Modify

| File | Changes |
|---|---|
| `package.json` | Add new dependencies |
| `app.config.ts` | Add plugins, iOS entitlements |
| `src/config/firebase.ts` | Add `signInWithGoogle()`, `signInWithApple()` |
| `src/context/DataContext.tsx` | Add social sign-in context methods, Player creation |
| `src/screens/AuthScreen.tsx` | Add social buttons, divider, platform checks |
| `src/types/index.ts` | Add `authProvider?: 'email' \| 'google' \| 'apple'` to Player type |
| `firestore.rules` | No changes needed |

## 13. Open Questions

1. Should we track which auth provider a user signed up with (add `authProvider` field to Player)?
2. Should Google Sign-In be styled with Google's brand guidelines or match PickleGo's theme?
3. Do we want to support "Link account" in Settings (e.g., add Google to an existing email account)?
