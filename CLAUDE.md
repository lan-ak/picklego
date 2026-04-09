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
```

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
