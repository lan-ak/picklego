# PickleGo

Pickleball match tracking and social app built with React Native (Expo) and Firebase.

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
- **Monetization**: Superwall (paywall placements)
- **Fonts**: Fredoka (primary), Bungee, Poppins

## Project Structure

```
src/
  components/       # Reusable UI components (Button, Card, MatchCard, PlayerSlots, etc.)
  screens/          # Screen implementations (18 screens)
    onboarding/     # 6-step onboarding flow
  navigation/       # Stack + tab navigators, navigationRef
  context/          # DataContext (main state), ToastContext
  config/           # firebase.ts (API layer ~600 lines), venueFirestore.ts
  services/         # appsflyer, pushNotifications, placesService, superwallPlacements
  hooks/            # 16 custom hooks (useContacts, useVenues, useHaptic, animations, etc.)
  types/            # TypeScript definitions (Player, Match, Game, MatchNotification, etc.)
  utils/            # statsCalculator, phone, deepLink, shareMatch, ids, dateFormat, shuffleTeams
  theme/            # colors, typography, spacing, shadows, layout, animation
  assets/           # Images
  __tests__/        # Unit tests (matchLifecycle, scoreValidation, statsCalculator)
functions/          # Firebase Cloud Functions (src/index.ts ~1700 lines)
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

### State Management (DataContext)
- Single context provider holds: players, matches, currentUser, notifications, openMatches
- Persisted to AsyncStorage with 300ms debounce
- Uses refs for stable callback patterns (avoids re-renders)
- Uses `unstable_batchedUpdates` for performance

### Firebase Collections
- `players/{id}` — user profiles, stats, connections, push tokens
- `matches/{id}` — match records with teams, scores, scheduling
- `notifications/{id}` — match invites, updates, cancellations (scoped to sender/recipient)
- `smsInvites/{id}` — SMS invitation tracking
- `venues/{id}` — user-saved court locations

### Cloud Functions (functions/src/index.ts)
Callable: `acceptPlayerInvite`, `claimPlaceholderProfile`, `createSMSInvite`, `claimSMSInvite`, `lookupPhoneNumbers`, `joinOpenMatch`, `leaveOpenMatch`, `cancelOpenMatch`, `deleteAccount`

Triggers: `sendPushOnNotificationWrite`, `createNotificationsOnMatchCreate`, `createNotificationsOnMatchUpdate`, `recalculateStatsOnMatchUpdate`

Scheduled: `expireOpenMatches` (hourly)

### Key Patterns
- **Placeholder profiles**: SMS invites create `pendingClaim=true` players, merged via `claimPlaceholderProfile` Cloud Function when user signs up
- **Phone privacy**: Phone numbers stored as SHA-256 hashes, lookups done server-side
- **Soft deletes**: Matches use `deletedByPlayerIds[]` instead of hard delete
- **Idempotent notification IDs**: Deterministic ID generation prevents duplicates
- **Deep linking**: AppsFlyer OneLink for SMS invites and open match sharing
- **Open matches**: Public matches with player pool, auto-randomized teams when full

## Core Data Models

```typescript
Player { id, name, email, phoneNumber, profilePic, rating, stats, connections[], pendingConnections[], pushTokens[], notificationPreferences, authProvider, pendingClaim, invitedBy }

Match { id, createdBy, matchType ('singles'|'doubles'), pointsToWin, numberOfGames, scheduledDate, location, locationCoords, status ('scheduled'|'completed'|'expired'), team1PlayerIds[], team2PlayerIds[], allPlayerIds[], games[], winnerTeam, isOpenInvite, openInviteStatus, playerPool[], maxPlayers, deletedByPlayerIds[] }

Game { team1Score, team2Score, winnerTeam (1|2), team1PlayerIds[], team2PlayerIds[] }

MatchNotification { id, type, status, recipientId, senderId, matchId, team }
```

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
- **Sync**: `watch/Sync/WatchSessionManager.swift` — WatchConnectivity (applicationContext, sendMessage, transferUserInfo, App Group file fallback)
- **Phone bridge**: `modules/watch-sync/` — Expo native module bridging WatchConnectivity to React Native
- **Config plugin**: `plugins/withWatchTarget.js` — auto-creates watchOS target during `expo prebuild`
- **Build fixup**: `scripts/fix-watch-target.rb` — fixes Xcode file references, adds embed phase, configures scheme

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
./scripts/link-sim-appgroup.sh
```

### Key Constraints
- `watch/` is the source of truth — never edit files in `ios/PickleGoWatch/` (overwritten on prebuild)
- The watch target uses `productType = application` (not `watchapp2`) — `watchapp2` causes "Multiple commands produce" errors during archive
- The watch target is NOT in the Xcode scheme — adding it causes SDK conflicts with `-destination generic/platform=iOS`
- The embed phase is a shell script that builds the watch target separately with `-sdk watchos`
- `xcodebuild -exportArchive` does NOT work via CLI — use Xcode Organizer for upload
- Watch app version is synced from `app.config.ts` by the config plugin
- Distribution signing happens during Xcode Organizer upload, not during archive

## Theme System

- **Colors**: Primary green (#4CAF50), Action yellow (#FFC107), Court blue (#2196F3)
- **Typography**: Fredoka font, semantic styles (h1-h3, body, bodySmall, caption, stats)
- **Spacing**: xs/sm/md/lg/xl/xxl/xxxl scale
- **Shadows**: sm/md/fab presets
- All in `src/theme/` — always use theme tokens, not hardcoded values

## Conventions

- Use `StyleSheet.create()` for styling — no inline styles for anything reused
- Use theme tokens from `src/theme/` for colors, spacing, typography, shadows
- Components use props-based API; compose via children, not inheritance
- Haptic feedback via `useHaptic()` hook on interactive elements
- Animations via Reanimated shared values and layout animations
- Icons from `lucide-react-native`
- Phone numbers must be normalized and hashed before storage
- Firestore writes use `stripUndefined()` to remove undefined fields
- Cloud Functions use transactions for operations requiring atomicity
- All callable functions use `authenticatedCallable()` wrapper with token refresh

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
