# PickleGo

Pickleball match tracking and social app built with React Native (Expo) and Firebase. Users create matches, invite friends (in-app, SMS, or open invites), record scores, and track stats over time. The app has a companion Apple Watch app for courtside scoring.

## Tech Stack

- **Frontend**: React Native 0.81, React 19, Expo 54, TypeScript 5.9
- **Backend**: Firebase (Firestore, Auth, Cloud Functions v2, Storage)
- **Navigation**: React Navigation 6 (native-stack + bottom-tabs)
- **State**: React Context API (`DataContext`) with AsyncStorage persistence
- **Animations**: react-native-reanimated 4, react-native-gesture-handler
- **Maps**: react-native-maps, expo-location, Google Places API
- **Auth**: Email/password, Google Sign-In, Apple Sign-In (all via Firebase Auth)
- **Notifications**: expo-notifications + Expo Server SDK (sent from Cloud Functions)
- **Analytics**: AppsFlyer (attribution + deep linking via OneLink)
- **Monetization**: Superwall (paywall placements: SESSION_START, ADD_MATCH_TAPPED, VIEW_STATS, COMPLETE_MATCH_TAPPED)
- **Fonts**: Fredoka (primary), Bungee, Poppins

## Project Structure

```
src/
  components/       # 27 reusable UI components
  screens/          # 15 main screens + 6 onboarding screens
    onboarding/     # 6-step onboarding flow
  navigation/       # Stack + tab navigators, navigationRef
  context/          # DataContext (main state), ToastContext
  config/           # firebase.ts (API layer ~650 lines), venueFirestore.ts
  services/         # appsflyer, pushNotifications, placesService, superwallPlacements, constants
  hooks/            # 13 custom hooks (useContacts, useVenues, useHaptic, animations, etc.)
  types/            # TypeScript definitions (Player, Match, Game, MatchNotification, etc.)
  utils/            # 14 utilities — statsCalculator, phone, deepLink, shareMatch, ids, dateFormat, etc.
  theme/            # colors, typography, spacing, shadows, layout, animation
  assets/           # logo.png
  __tests__/        # Unit tests (matchLifecycle, scoreValidation, statsCalculator)
functions/          # Firebase Cloud Functions (src/index.ts ~1700 lines)
watch/              # Apple Watch app (SwiftUI, source of truth)
modules/watch-sync/ # Expo native module bridging WatchConnectivity to React Native
plugins/            # withWatchTarget.js config plugin
scripts/            # release.sh, fix-watch-target.rb, sim-watch-override.sh
website/            # Static landing page (GitHub Pages)
docs/               # PRD documents
```

## Architecture

### Data Flow
```
Screens/Components → DataContext → firebase.ts → Firestore / Cloud Functions
                                                       ↓
                                              Push Notifications (Expo Server SDK)
```

### State Management (DataContext — `src/context/DataContext.tsx`)
- Single context provider holds: `players`, `matches`, `currentUser`, `notifications`, `openMatches`, `hasCompletedOnboarding`, `unreadNotificationCount`
- Persisted to AsyncStorage with 300ms debounce
- Uses refs for stable callback patterns (avoids re-renders)
- Uses `unstable_batchedUpdates` for performance

**Key methods by domain:**

Auth: `signIn`, `signInWithSocial`, `completeSocialSignUp`, `signOutUser`, `deleteAccount`

Players: `addPlayer`, `updatePlayer`, `removePlayer`, `invitePlayer`, `sendPlayerInvite`, `respondToPlayerInvite`, `getPlayerName`, `claimInvitation`

Matches: `addMatch`, `updateMatch`, `deleteMatch`, `createOpenMatch`, `joinOpenMatch`, `leaveOpenMatch`, `cancelOpenMatch`, `getOpenMatch`, `refreshMatches`

Notifications: `markNotificationRead`, `markAllNotificationsRead`, `deleteNotification`, `clearAllNotifications`, `sendMatchNotifications`, `sendMatchUpdateNotifications`

SMS/Contacts: `invitePlayersBySMS`, `lookupContactsOnPickleGo`, `findSMSInvitesByPhone`, `claimPendingSMSInvite`

### Firebase Collections
- `players/{id}` — user profiles, stats, connections, push tokens
- `matches/{id}` — match records with teams, scores, scheduling
- `notifications/{id}` — match invites, updates, cancellations (scoped to sender/recipient)
- `smsInvites/{id}` — SMS invitation tracking
- `venues/{id}` — user-saved court locations

### Firebase API (`src/config/firebase.ts`)

**Player CRUD:** `createPlayerDocument`, `updatePlayerDocument`, `getPlayerDocument`, `getPlayerByEmail`, `getPlaceholderByEmail`, `deletePlayerDocument`

**Auth:** `signUpWithEmail`, `signInWithEmail`, `signInWithGoogle`, `signInWithApple`, `signOut`, `sendPasswordReset`, `onAuthStateChanged`

**Match CRUD:** `createMatchDocument`, `updateMatchDocument`, `deleteMatchDocument`, `softDeleteMatch`, `getMatchesForPlayer`, `getMatchDocument`

**Notifications:** `createNotificationDocument`, `batchCreateNotificationDocuments`, `updateNotificationDocument`, `deleteNotificationDocument`, `getNotificationsForPlayer`

**Connections:** `addConnectionsBatch` (bidirectional), `addPendingConnection`, `removeConnection`

**Cloud Function Callers:** `callAcceptPlayerInvite`, `callClaimPlaceholderProfile`, `callCreateSMSInvite`, `callClaimSMSInvite`, `callLookupPhoneNumbers`, `callJoinOpenMatch`, `callLeaveOpenMatch`, `callCancelOpenMatch`, `callDeleteAccount`, `callResendMatchNotifications`

**Storage:** `uploadProfilePicture` (Firebase Storage), `getDownloadURL`

### Cloud Functions (`functions/src/index.ts`)

**Callable (onCall):**
- `acceptPlayerInvite` — accept pending player connection, create bidirectional connections
- `claimPlaceholderProfile` — merge placeholder account when user signs up with matching email
- `createSMSInvite` — create SMS invite record for deep link generation
- `claimSMSInvite` — claim SMS invite, create connection with inviter
- `lookupPhoneNumbers` — privacy-safe phone lookup via SHA-256 hashes (batch up to 500)
- `joinOpenMatch` — join open match pool, auto-randomize teams when full, handle waitlist
- `leaveOpenMatch` — leave match/waitlist, FIFO waitlist promotion
- `cancelOpenMatch` — creator cancels, notifies all joined players
- `deleteAccount` — delete auth + Firestore player + placeholders + profile pic
- `resendMatchNotifications` — resend match invites to all participants

**Triggers (Firestore):**
- `sendPushOnNotificationWrite` — sends Expo push on notification doc create, deduplicates, cleans stale tokens
- `createNotificationsOnMatchCreate` — creates match_invite notifications for all players
- `createNotificationsOnMatchUpdate` — handles roster changes (added → invite, existing → update, removed → cancel)
- `recalculateStatsOnMatchUpdate` — recalculates all affected player stats on match completion/edit

**Scheduled:**
- `expireOpenMatches` — runs hourly, expires matches past scheduledDate

### Key Patterns
- **Placeholder profiles**: SMS invites create `pendingClaim=true` players, merged via `claimPlaceholderProfile` Cloud Function when user signs up
- **Phone privacy**: Phone numbers stored as SHA-256 hashes, lookups done server-side
- **Soft deletes**: Matches use `deletedByPlayerIds[]` instead of hard delete
- **Idempotent notification IDs**: Deterministic ID generation prevents duplicates (`playerInviteNotifId`, `matchInviteNotifId`, etc. in `src/utils/ids.ts`)
- **Deep linking**: AppsFlyer OneLink for SMS invites and open match sharing
- **Open matches**: Public matches with player pool, auto-randomized teams when full, FIFO waitlist
- **Authenticated callables**: All Cloud Function callers use `authenticatedCallable()` wrapper with token refresh

## Screens & Navigation

### Navigation Structure (`src/navigation/`)

**Root navigator** (`index.tsx`) — auth-based conditional rendering:
- No user → `AuthScreen`
- User + not onboarded → `OnboardingNavigator`
- User + onboarded → `MainTabs` + modal/stack screens

**Bottom Tab Navigator** (`TabNavigator.tsx`) — 5 tabs:
1. **Home** (house icon) → `HomeScreen`
2. **Matches** (calendar icon) → `MatchesScreen`
3. **New Match** (raised yellow FAB with + icon) → `AddMatchScreen`
4. **My Stats** (bar chart icon) → `PlayerStatsScreen`
5. **Settings** (gear icon) → `SettingsScreen`

**Modal/Stack screens accessible from tabs:** MatchDetails, CompleteMatch (slide-up), PlayerStats, EditProfile, CourtsDiscovery, Notifications, NotificationPreferences, InvitePlayers, ManagePlayers

### Main Screens (`src/screens/`)

| Screen | Description |
|--------|-------------|
| `AuthScreen` | Email/password login + signup, Google/Apple social auth, password reset |
| `HomeScreen` | Dashboard: upcoming matches, quick stats, open match claims via deep links, pull-to-refresh |
| `MatchesScreen` | List all matches (scheduled/completed/expired), filter + sort |
| `AddMatchScreen` | Create/edit match: date/time, location (map picker), teams, singles/doubles, points/games config, open invite toggle |
| `CompleteMatchScreen` | Modal for recording game scores, team assignments, winner determination |
| `MatchDetailsScreen` | Full match view: participants, map, status, team shuffle, player pool/waitlist for open matches, real-time Firestore listener |
| `PlayerStatsScreen` | Stats dashboard: overall/singles/doubles breakdown, win streaks, opponent + partner analysis, time period filter |
| `PlayersScreen` | Connected players list, swipe-to-remove, invite new players |
| `ProfileScreen` | View/edit user profile: name, email, phone, profile picture |
| `EditProfileScreen` | Profile editor with photo upload/selection from library (Firebase Storage) |
| `SettingsScreen` | Account settings, notification prefs, court discovery, help, sign out, delete account |
| `CourtsDiscoveryScreen` | Browse nearby pickleball courts via Google Places API + Google Maps, save favorites |
| `NotificationsScreen` | Notification center: match/player invites, updates, cancellations, accept/decline, mark read |
| `NotificationPreferencesScreen` | Toggle notifications: match invites, updates, cancellations, player invites, open match events |
| `InvitePlayersScreen` | Search contacts, SMS invite, email invite, direct in-app invite |

### Onboarding Flow (`src/screens/onboarding/`) — 6 sequential steps:
1. `WelcomeScreen` — app intro with branding
2. `NotificationPermScreen` — request push notification permissions
3. `PhoneNumberScreen` — collect phone number (hashed for privacy, used for contact matching)
4. `InviteFriendsScreen` — invite device contacts during setup
5. `ScheduleMatchScreen` → `OnboardingAddMatch` — create first match
6. `CelebrationScreen` — completion celebration, marks onboarding done

## Core Data Models (`src/types/index.ts`)

```typescript
Player {
  id, name, email, phoneNumber, profilePic, rating,
  stats: PlayerStats { totalMatches, wins, losses, winPercentage, totalGames, gameWins, gameLosses, currentWinStreak, bestWinStreak },
  connections[], pendingConnections[], pushTokens[],
  notificationPreferences: NotificationPreferences,
  authProvider: 'email' | 'google' | 'apple',
  pendingClaim: boolean,   // placeholder awaiting claim
  invitedBy: string,
  phoneNumberHash: string, // SHA-256 for privacy
  createdAt, updatedAt     // unix timestamps
}

Match {
  id, createdBy, createdAt, lastModifiedAt, lastModifiedBy,
  matchType: 'singles' | 'doubles',
  pointsToWin: number,     // 11, 15, 21
  numberOfGames: number,   // 1, 3, 5
  scheduledDate: string,   // ISO date
  location, locationCoords: { latitude, longitude },
  status: 'scheduled' | 'completed' | 'expired',
  team1PlayerIds[], team2PlayerIds[], allPlayerIds[],
  team1PlayerNames[], team2PlayerNames[],
  games: Game[],
  winnerTeam: 1 | 2 | null,
  deletedByPlayerIds[],    // soft delete
  randomizeTeamsPerGame: boolean,
  // Open invite fields
  isOpenInvite, openInviteStatus: 'open' | 'full' | 'cancelled',
  playerPool[], playerPoolNames[], maxPlayers,
  waitlist[], waitlistNames[]
}

Game {
  team1Score, team2Score, winnerTeam: 1 | 2,
  team1PlayerIds[], team2PlayerIds[],
  rallyLog?: RallyEvent[]  // optional point-by-point
}

MatchNotification {
  id, type: 'match_invite' | 'match_updated' | 'match_cancelled' | 'player_invite' |
            'invite_accepted' | 'open_match_join' | 'open_match_leave' | 'open_match_full' |
            'open_match_waitlist_join' | 'open_match_waitlist_promoted',
  status: 'sent' | 'read' | 'accepted' | 'declined',
  recipientId, senderId, senderName, senderProfilePic,
  matchId, matchDate, matchLocation, message,
  createdAt, readAt, respondedAt
}

SMSInvite { id, inviterId, inviterName, recipientPhones[], recipientNames[], status, claimedBy[] }
```

## Components (`src/components/`)

### Layout & Structure
| Component | Description |
|-----------|-------------|
| `Layout` | Main screen wrapper — safe area, status bar, keyboard avoiding, header with back/home buttons + title |
| `OnboardingLayout` | Onboarding wrapper with Pickle Pete mascot illustration |
| `Section` | Section header + content grouping |
| `FormRow` | Form field wrapper with label and spacing |
| `Card` | Generic card container — white bg, rounded corners (12px), medium shadow, 16px padding |
| `DismissableModal` | Base dismissible modal wrapper |

### Interactive
| Component | Description |
|-----------|-------------|
| `AnimatedPressable` | Pressable with Reanimated scale-down animation (default 0.96) + haptic feedback. Separates layout from visual styles so animations don't affect positioning |
| `PrimaryButton` | Green (#4CAF50) filled button, white text, 52px min height, small shadow |
| `SecondaryButton` | Surface (#F5F5F5) bg with border (#DDDDDD), gray (#666666) text |
| `DangerButton` | Red (#F44336) filled button, white text, heavy haptic |
| `FooterButton` | Button fixed at bottom of screen |
| `SegmentedControl` | Tab-like toggle — green (#4CAF50) border, selected segment fills green with white text, unselected white bg with green text |
| `ToggleRow` | Toggle switch with label for settings |
| `SwipeableRow` | Swipeable list item with delete/action gestures |

### Match & Player
| Component | Description |
|-----------|-------------|
| `MatchCard` | Match summary card — colored left border (green=win, red=loss, blue=scheduled, yellow=open). Status badges use colored overlays. Scores shown in green-tinted container |
| `PlayerSlots` | Team roster visualization as player slot displays |
| `TeamAssignModal` | Modal for manually assigning players to teams |
| `NotificationCard` | Notification with sender info, match details, action buttons (accept/decline) |
| `NotificationBell` | Header bell icon with unread count badge |
| `InvitePlayersModal` | Full modal for searching and inviting players |
| `CountryPickerModal` | Country selector for phone number input (50+ countries with flags) |

### Feedback & Display
| Component | Description |
|-----------|-------------|
| `Toast` | Animated toast notification — springs in from top, swipe-up or tap to dismiss, color-coded (green/red/blue), haptic feedback on show |
| `SkeletonLoader` | Placeholder skeleton during data loading |
| `Chip` | Small badge/tag component |
| `OnboardingProgressBar` | Visual step indicator during onboarding |
| `PicklePete` | Pickle mascot character illustration |
| `Icon` | Wrapper around lucide-react-native icons (40+ icons mapped), strokeWidth=3, rounded caps |
| `GoogleIcon` | Google logo SVG for social auth buttons |
| `LocationPicker` | Google Maps integration for venue/location selection with saved venues |

## Design System & Visual Language

### Brand Identity
- **Name**: PickleGo
- **Style**: "Neon-Organic" — bright, playful, sport-casual
- **Mascot**: Pickle Pete — a pickle character used in onboarding and empty states
- **Logo**: `src/assets/logo.png`
- **Orientation**: Portrait only
- **Mode**: Light mode only (no dark mode)

### Color Palette (`src/theme/colors.ts`)

**Brand Colors:**
| Token | Hex | Name | Usage |
|-------|-----|------|-------|
| `primary` | `#4CAF50` | Pickle Green | Branding, success states, primary buttons, active tabs, win indicators, header titles |
| `action` | `#FFC107` | Power Yellow | CTAs, FAB button, highlights, "Open" badge, "New" badges, FAB shadow glow |
| `secondary` | `#2196F3` | Court Blue | Secondary buttons, links, "Scheduled" badge, info states |

**Semantic Colors:**
| Token | Hex | Usage |
|-------|-----|-------|
| `success` | `#4CAF50` | Success states (same as primary) |
| `error` | `#F44336` | Danger buttons, error states, loss indicators, error toasts |
| `info` | `#2196F3` | Info states (same as secondary) |
| `warning` | `#FFC107` | Warning states (same as action) |
| `win` | `#4CAF50` | Win indicators, win badge bg |
| `loss` | `#F44336` | Loss indicators, loss badge bg |

**Neutral Colors:**
| Token | Hex | Name | Usage |
|-------|-----|------|-------|
| `neutral` | `#333333` | Deep Asphalt | Primary text, borders |
| `surface` | `#F5F5F5` | Court Gray | Screen backgrounds, card containers, team name containers |
| `white` | `#FFFFFF` | Win White | Card backgrounds, text on colored buttons, header backgrounds |

**Gray Scale:**
| Token | Hex | Usage |
|-------|-----|-------|
| `gray100` | `#F5F5F5` | Same as surface |
| `gray200` | `#E0E0E0` | Card borders, dividers, empty dots |
| `gray300` | `#CCCCCC` | — |
| `gray400` | `#999999` | Location text, secondary info |
| `gray500` | `#666666` | Secondary button text, "vs" text |
| `gray600` | `#333333` | Same as neutral |

**Component-Specific Colors:**
| Token | Hex | Usage |
|-------|-----|-------|
| `cardBorder` | `#E0E0E0` | Card and tab bar top borders |
| `cardBackground` | `#FFFFFF` | Card backgrounds |
| `inputBorder` | `#DDDDDD` | Input field and secondary button borders |
| `tabInactive` | `#BBC3CE` | Inactive tab bar icons |
| `backdrop` | `rgba(0,0,0,0.5)` | Modal backdrops |

**Transparent Overlays (for badges and score containers):**
| Token | Value | Usage |
|-------|-------|-------|
| `winOverlay` | `rgba(76,175,80,0.15)` | Win badge bg, completed badge bg |
| `lossOverlay` | `rgba(244,67,54,0.15)` | Loss badge bg |
| `primaryOverlay` | `rgba(76,175,80,0.1)` | Score display container bg |
| `actionOverlay` | `rgba(255,193,7,0.15)` | "Open" badge bg |
| `secondaryOverlay` | `rgba(33,150,243,0.15)` | "Scheduled" badge bg |

### Typography (`src/theme/typography.ts`)
- **Primary font**: Fredoka (all weights: Regular 400, Medium 500, SemiBold 600, Bold 700)
- **Secondary fonts**: Bungee (display/decorative), Poppins (body alternative — used sparingly)

| Style | Font | Size | Line Height |
|-------|------|------|-------------|
| `h1` | Fredoka Bold | 32px | 38px |
| `h2` | Fredoka SemiBold | 24px | 31px |
| `h3` | Fredoka SemiBold | 20px | 26px |
| `bodyLarge` | Fredoka Medium | 16px | 24px |
| `bodySmall` | Fredoka Regular | 14px | 21px |
| `button` | Fredoka SemiBold | 16px | 19px |
| `stats` | Fredoka Bold | 24px | — |
| `scoreDisplay` | Fredoka Bold | 28px | — |
| `caption` | Fredoka Regular | 12px | 17px |
| `label` | Fredoka Medium | 14px | 20px |

### Spacing & Layout (`src/theme/spacing.ts`, `src/theme/layout.ts`)

**Spacing scale:**
| Token | Value |
|-------|-------|
| `xs` | 4px |
| `sm` | 8px |
| `md` | 12px |
| `lg` | 16px |
| `xl` | 20px |
| `xxl` | 24px |
| `xxxl` | 32px |
| `xxxxl` | 40px |

**Border radius:**
| Token | Value |
|-------|-------|
| `sm` | 8px |
| `md` | 12px |
| `lg` | 16px |
| `xl` | 20px |
| `pill` | 9999px |

**Layout constants:**
| Token | Value |
|-------|-------|
| `TAB_BAR_HEIGHT` | 70px |
| `screenPadding` | 16px (lg) |
| `sectionSpacing` | 20px (xl) |
| `cardPadding` | 16px (lg) |
| `inputSpacing` | 16px (lg) |

### Shadows (`src/theme/shadows.ts`)

| Preset | Offset | Opacity | Radius | Elevation | Usage |
|--------|--------|---------|--------|-----------|-------|
| `none` | 0,0 | 0 | 0 | 0 | — |
| `sm` | 0,1 | 0.08 | 2 | 2 | Cards, primary/danger buttons |
| `md` | 0,2 | 0.1 | 4 | 3 | Prominent cards (Card component default) |
| `lg` | 0,4 | 0.15 | 8 | 5 | Toasts, modals |
| `fab` | 0,3 | 0.4 | 6 | 8 | FAB button (uses `#FFC107` yellow as shadow color) |

### Animation System (`src/theme/animation.ts`)

**Durations:**
| Token | Value |
|-------|-------|
| `instant` | 0ms |
| `fast` | 150ms |
| `normal` | 250ms |
| `slow` | 350ms |
| `stagger` | 50ms |

**Spring configs (Reanimated `withSpring`):**
| Preset | Damping | Stiffness | Mass | Usage |
|--------|---------|-----------|------|-------|
| `snappy` | 15 | 400 | 0.8 | Button press, toggles, small UI |
| `gentle` | 20 | 200 | 1 | List items entering, card animations |
| `bouncy` | 12 | 300 | 0.8 | FAB press, success states, playful moments |
| `modal` | 25 | 300 | 1 | Modal present/dismiss |

**Gesture thresholds:**
| Token | Value |
|-------|-------|
| `swipeDeleteThreshold` | -80px |
| `swipeDismissThreshold` | 100px |
| `pullToRefreshThreshold` | 80px |

### Haptic Feedback
- All interactive elements use `useHaptic()` hook via `AnimatedPressable`
- Patterns: `light` (default taps), `medium`, `heavy` (danger actions), `success`, `warning`, `error`
- Toast notifications trigger haptic matching their type (success/error/info)

### Key Visual Patterns
- **Match cards**: White card (#FFFFFF) with colored 4px left border indicating state (green #4CAF50=win, red #F44336=loss, blue #2196F3=scheduled, yellow #FFC107=open). Status badges use colored overlay backgrounds. Scores shown in green-tinted (#4CAF50 at 10% opacity) container with Fredoka Bold 28px
- **Tab bar**: White background, 70px height, green (#4CAF50) active color, gray (#BBC3CE) inactive. Center "New Match" tab is a raised 48px yellow (#FFC107) circular FAB button floating 15px above the bar with yellow glow shadow
- **Headers**: White background with 1px bottom border (#E0E0E0) + small shadow, green (#4CAF50) title text (Fredoka SemiBold 20px) centered, green back/home icons
- **Screen backgrounds**: Light gray (#F5F5F5)
- **Buttons**: 52px min height, 12px border radius, Fredoka SemiBold 16px text, 24px horizontal padding
- **Icons**: lucide-react-native via Icon wrapper, strokeWidth=3 (bolder than default 2), rounded line caps, default color #333333
- **Empty states**: Pickle Pete mascot illustrations
- **Loading states**: Skeleton loaders (shimmer placeholders)
- **Toasts**: Spring-animated (bouncy config) from top, positioned 50px from top + 16px horizontal margins, swipe-up or tap to dismiss, colored background matching type, Fredoka Medium 16px white text, large shadow, 12px border radius
- **Badges**: Rounded (8px), colored overlay background, Fredoka Regular 12px bold text, 8px horizontal + 4px vertical padding

## Hooks (`src/hooks/`)

| Hook | Purpose |
|------|---------|
| `useAnimatedPress` | Reanimated scale animation + haptic for button presses |
| `useFadeIn` | Fade-in animation on screen mount |
| `useSlideIn` | Slide-in from top/bottom/left/right |
| `useSwipeAction` | Swipe gesture detection (delete, actions) |
| `useReducedMotion` | Check device motion reduction preferences |
| `useHaptic` | Trigger haptic feedback (light/medium/heavy/success/warning/error) |
| `useStaggeredList` | Staggered entrance animations for list items |
| `useContentTransition` | Smooth transition between content states (e.g., login ↔ signup) |
| `useContacts` | Load device contacts, SMS availability, search/filter/selection |
| `useOnboardingStatus` | Track onboarding completion (AsyncStorage + Firestore fallback) |
| `useProfilePicture` | Manage profile picture selection + upload |
| `useVenues` | Manage saved venue/court list with Firestore persistence |
| `useSuperwallIdentity` | Sync user identity with Superwall paywall SDK |

## Utilities (`src/utils/`)

| Utility | Purpose |
|---------|---------|
| `dateFormat` | Date formatting: `formatMatchCardDate`, `formatSmartDate` ("Today"/"Tomorrow"), `formatTimeAgo`, `formatAccessibleDate`, etc. Uses date-fns |
| `phone` | `normalizePhone(phone, dialCode)`, `hashPhone` (SHA-256), `formatPhoneDisplay`, `formatPhoneInput`, `isValidPhone` |
| `ids` | UUID generators (`newMatchId`, `newPlaceholderPlayerId`) + deterministic notification ID helpers |
| `statsCalculator` | `calculatePlayerStats(matches, playerId)` — overall/singles/doubles breakdown, win streaks |
| `validation` | `isValidEmail` |
| `countries` | 50+ countries with code, name, dialCode, flag emoji. `DEFAULT_COUNTRY` = US |
| `deepLink` | Parse `picklego://open-match/{id}` and `picklego://invite/{id}` URLs |
| `shareMatch` | `buildMatchShareMessage` — formatted message for SMS/share sheet |
| `shuffleTeams` | Fisher-Yates shuffle, guarantees current user on team1 |
| `errorHandler` | Firebase error code → user-friendly message mapping |
| `formatPlayerName` | `formatPlayerNameWithInitial` ("John Smith" → "John S.") |
| `getInitials` | "John Smith" → "JS" for avatars |
| `smsInvite` | SMS invite formatting, deep link generation, SMS composer |
| `inviteCallbacks` | Callback management across screens during invite flows |

## Services (`src/services/`)

| Service | Purpose |
|---------|---------|
| `pushNotifications` | FCM token registration/deregistration, permission requests, notification handlers |
| `appsflyer` | Initialize attribution SDK, `generateOpenMatchLink(matchId)`, `generateOneLink(inviteId)`, deferred deep link handling |
| `placesService` | Google Places API: `searchPlaces`, `getPlaceDetails`, `searchNearbyCourts` (10km default) |
| `superwallPlacements` | Paywall placement name constants |
| `constants` | App-wide configuration constants |

## Commands

```bash
npm start              # Expo dev server
npm run ios            # iOS simulator
npm run android        # Android emulator
npm test               # Jest unit tests
npm run typecheck       # tsc --noEmit

# Cloud Functions
cd functions && npm run build    # Compile TypeScript
cd functions && npm run deploy   # Deploy to Firebase

# Ship to TestFlight (iOS + watchOS)
./scripts/release.sh
# Then in Xcode Organizer:
#   1. Select the PickleGo archive
#   2. Click "Distribute App"
#   3. Select "App Store Connect" → "Upload"
#   4. Let Xcode handle signing automatically
#   5. Click "Upload"
```

## Apple Watch App

### Architecture
The watch app lives in `watch/` (source of truth) and gets copied to `ios/PickleGoWatch/` during prebuild. It's a SwiftUI app with SwiftData persistence, built for watchOS 10+.

- **Scoring**: `watch/Engine/ScoreEngine.swift` — side-out scoring with serve tracking, win-by-2, undo
- **Views**: `GamesSummaryView`, `MatchSummaryView`, `FirstServeView`, `ScoringView`, `MatchListView`
- **Sync**: `watch/Sync/WatchSessionManager.swift` — WatchConnectivity (applicationContext, sendMessage, transferUserInfo, App Group file fallback)
- **Theme**: `PickleGoColors`, `PickleGoTypography` — mirrors phone app's brand palette
- **Assets**: Pete mascot (dynamic, coach variants), AppIcon, Fredoka fonts (Regular, Medium, SemiBold, Bold)
- **Phone bridge**: `modules/watch-sync/` — Expo native module bridging WatchConnectivity to React Native
- **Config plugin**: `plugins/withWatchTarget.js` — auto-creates watchOS target during `expo prebuild`
- **Build fixup**: `scripts/fix-watch-target.rb` — fixes Xcode file references, adds embed phase, configures scheme
- **Tests**: `ScoreEngineTests`

### Build Pipeline (IMPORTANT)

**Ship to TestFlight / App Store:**
```bash
./scripts/release.sh
```
Then in Xcode Organizer: "Distribute App" → "App Store Connect" → "Upload" → let Xcode handle signing → "Upload".

That's it. The script handles prebuild, watch target setup, and archiving automatically.

**How it works under the hood:**
1. `expo prebuild --clean` — creates fresh iOS project, config plugin adds watch target
2. `ruby scripts/fix-watch-target.rb` — fixes file references, adds embed script phase, removes watch from scheme
3. `xcodebuild archive -destination generic/platform=iOS` — builds the iOS app. The embed script phase separately builds the watch target with `-sdk watchos` and copies it into `PickleGo.app/Watch/`
4. Opens Xcode Organizer — Xcode re-signs with the distribution cert during upload

**Why it works this way:**
- EAS Build cannot handle watchOS targets (forces iOS SDK on all scheme targets)
- `xcodebuild -exportArchive` (CLI) rejects archives with `productType=application` watch companions
- Xcode Organizer handles the re-signing and upload correctly
- The watch target is NOT in the scheme — it's built by a script phase with `-sdk watchos` to avoid SDK conflicts

**After `expo prebuild --clean`, you MUST run:**
```bash
ruby scripts/fix-watch-target.rb
```
Without this, the watch app won't compile or embed. The release script does this automatically.

**For simulator testing (phone only):**
```bash
npx expo prebuild --platform ios --clean
ruby scripts/fix-watch-target.rb
# Build via Xcode or xcodebuild — simulator builds skip the watch target automatically
```

**For simulator testing (phone + watch):**
```bash
npx expo prebuild --platform ios --clean
ruby scripts/fix-watch-target.rb
# Build watch separately for watchOS simulator
xcodebuild -project ios/PickleGo.xcodeproj -target PickleGoWatch -sdk watchsimulator ONLY_ACTIVE_ARCH=NO build
# Symlink App Group containers (simulators have separate filesystems)
./scripts/sim-watch-override.sh
```

### Key Constraints
- `watch/` is the source of truth — never edit files in `ios/PickleGoWatch/` (overwritten on prebuild)
- The watch target uses `productType = application` (not `watchapp2`) — `watchapp2` causes "Multiple commands produce" errors during archive
- The watch target is NOT in the Xcode scheme — adding it causes SDK conflicts with `-destination generic/platform=iOS`
- The embed phase is a shell script that builds the watch target separately with `-sdk watchos`
- `xcodebuild -exportArchive` does NOT work via CLI — use Xcode Organizer for upload
- Watch app version is synced from `app.config.ts` by the config plugin
- Distribution signing happens during Xcode Organizer upload, not during archive

## Conventions

- Use `StyleSheet.create()` for styling — no inline styles for anything reused
- Use theme tokens from `src/theme/` for colors, spacing, typography, shadows — never hardcode values
- Components use props-based API; compose via children, not inheritance
- Haptic feedback via `useHaptic()` hook on interactive elements
- Animations via Reanimated shared values and layout animations
- Icons from `lucide-react-native` via `Icon` component wrapper (strokeWidth=3)
- Phone numbers must be normalized and hashed before storage
- Firestore writes use `stripUndefined()` to remove undefined fields
- Cloud Functions use transactions for operations requiring atomicity
- All callable functions use `authenticatedCallable()` wrapper with token refresh
- Accessibility: all interactive elements have `accessibilityRole`, `accessibilityLabel`, `accessibilityHint`

## Testing

- Jest with jest-expo preset
- Tests in `src/__tests__/`
- Focus areas: match lifecycle, score validation, stats calculation
- Run: `npm test`

## Environment

- Config via `.env` with `EXPO_PUBLIC_*` prefix (see `.env.example`)
- Firebase project: `picklego-1c5c7`
- iOS bundle / Android package: `com.picklego.picklego`
- EAS project ID: `5ab7653e-2d17-4fb1-9f19-ad2c2c5bc710`
- Required env vars: Firebase config (API_KEY, AUTH_DOMAIN, PROJECT_ID, STORAGE_BUCKET, MESSAGING_SENDER_ID, APP_ID, MEASUREMENT_ID), GOOGLE_PLACES_API_KEY, GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_URL_SCHEME, SUPERWALL_IOS_API_KEY, APPSFLYER_DEV_KEY
