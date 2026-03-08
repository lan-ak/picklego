# PRD: Superwall Integration for PickleGo

**Author:** Engineering
**Date:** 2026-03-08
**Status:** Draft
**Version:** 1.1

---

## 1. Overview

PickleGo has no monetization layer. This PRD defines the integration of Superwall via the official **Expo SDK** (`expo-superwall`) into the app. The design prioritizes **maximum optionality**: every monetizable surface is instrumented with named placements, but the Superwall dashboard controls which placements trigger paywalls, what the paywalls look like, and which user segments see them. Rich user attributes are synced to Superwall to power audience filters, enabling precise targeting without app updates.

---

## 2. Problem Statement

- **No revenue path.** PickleGo is completely free with no mechanism to monetize engaged users.
- **No experimentation infrastructure.** There's no way to A/B test pricing, trial offers, or feature gates without code changes and app store review cycles.
- **No user segmentation for monetization.** No system tracks user engagement signals (match count, stats usage, account age) to target conversion opportunities.
- **No subscription management.** No StoreKit integration, receipt validation, or entitlement system exists.

---

## 3. Goals

| Goal | Metric |
|------|--------|
| Ship monetization infrastructure | Superwall Expo SDK integrated, all placements firing, verified in dashboard |
| Maximum remote control | 100% of paywall decisions made from dashboard, zero code changes needed to adjust gating |
| Rich audience targeting | All user attributes synced and available as audience filters in dashboard |
| Preserve free user experience | Free users encounter no degradation until paywalls are intentionally activated |
| Enable rapid experimentation | Time from "idea for new paywall placement" to "live A/B test" < 1 hour |
| Subscription conversion (post-launch) | Track and optimize via Superwall analytics |

---

## 4. Non-Goals

- Designing paywall UI templates (handled entirely in Superwall's no-code dashboard editor).
- Choosing a specific pricing model or price points (decided post-launch via experimentation).
- Android support (iOS first; Android added later with a separate API key).
- Visual "Pro" badges or lock icons on free features (paywalls appear only on access attempt).
- In-app settings for managing subscriptions (Apple handles via Settings > Subscriptions).
- Marketing push notifications for upselling.
- RevenueCat or Expo IAP integration (Superwall handles purchases directly via StoreKit).

---

## 5. User Stories

### Paywall Encounter

**5.1 Feature Gate**
> As a free user, when I try to access a gated feature, I see a paywall presented by Superwall. If I subscribe, I'm immediately granted access and the action continues. If I dismiss, I'm returned to where I was with no disruption.

**5.2 Lifecycle Prompt**
> As a user who just completed onboarding (or hit a usage milestone), I may see a contextual paywall offering a trial — configured remotely, not hardcoded.

**5.3 Subscribed User**
> As a subscribed user, I never see paywalls. All gated placements resolve instantly and transparently.

### Developer Experience

**5.4 Remote Gate Control**
> As a product owner, I can activate or deactivate a paywall on any instrumented placement from the Superwall dashboard without an app update.

**5.5 A/B Testing**
> As a product owner, I can run A/B tests on paywall designs, copy, pricing, and placement from the dashboard.

**5.6 User Segmentation**
> As a product owner, I can target paywalls to specific user segments (e.g., users with >5 matches, users who signed up >7 days ago, users with >60% win rate) using attributes passed from the app.

---

## 6. Technical Architecture

### 6.1 Stack

| Component | Technology |
|-----------|-----------|
| Paywall SDK | `expo-superwall` (official Superwall Expo SDK) |
| Subscription management | Superwall (handles StoreKit internally) |
| Product configuration | App Store Connect + StoreKit config file |
| Paywall design | Superwall no-code dashboard |
| User identity | Firebase Auth UID passed via `useUser().identify()` |
| Hooks | `usePlacement()`, `useUser()`, `useSuperwall()`, `useSuperwallEvents()` |

### 6.2 New Files

```
src/
├── services/
│   └── superwallPlacements.ts   # Placement name constants
├── hooks/
│   └── useSuperwallIdentity.ts  # Syncs Firebase auth + attributes to Superwall
ios/
│   └── PickleGo.storekit        # StoreKit configuration for sandbox testing
```

### 6.3 Modified Files

| File | Change |
|------|--------|
| `package.json` | Add `expo-superwall` |
| `app.config.ts` | Add `expo-build-properties` iOS deployment target 15.1 if needed |
| `.env` | Add `EXPO_PUBLIC_SUPERWALL_IOS_API_KEY` |
| `App.tsx` | Wrap app with `<SuperwallProvider>`, add `useSuperwallIdentity` hook |
| `src/screens/HomeScreen.tsx` | Register `SessionStart` and `OnboardingComplete` placements |
| `src/screens/AddMatchScreen.tsx` | Register `MatchCreate` placement before match creation |
| `src/screens/CompleteMatchScreen.tsx` | Register `MatchComplete` placement before score submission |
| `src/screens/PlayerStatsScreen.tsx` | Register `ViewStats`, `ViewOpponentAnalysis`, `ViewPartnerAnalysis`, `FilterStatsByTime` placements |
| `src/screens/CourtsDiscoveryScreen.tsx` | Register `ViewCourtsDiscovery` placement on mount |
| `src/screens/MatchDetailsScreen.tsx` | Register `Rematch` placement in handleRematch |
| `src/screens/MatchesScreen.tsx` | Register `ViewMatchHistory` placement on mount |
| `src/screens/SettingsScreen.tsx` | Register `SettingsOpen` placement on mount |

### 6.4 Placement Registry

All placement names are defined in `src/services/superwallPlacements.ts`. The Superwall dashboard decides which ones trigger paywalls.

```typescript
export const PLACEMENTS = {
  // Lifecycle (non-blocking, for contextual upsells)
  APP_LAUNCH: 'AppLaunch',
  SESSION_START: 'SessionStart',
  ONBOARDING_COMPLETE: 'OnboardingComplete',

  // Match creation & completion
  MATCH_CREATE: 'MatchCreate',
  MATCH_CREATE_LIMIT: 'MatchCreateLimitReached',
  MATCH_COMPLETE: 'MatchComplete',

  // Feature access
  VIEW_STATS: 'ViewStats',
  VIEW_DETAILED_STATS: 'ViewDetailedStats',
  VIEW_OPPONENT_ANALYSIS: 'ViewOpponentAnalysis',
  VIEW_PARTNER_ANALYSIS: 'ViewPartnerAnalysis',
  VIEW_COURTS_DISCOVERY: 'ViewCourtsDiscovery',
  VIEW_MATCH_HISTORY: 'ViewMatchHistory',

  // Actions
  REMATCH: 'Rematch',
  FILTER_STATS_BY_TIME: 'FilterStatsByTime',

  // Settings / profile
  SETTINGS_OPEN: 'SettingsOpen',
} as const;
```

### 6.5 Gate-Check Pattern (using `usePlacement`)

The core pattern uses the `usePlacement()` hook from `expo-superwall`. Superwall decides remotely whether to show a paywall:

```typescript
import { usePlacement } from 'expo-superwall';
import { PLACEMENTS } from '../services/superwallPlacements';

// Action-level gate (e.g., creating a match)
function AddMatchScreen() {
  const { registerPlacement } = usePlacement();

  const handleCreateMatch = async () => {
    await registerPlacement({
      placement: PLACEMENTS.MATCH_CREATE,
      params: { match_count: matches.length },
      feature: () => {
        // This only runs if user has access (subscribed or no paywall configured)
        proceedWithMatchCreation();
      },
    });
  };
}

// Screen-level gate (e.g., courts discovery)
function CourtsDiscoveryScreen() {
  const { registerPlacement } = usePlacement();
  const navigation = useNavigation();
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    registerPlacement({
      placement: PLACEMENTS.VIEW_COURTS_DISCOVERY,
      feature: () => setHasAccess(true),
    }).catch(() => navigation.goBack());
  }, []);

  if (!hasAccess) return <LoadingSpinner />;
  return <ScreenContent />;
}
```

### 6.6 User Attributes for Audience Filters

Synced to Superwall via `useUser().update()` whenever data changes. These attributes are available as **audience filters** in the Superwall dashboard to control which users see which paywalls.

#### Profile Attributes

| Attribute | Type | Source | Audience Filter Examples |
|-----------|------|--------|------------------------|
| `name` | string | `currentUser.name` | Personalize paywall copy with `{{name}}` |
| `email` | string | `currentUser.email` | Target specific cohorts |
| `auth_provider` | string | `currentUser.authProvider` | `auth_provider == "apple"` — different paywalls per provider |
| `rating` | number | `currentUser.rating` | `rating >= 4` — target competitive players |
| `has_profile_pic` | boolean | `!!currentUser.profilePic` | Engaged users who completed their profile |

#### Engagement Attributes

| Attribute | Type | Source | Audience Filter Examples |
|-----------|------|--------|------------------------|
| `total_matches` | number | `matches.length` | `total_matches >= 5` — gate after free tier |
| `completed_matches` | number | matches with `status === 'completed'` | `completed_matches >= 3` — active players only |
| `scheduled_matches` | number | matches with `status === 'scheduled'` | Upcoming activity level |
| `singles_matches` | number | matches with `matchType === 'singles'` | Target by play style |
| `doubles_matches` | number | matches with `matchType === 'doubles'` | Target by play style |

#### Performance Attributes

| Attribute | Type | Source | Audience Filter Examples |
|-----------|------|--------|------------------------|
| `win_rate` | number | `stats.overall.winPercentage` | `win_rate >= 60` — target winning players |
| `total_wins` | number | `stats.overall.wins` | Volume of wins |
| `total_losses` | number | `stats.overall.losses` | Volume of losses |
| `current_win_streak` | number | `stats.overall.currentStreak` | `current_win_streak >= 3` — hot streak upsell |
| `best_win_streak` | number | `stats.overall.bestStreak` | Historical engagement |

#### Social Attributes

| Attribute | Type | Source | Audience Filter Examples |
|-----------|------|--------|------------------------|
| `connections_count` | number | `currentUser.connections?.length ?? 0` | `connections_count >= 3` — socially active |
| `has_connections` | boolean | `connections.length > 0` | Social feature engagement |

#### Lifecycle Attributes

| Attribute | Type | Source | Audience Filter Examples |
|-----------|------|--------|------------------------|
| `account_created_at` | string | `new Date(currentUser.createdAt).toISOString()` | Time-based cohorts |
| `days_since_signup` | number | computed from `createdAt` | `days_since_signup >= 7` — show trial after grace period |
| `is_new_user` | boolean | `days_since_signup <= 3` | Protect new users from early paywalls |
| `platform` | string | `Platform.OS` | Platform-specific targeting |

#### App Usage Attributes

| Attribute | Type | Source | Audience Filter Examples |
|-----------|------|--------|------------------------|
| `has_used_courts` | boolean | computed from navigation history or saved courts | Courts feature engagement |
| `has_used_rematch` | boolean | computed | Power user indicator |
| `uses_team_randomization` | boolean | any match with `randomizeTeamsPerGame` | Feature adoption |
| `favorite_match_type` | string | most common `matchType` | Personalization |

### 6.7 User Identity & Attribute Sync Hook

`src/hooks/useSuperwallIdentity.ts` handles all Superwall identity and attribute syncing:

```typescript
import { useUser, useSuperwall } from 'expo-superwall';
import { useData } from '../context/DataContext';

export function useSuperwallIdentity() {
  const { identify, signOut: swSignOut, update } = useUser();
  const { currentUser, matches } = useData();

  // Identify user when auth state changes
  useEffect(() => {
    if (currentUser?.id) {
      identify(currentUser.id);
    } else {
      swSignOut(); // Resets to anonymous user
    }
  }, [currentUser?.id]);

  // Sync attributes whenever user data or matches change
  useEffect(() => {
    if (!currentUser) return;

    const completedMatches = matches.filter(m => m.status === 'completed');
    const daysSinceSignup = Math.floor(
      (Date.now() - currentUser.createdAt) / (1000 * 60 * 60 * 24)
    );

    update({
      // Profile
      name: currentUser.name,
      email: currentUser.email,
      auth_provider: currentUser.authProvider,
      rating: currentUser.rating,
      has_profile_pic: !!currentUser.profilePic,

      // Engagement
      total_matches: matches.length,
      completed_matches: completedMatches.length,
      scheduled_matches: matches.filter(m => m.status === 'scheduled').length,
      singles_matches: matches.filter(m => m.matchType === 'singles').length,
      doubles_matches: matches.filter(m => m.matchType === 'doubles').length,

      // Performance (computed from stats)
      win_rate: currentUser.stats?.overall?.winPercentage ?? 0,
      total_wins: currentUser.stats?.overall?.wins ?? 0,
      total_losses: currentUser.stats?.overall?.losses ?? 0,
      current_win_streak: currentUser.stats?.overall?.currentStreak ?? 0,
      best_win_streak: currentUser.stats?.overall?.bestStreak ?? 0,

      // Social
      connections_count: currentUser.connections?.length ?? 0,
      has_connections: (currentUser.connections?.length ?? 0) > 0,

      // Lifecycle
      account_created_at: new Date(currentUser.createdAt).toISOString(),
      days_since_signup: daysSinceSignup,
      is_new_user: daysSinceSignup <= 3,
      platform: Platform.OS,

      // App usage
      uses_team_randomization: matches.some(m => m.randomizeTeamsPerGame),
      favorite_match_type: matches.length > 0
        ? matches.filter(m => m.matchType === 'doubles').length > matches.length / 2
          ? 'doubles' : 'singles'
        : 'none',
    });
  }, [currentUser, matches]);
}
```

### 6.8 Component Tree

```
DataProvider (existing)
  └── SuperwallProvider apiKeys={{ ios: EXPO_PUBLIC_SUPERWALL_IOS_API_KEY }}
        └── SuperwallIdentitySync (calls useSuperwallIdentity hook)
              └── NavigationContainer (existing)
                    └── SafeAreaProvider
                          └── ToastProvider
                                └── Navigation (screens use usePlacement())
```

The `SuperwallProvider` from `expo-superwall` handles SDK initialization. It wraps `NavigationContainer` but sits inside `DataProvider` so the identity hook can access `currentUser` and `matches`.

### 6.9 SDK Hooks Usage Summary

| Hook | Used For | Where |
|------|----------|-------|
| `usePlacement()` | `registerPlacement()` — gate features | Every screen with a placement |
| `useUser()` | `identify()`, `signOut()`, `update()` — identity & attributes | `useSuperwallIdentity` hook |
| `useSuperwall()` | `subscriptionStatus`, `isConfigured` — state checks | Optional: settings screen, conditional UI |
| `useSuperwallEvents()` | Event tracking, analytics | Optional: debugging, analytics forwarding |

---

## 7. StoreKit & App Store Connect Setup

### Products (configurable later)

| Product ID | Type | Description |
|-----------|------|-------------|
| `com.picklego.pro.monthly` | Auto-renewable subscription | Monthly plan |
| `com.picklego.pro.annual` | Auto-renewable subscription | Annual plan |
| `com.picklego.pro.lifetime` | Non-consumable (optional) | One-time lifetime purchase |

### StoreKit Config File

Create `ios/PickleGo.storekit` for local sandbox testing. This mirrors the products defined in App Store Connect and allows testing the full purchase flow on simulators and development devices.

### Superwall Dashboard Configuration

- Create a project for PickleGo iOS
- Enter the Public API Key in `.env` as `EXPO_PUBLIC_SUPERWALL_IOS_API_KEY`
- Add the product IDs from App Store Connect
- Create paywall templates using Superwall's editor
- Create campaigns mapping placements → paywalls with audience rules using the user attributes above

---

## 8. Edge Cases

| Scenario | Handling |
|----------|----------|
| User is offline when placement fires | Superwall SDK caches config; defaults to granting access when offline (feature callback runs) |
| User subscribes mid-action (e.g., during match creation) | `registerPlacement` runs the feature callback after purchase completes; action continues seamlessly |
| User dismisses paywall (gated placement) | Feature callback does not run; user returns to previous state |
| User dismisses paywall (non-gated placement) | Feature callback still runs (controlled by dashboard gating setting per campaign) |
| Auth state not yet resolved when placement fires | `SuperwallProvider` sits inside `DataProvider`; placements only fire from screens that render after auth resolves |
| User downgrades/cancels subscription | Superwall checks `subscriptionStatus` on each placement; gates re-activate when subscription lapses |
| StoreKit purchase fails | Superwall handles error UI internally; feature callback does not run |
| Hot reload during development | Superwall does not refetch config on hot reload; requires full app restart to see dashboard changes |
| Multiple rapid placement fires | Superwall deduplicates; only one paywall shown at a time |

---

## 9. Implementation Phases

### Phase 1: Foundation (Week 1)
- Install `expo-superwall` via `npx expo install expo-superwall`
- Verify `expo-build-properties` has iOS deployment target >= 15.1
- Create `src/services/superwallPlacements.ts` with all placement constants
- Add `<SuperwallProvider>` to `App.tsx` component tree with iOS API key
- Create `src/hooks/useSuperwallIdentity.ts` for identity + attribute syncing
- Add identity sync component between `SuperwallProvider` and `NavigationContainer`
- Add `EXPO_PUBLIC_SUPERWALL_IOS_API_KEY` to `.env`
- Create StoreKit configuration file for sandbox testing
- Run EAS development build, verify SDK initializes (`isConfigured === true`)

### Phase 2: Identity & Attributes (Week 1-2)
- Wire up `identify()` / `signOut()` calls on auth state changes
- Sync all user attributes (profile, engagement, performance, social, lifecycle, app usage)
- Verify attributes appear in Superwall dashboard user inspector
- Test attribute updates when matches are created/completed
- **No paywalls configured yet — zero user impact**

### Phase 3: Placement Instrumentation (Week 2)
- Register `SessionStart` and `OnboardingComplete` in HomeScreen
- Register `MatchCreate` in AddMatchScreen (with `match_count` param)
- Register `MatchComplete` in CompleteMatchScreen
- Register all stats placements in PlayerStatsScreen
- Register `ViewCourtsDiscovery` in CourtsDiscoveryScreen
- Register `Rematch` in MatchDetailsScreen
- Register `ViewMatchHistory` in MatchesScreen
- Register `SettingsOpen` in SettingsScreen
- Verify all placements fire in Superwall dashboard event log
- **All placements fire but no paywalls are configured yet — zero user impact**

### Phase 4: App Store Connect & Dashboard (Week 3)
- Create subscription products in App Store Connect
- Configure Superwall dashboard: add products, create paywall templates
- Create campaigns mapping placements → paywalls with audience rules
- Test audience filters using the synced user attributes
- Test full purchase flow in sandbox environment
- Submit for App Store review

---

## 10. Testing Strategy

| Layer | Approach |
|-------|----------|
| Identity sync | Verify `identify()` fires on login, `signOut()` on logout, attributes update on data changes |
| Attribute verification | Inspect user in Superwall dashboard; confirm all 25+ attributes are present and correct |
| Placement verification | Check all 17 placements fire in Superwall dashboard event log |
| Gate pattern | Configure a test paywall; test gated feature blocked on dismiss, allowed on purchase |
| Non-gated pattern | Configure a non-gated paywall; verify feature runs even after dismiss |
| Purchase flow | End-to-end sandbox purchase via StoreKit config file |
| Audience targeting | Create audience rules (e.g., `total_matches >= 5`); verify correct users see paywalls |
| Offline | Kill network, verify placements resolve by running feature callback (graceful degradation) |
| Subscription lapse | Use sandbox accelerated subscriptions to test re-gating |
| Hot reload | Confirm dashboard changes require full app restart to take effect |

---

## 11. Dependencies & Prerequisites

| Dependency | Notes |
|-----------|-------|
| Superwall account | Create project, obtain iOS Public API Key |
| `expo-superwall` | Official Expo SDK; requires Expo SDK >= 53 (app uses 54) |
| `expo-build-properties` | Set iOS deployment target to 15.1; already in project |
| Apple Developer account | Required for App Store Connect subscription setup |
| EAS Build | Custom dev build required (not Expo Go) — already in place via `expo-dev-client` |
| App Store Connect | Subscription products must be created before testing purchases |

---

## 12. Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | What's the free match limit threshold for `MatchCreateLimitReached`? | Can be configured via Superwall audience rules on `total_matches` attribute — no hardcoding needed |
| 2 | Should offline users always get access, or should the app block gated features when offline? | Current plan: Superwall defaults to granting access offline |
| 3 | Will there be a free trial period? | Configured in App Store Connect and Superwall dashboard, no code impact |
| 4 | Should `has_used_courts` and `has_used_rematch` be tracked in Firestore for persistence, or derived from local state? | Firestore is more reliable across devices; local state is simpler |

---

## 13. Success Criteria

1. Superwall Expo SDK initializes without errors on app launch (`isConfigured === true`).
2. All 17 named placements fire correctly and appear in the Superwall dashboard event log.
3. User identity (`identify` / `signOut`) syncs correctly with Firebase Auth state.
4. All 25+ user attributes are visible in the Superwall dashboard user inspector and update in real-time.
5. Audience filters based on user attributes correctly segment users in the dashboard.
6. Activating a paywall on any placement from the dashboard works without app update.
7. Full purchase flow completes in sandbox: placement → paywall → purchase → feature callback runs.
8. Dismissed paywall correctly blocks the gated action (feature callback does not run).
9. Subscribed users bypass all gates transparently.
10. Zero regressions to existing free user experience when no paywalls are active.
