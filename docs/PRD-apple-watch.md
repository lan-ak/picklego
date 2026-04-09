# PickleGo Apple Watch App -- Product Requirements Document

## Context

PickleGo currently requires players to enter scores **after** a match on the phone (via CompleteMatchScreen). This is friction-heavy and error-prone -- players forget exact scores, debate what happened, or simply skip logging. An Apple Watch app lets any player keep score **live during the game** with minimal interaction, using large tap targets and the Digital Crown. The watch app is local-only, syncs to the phone via WatchConnectivity, and works fully standalone once a match is loaded.

The main app is React Native (Expo 54, RN 0.81.5) with Firebase. The iOS project uses Expo managed workflow with bare iOS output (`expo prebuild`), CocoaPods, and New Architecture enabled. Since RN does not support watchOS, the watch app is a **native SwiftUI target** added to the existing Xcode project under `ios/`.

---

## 1. Goals & Non-Goals

### Goals
- Live rally-by-rally score keeping with **traditional side-out scoring** (only serving team can score)
- Full serve tracking: 1st/2nd server in doubles, single server in singles, first-team-gets-one-serve rule
- Tap-based input (only input method for scoring): tap the team that won the rally. Watch determines if it's a point or side-out. Digital Crown disabled during scoring to keep rally log in sync
- Multi-game match support (best-of-1, best-of-3, best-of-5) with automatic game transitions
- Full rally log stored and synced back with match data (enables future replay/analytics)
- Matches created on the phone, synced to watch for scoring
- Watch-to-phone sync of completed scores + rally log back to Firebase
- Always-On Display during active games -- dimmed score and serve state visible at a glance without wrist-raise
- Local-only operation on watch -- no network calls, works without phone nearby once match is loaded
- Any player in the match can keep score; last write wins on conflicts

### Non-Goals (Explicitly Out of Scope for v1)
- Quick match creation on the watch (matches must originate from the phone)
- Rally scoring mode (every rally = point regardless of serve) -- v2 option
- Player management, authentication, or profile features on watch
- Match editing (teams, date, location) on watch
- Notifications or social features on watch
- Stats / match history viewing on watch
- Venue / court discovery on watch
- Complications or Siri integration (v2)
- Team shuffling per game (`randomizeTeamsPerGame`)
- Timer or game clock

---

## 2. User Flows

### A. Match Appears on Watch
1. User creates a match on the phone (existing AddMatchScreen flow)
2. Phone syncs scheduled matches to watch via `WCSession.updateApplicationContext`
3. User opens watch app -> **Match List** shows synced scheduled matches

### B. Start Scoring
1. User taps a match on the Match List
2. **"Who serves first?"** screen appears with two buttons (Team 1 / Team 2)
3. User taps the team that will serve first
4. **Scoring screen** appears with team names, scores at 0-0, and serve indicator on the selected team

### C. Score Rallies (Side-Out Scoring)
1. Two large tap zones on screen, one per team
2. **Tap the team that won the rally**:
   - If the **serving team** won: +1 point for them, they keep serving
   - If the **receiving team** won: **side-out** -- serve switches, no point scored
3. **Doubles server tracking**: each team gets 2 servers per possession (1st server, then 2nd server). Side-out happens after 2nd server loses a rally. Exception: first team of the game only gets 1 server
4. **Singles**: each team gets 1 server per possession
5. **On-screen "Undo" button** reverts the last rally (restores previous score AND serve state)
6. When game-winning condition is met (score >= pointsToWin AND lead >= 2): haptic buzz, **Game Over confirmation** appears inline -- user must tap "Confirm" to finalize
7. Every rally is recorded in the **rally log** for sync to phone

### D. Game Transitions (Multi-Game)
1. After game-over confirmation, if more games remain and no team has won the majority:
   - Auto-advance to next game with scores reset to 0-0
   - **"Who serves first?"** screen appears again for the new game (teams typically alternate)
   - Game indicator updates ("Game 2 of 3")
   - Swipe left from scoring screen to see **Games Summary** (completed game scores)
2. Match ends when a team wins the majority of games (e.g., 2 of 3)

### E. End Match
1. When deciding game is won and confirmed -> **Match Summary** shows winner, per-game scores, and total rally count
2. Tap "Done" -> saves locally (including rally logs for all games), queues sync to phone, returns to Match List
3. If phone is reachable, sync fires immediately; otherwise queues via `transferUserInfo`

### F. Undo
1. Tap on-screen "Undo" button -> reverts the last rally (restores score, serve state, and server number)
2. No rallies yet -> button is disabled/dimmed
3. Multi-level undo: can undo back to 0-0 (rally log acts as undo stack)

### G. Resume In-Progress Match
1. If the watch app is backgrounded/terminated during scoring, SwiftData preserves state
2. On next launch, Match List shows "In Progress" badge on the active match
3. Tapping it resumes scoring exactly where the user left off

---

## 3. Screens

### Screen 1: Match List (Root)
```
+---------------------------+
|       PickleGo            |
+---------------------------+
| [Match Row]               |
|   "Me & John vs Sarah"    |
|   "Today 4:00 PM"         |
|   [In Progress] badge     |
+---------------------------+
| [Match Row]               |
|   "Singles vs Mike"        |
|   "Tomorrow 6:00 PM"      |
+---------------------------+
```
- Header: "PickleGo" with small app icon
- List of synced scheduled matches (team names, date/time)
- "In Progress" badge on any active match
- Empty state: "No matches -- create one in the PickleGo app"
- Crown scrolls the list
- Long-press a match row to delete it from the watch

### Screen 2: First Serve Selection
```
+---------------------------+
|   Who serves first?       |
+---------------------------+
|                           |
|   +------------------+    |
|   |     Team 1       |    |
|   +------------------+    |
|                           |
|   +------------------+    |
|   |     Team 2       |    |
|   +------------------+    |
|                           |
+---------------------------+
```
- Two large buttons, one per team
- Shown once per match, before scoring begins
- Selection sets initial serve state and (in doubles) marks as "1st server only" for the starting team

### Screen 3: Scoring (Primary Gameplay)
```
+---------------------------+
|       7 - 5 - 2           |  <- Large score callout (24pt+)
|     Game 1 of 3            |  <- Game indicator
+---------------------------+
|                           |
| +-------+    +-------+   |
| | TEAM 1|    | TEAM 2|   |
| |       |    |       |   |
| |   7   |    |   5   |   |
| |   ●   |    |       |   |  <- Green dot under serving team
| +-------+    +-------+   |
|                           |
| Tap team that won rally   |
|        [ Undo ]           |
+---------------------------+
```
- **Large score callout** at top in traditional pickleball format: `serving score - receiving score - server number` (e.g., "7-5-2" means serving team has 7, receiving has 5, 2nd server). 24pt+ font, prominent and readable at a glance
- **Game indicator** below score callout: "Game 1 of 3"
- **Two large tap zones** fill most of the screen, one per team
- Team name above, large score digit below (40pt+)
- **Serve indicator**: Pickle Green `#4CAF50` filled circle (●) displayed under the serving team's score. Serving team's zone also has a strong Pickle Green border/highlight. No text label -- the dot and color are sufficient. No custom assets needed
- **Tap = record rally winner**, NOT add a point:
  - Tap serving team = +1 point for them, serve stays
  - Tap receiving team = side-out (serve switches, no point). In doubles: advances to 2nd server first, then side-out after 2nd server loses
- **Digital Crown disabled** on scoring screen -- tap-to-record-rally is the only scoring input. This prevents log/score mismatches and keeps a single clear input model. Crown is only used for scrolling on Match List
- **"Undo" button** at bottom, disabled when no rallies recorded. Undoes last rally fully (score + serve state)
- Team names truncate to first name or abbreviation
- Black background (standard watchOS dark)
- Brief flash animation on side-out (green dot moves to other team) to confirm what happened

### Always-On Display (Active Game Only)
```
+---------------------------+
|                           |
|       7 - 5 - 2           |  <- Dimmed score callout
|                           |
|     Game 1 of 3            |
|                           |
|    7         5             |  <- Dimmed scores, no tap zones
|    ●                       |  <- Dimmed serve indicator
|                           |
+---------------------------+
```
- **Only shown during an active game** (when `status == "active"` and scoring screen is visible)
- Triggered when wrist is lowered (`.inactive` scene phase)
- Shows scores and serve state in dimmed/reduced-luminance mode
- **No interactive elements** -- prevents accidental taps when screen is dimmed
- No animations, no timers -- minimal power draw per Apple guidelines
- On wrist-raise, full scoring screen resumes immediately
- Not shown on Match List, First Serve, or Match Summary screens (standard watchOS dim behavior for those)

### Game Over (Inline Overlay on Scoring Screen)
```
+---------------------------+
|                           |
|    Game Complete!         |
|                           |
|    Team 1 Wins            |
|    11 - 8                 |
|                           |
|  [Confirm]    [Cancel]    |
+---------------------------+
```
- Appears as an overlay on the scoring screen (not a separate navigation)
- Strong haptic notification
- **"Confirm"** finalizes the game. If more games remain and no team has won the majority, transitions to First Serve screen for the next game. If this was the deciding game, transitions to Match Summary
- **"Cancel"** dismisses the overlay and returns to scoring (e.g., to fix a mis-tap)

### Games Summary (Swipe-Left from Scoring)
```
+---------------------------+
|    Games                  |
+---------------------------+
|  Game 1:  11 - 8  ✓ T1   |
|  Game 2:  9 - 11  ✓ T2   |
|  Game 3:  in progress     |
+---------------------------+
```
- Accessible by swiping left from the Scoring screen
- Shows completed game scores with winner indicator
- Crown scrolls if list is long

### Screen 5: Match Summary
```
+---------------------------+
|    Match Complete!        |
+---------------------------+
|    Winner: Team 1  (2-1)  |
+---------------------------+
|  Game 1:  11 - 8          |
|  Game 2:  9 - 11          |
|  Game 3:  11 - 6          |
|  47 rallies               |
+---------------------------+
|    Syncing...  /  Synced  |
|       [ Done ]            |
+---------------------------+
```
- Winner highlighted in Pickle Green with game wins (e.g., "2-1")
- Per-game scores listed
- Total rally count across all games
- Sync status indicator (syncing/synced/pending)
- **"Done"** pops to Match List

---

## 4. Input Mappings

| Input | Context | Action |
|---|---|---|
| Tap Team 1/2 button | First Serve | Set initial serving team, proceed to Scoring |
| Tap left zone | Scoring | Team 1 won this rally (point if serving, side-out if receiving) |
| Tap right zone | Scoring | Team 2 won this rally (point if serving, side-out if receiving) |
| Crown | Scoring | **Disabled** -- tap is the only scoring input to keep rally log in sync |
| Tap "Undo" | Scoring | Revert last rally (score + serve state restored from rally log) |
| Tap "Confirm" | Game Over overlay | Finalize game, go to Match Summary |
| Tap "Cancel" | Game Over overlay | Return to scoring (fix mis-tap) |
| Tap "Done" | Match Summary | Save, sync rally log + scores, return to Match List |
| Crown rotate | Match List | Scroll list |
| Long-press row | Match List | Delete match from watch |

Haptics: light tick on point scored, medium buzz on side-out, strong notification on game-over.

---

## 5. Data Model (On-Watch, SwiftData)

### WatchMatch
```swift
@Model class WatchMatch {
    var id: String                   // Watch-local UUID
    var phoneMatchId: String         // Firebase match ID from phone
    var matchType: String            // "singles" | "doubles"
    var pointsToWin: Int             // e.g., 11
    var numberOfGames: Int           // 1, 3, or 5
    var team1Label: String           // Display names from phone
    var team2Label: String
    var team1PlayerIds: [String]     // From phone, passed back on sync
    var team2PlayerIds: [String]
    var completedGames: [WatchGame]  // Finished games with scores + rally logs
    var currentGameIndex: Int        // 0-based index of current game
    var currentTeam1Score: Int       // Current in-progress game score
    var currentTeam2Score: Int
    var servingTeam: Int             // 1 or 2 -- which team is currently serving
    var serverNumber: Int            // 1 or 2 -- which server within the team (doubles)
    var isFirstServeOfGame: Bool     // True at game start (first team only gets 1 server)
    var currentRallyLog: [RallyEvent] // Rally log for current in-progress game
    var winnerTeam: Int?             // 1, 2, or nil (match winner)
    var status: String               // "scheduled" | "active" | "completed"
    var scheduledDate: Date          // For display in Match List
    var createdAt: Date
    var lastModifiedAt: Date
    var needsSync: Bool              // Dirty flag for pending sync to phone
}
```

### WatchGame (Codable, stored in WatchMatch.completedGames)
```swift
struct WatchGame: Codable {
    var team1Score: Int
    var team2Score: Int
    var winnerTeam: Int              // 1 or 2
    var team1PlayerIds: [String]?    // For randomizeTeamsPerGame compatibility (pass-through from phone)
    var team2PlayerIds: [String]?
    var rallyLog: [RallyEvent]       // Full rally log for this game
}
```

### RallyEvent (Codable, stored in WatchMatch.rallyLog)
```swift
struct RallyEvent: Codable {
    let rallyNumber: Int             // 1-based
    let rallyWinner: Int             // 1 or 2 -- team that won this rally (regardless of whether a point was scored)
    let type: String                 // "point" (serving team won) | "sideout" (receiving team won, serve switches)
    let team1Score: Int              // Score AFTER this rally
    let team2Score: Int
    let servingTeam: Int             // Who was serving DURING this rally
    let serverNumber: Int            // 1 or 2 (doubles); always 1 (singles)
    let timestamp: Date              // When this rally was recorded (for future pace/analytics)
}
```

**RallyEvent semantics**: `rallyWinner` always indicates which team won the rally. When `type == "sideout"`, the `rallyWinner` is the receiving team (they won the rally but no point is scored, serve switches). When `type == "point"`, the `rallyWinner` is the serving team (they won the rally and scored +1).

### Serve State Machine (ScoreEngine)

**Doubles side-out scoring:**
```
Game start:
  Team A serves, 1st server only (isFirstServeOfGame = true)
  → A wins rally: +1 point for A, A keeps serving
  → A loses rally: side-out to B (no "2nd server" for first serve)

Normal serve possession (after first side-out):
  Team serves with Server 1
  → Serving team wins: +1 point, Server 1 keeps serving
  → Serving team loses: advance to Server 2
    → Server 2 wins: +1 point, Server 2 keeps serving
    → Server 2 loses: side-out to other team's Server 1
```

**Singles side-out scoring:**
```
  Serving team serves (always server 1)
  → Serving team wins: +1 point, keep serving
  → Serving team loses: side-out to other team
```

### Undo (Rally Log as Undo Stack)
The rally log itself serves as a multi-level undo stack. To undo:
1. Pop the last `RallyEvent` from `rallyLog`
2. Restore `team1Score`, `team2Score` from the previous event (or 0-0 if empty)
3. Restore `servingTeam` and `serverNumber` from the popped event's serving state (since that was the state DURING that rally)
4. Rally log persists in SwiftData, so undo survives app backgrounding

### Mapping to Phone Model

| Phone (`Match` in [types/index.ts](src/types/index.ts)) | Watch (`WatchMatch`) |
|---|---|
| `id` | `phoneMatchId` |
| `matchType` | `matchType` (1:1) |
| `pointsToWin` | `pointsToWin` (1:1) |
| `team1PlayerNames` joined | `team1Label` |
| `team2PlayerNames` joined | `team2Label` |
| `team1PlayerIds` | `team1PlayerIds` (1:1) |
| `team2PlayerIds` | `team2PlayerIds` (1:1) |
| `numberOfGames` | `numberOfGames` (1:1) |
| `games[]` | `completedGames[]` mapped to `WatchGame[]` |
| `games[n].team1Score` | `completedGames[n].team1Score` |
| `games[n].team2Score` | `completedGames[n].team2Score` |
| `games[n].winnerTeam` | `completedGames[n].winnerTeam` |
| `games[n].rallyLog` (NEW) | `completedGames[n].rallyLog` (NEW) |
| `winnerTeam` | `winnerTeam` (match winner -- team with majority of game wins) |
| `status` | `status` (mapped: phone `scheduled` -> watch `scheduled`; watch `active` is local-only, **never synced to Firestore**; watch `completed` -> phone `completed`) |
| `scheduledDate` (ISO string) | `scheduledDate` (Date) -- **type conversion required**: phone stores as ISO 8601 string, watch stores as Date. Sync bridge must convert with timezone awareness |

### Phone-Side Data Model Change
The existing `Game` interface in [types/index.ts](src/types/index.ts) (L67-73) needs a new optional field:
```typescript
export interface Game {
  team1Score: number;
  team2Score: number;
  winnerTeam: 1 | 2;
  team1PlayerIds?: string[];
  team2PlayerIds?: string[];
  rallyLog?: RallyEvent[];  // NEW -- optional, only present for watch-scored games
}

interface RallyEvent {
  rallyNumber: number;
  rallyWinner: 1 | 2;       // Team that won the rally (not necessarily who scored)
  type: 'point' | 'sideout'; // 'point' = serving team won, 'sideout' = receiving team won
  team1Score: number;         // Score AFTER this rally
  team2Score: number;
  servingTeam: 1 | 2;
  serverNumber: 1 | 2;
  timestamp: number;          // Unix timestamp (ms) for pace/analytics
}
```
This is backwards-compatible -- phone-scored games (CompleteMatchScreen) won't have `rallyLog`, watch-scored games will.

### Rally Log Data Flow (Watch -> Phone -> Firestore -> Analytics)
```
Watch ScoreEngine              Phone DataContext              Firestore
  records each rally    ->    receives via PhoneSyncBridge   ->  stored on Game document
  as RallyEvent[]             calls updateMatch()               in games[n].rallyLog
  with serve state,           (includes rallyLog in             persisted permanently
  scores, timestamps          games[] payload)                  for future analytics
```
- **Every rally** is captured: points scored, side-outs, serve state, server number, timestamp
- Rally log is stored **permanently in Firestore** as part of the `games[]` array on the Match document
- This enables future v2 analytics: serve efficiency, side-out %, scoring runs, pace of play, rally-by-rally replay
- Document size is not a concern (~30KB for a long best-of-5 match, well within Firestore's 1MB limit)
- Phone-scored games (entered via CompleteMatchScreen) will NOT have `rallyLog` -- only watch-scored games include it

**Not stored on watch**: player profiles, photos, ratings, venues, notifications, auth tokens, stats, location, multi-game data.

---

## 6. Sync Strategy (WatchConnectivity)

### Phone -> Watch (Scheduled Matches)
- **API**: `WCSession.updateApplicationContext(_:)`
- **Trigger**: When `DataContext` refreshes matches (on app launch, match create/edit, pull-to-refresh)
- **Payload**: Complete array of the user's scheduled matches:
```json
{
  "scheduledMatches": [
    {
      "id": "firebase-match-id",
      "matchType": "doubles",
      "pointsToWin": 11,
      "numberOfGames": 3,
      "team1Label": "Me & John",
      "team2Label": "Sarah & Mike",
      "team1PlayerIds": ["uid1", "uid2"],
      "team2PlayerIds": ["uid3", "uid4"],
      "scheduledDate": "2026-03-30T16:00:00Z"
    }
  ],
  "currentUserId": "uid1",
  "timestamp": 1743350400
}
```
- Always sends the **full list** (applicationContext replaces previous, not incremental)
- Watch replaces its synced match list on receipt, preserving any "active" matches

### Watch -> Phone (Completed Match)
- **Primary**: `WCSession.sendMessage(_:)` for immediate delivery if phone is reachable
- **Fallback**: `WCSession.transferUserInfo(_:)` for guaranteed queued delivery when phone is unreachable
- **Payload**:
```json
{
  "action": "matchCompleted",
  "match": {
    "phoneMatchId": "firebase-match-id",
    "games": [
      {
        "team1Score": 11, "team2Score": 8, "winnerTeam": 1,
        "rallyLog": [
          { "rallyNumber": 1, "rallyWinner": 1, "type": "point", "team1Score": 1, "team2Score": 0, "servingTeam": 1, "serverNumber": 1 },
          { "rallyNumber": 2, "rallyWinner": 2, "type": "sideout", "team1Score": 1, "team2Score": 0, "servingTeam": 2, "serverNumber": 1 }
        ]
      },
      {
        "team1Score": 9, "team2Score": 11, "winnerTeam": 2,
        "rallyLog": [...]
      },
      {
        "team1Score": 11, "team2Score": 6, "winnerTeam": 1,
        "rallyLog": [...]
      }
    ],
    "winnerTeam": 1,
    "completedAt": 1743352000
  }
}
```

### Phone-Side Handling
New `PhoneSyncBridge` (built with **Expo Modules API** for consistency with Expo stack) receives the payload and emits a JS event. DataContext listens for this event and:
- Calls existing `updateMatch(phoneMatchId, { status: 'completed', winnerTeam, games, lastModifiedAt, lastModifiedBy })` (DataContext L727)
- **IMPORTANT**: must go through DataContext's `updateMatch`, NOT `updateMatchDocument` directly. `updateMatch` handles: local state update, Firestore persistence, and stats recalculation (L757-764). Calling Firestore directly would bypass stats and local state
- The `status` sent to Firestore must be `'completed'`, never `'active'` (the phone app does not recognize `'active'` status)
- **Idempotency**: check `lastModifiedAt` -- if the match was already completed with a newer timestamp, skip the update

### Conflict Resolution
- **Last write wins** via `lastModifiedAt` timestamp (matches existing `updateMatchDocument` behavior)
- If two players score on separate watches, the last sync to reach Firebase wins
- Acceptable per requirements

### Offline Resilience
- `transferUserInfo` queued by OS, delivered on reconnection
- Watch marks `needsSync = true` locally; UI never blocks on sync
- "Done" always succeeds locally
- Sync status shown on Match Summary screen (syncing/synced/pending)

---

## 7. Reused vs. New Work

### Reused from Existing Codebase

| What | Source | How |
|---|---|---|
| Color palette | [brand-kit.json](brand-kit.json) + [colors.ts](src/theme/colors.ts) | Port hex values to SwiftUI `Color` extensions. Use brand-kit.json as canonical source |
| Match/Game data model | [types/index.ts](src/types/index.ts) L65-100 | WatchMatch mirrors same fields (subset) |
| Score validation (win-by-2) | [CompleteMatchScreen.tsx](src/screens/CompleteMatchScreen.tsx) `validateScores()` | Port to Swift `ScoreEngine` -- same rules |
| Match winner determination | CompleteMatchScreen `determineMatchWinner()` | Same logic (simplified: single-game = game winner is match winner) |
| App icon | [Images.xcassets](ios/PickleGo/Images.xcassets/) | Derive watch icon from existing 1024x1024 source (only 1024x1024@1x currently exists) |
| Fredoka font | [brand-kit.json](brand-kit.json) + [typography.ts](src/theme/typography.ts) | **Note**: phone app loads Fredoka via `@expo-google-fonts/fredoka` npm package, NOT bundled .ttf files. For watchOS, must download Fredoka .ttf from Google Fonts (see `fonts.primary.source` in brand-kit.json) and bundle in watch target's Info.plist. Weights needed: Regular (400), Medium (500), SemiBold (600), Bold (700) |
| Firestore update flow | [firebase.ts](src/config/firebase.ts) `updateMatchDocument()` | Phone bridge calls existing function directly |
| Match creation flow | [AddMatchScreen.tsx](src/screens/AddMatchScreen.tsx) | Unchanged -- matches still created on phone |

### New Work (with Justification)

| What | Why |
|---|---|
| **watchOS target + SwiftUI views** (5 screens + 1 overlay + 1 swipe view) | RN doesn't support watchOS; native target required. Screens: Match List, First Serve Selection, Scoring, Games Summary (swipe), Match Summary + Game Over overlay |
| **Expo config plugin for watchOS target** | Required so `expo prebuild` doesn't clobber the watch target. Must also add App Groups entitlement to both targets, embed watch app binary, and work with EAS Build. No `plugins/` directory exists yet |
| **SwiftData models** (WatchMatch + RallyEvent) | Watch needs local persistence with rally log; cannot use Firebase SDK on watch |
| **ScoreEngine.swift** (side-out scoring + serve tracking) | Full pickleball serve state machine: 1st/2nd server in doubles, first-team-gets-one-serve rule, side-out logic. Entirely new -- phone app has no serve tracking. Built as a Swift protocol (`ScoringEngine`) with `SideOutScoringEngine` implementation, so v2 can add `RallyScoringEngine` without refactoring |
| **RallyEvent type + `rallyLog` field on Game** | New optional field on existing `Game` interface in [types/index.ts](src/types/index.ts). Backwards-compatible (phone-scored games won't have it). Enables future replay/analytics |
| **WatchSessionManager** (watch-side WCSessionDelegate) | No WatchConnectivity code exists in the codebase |
| **PhoneSyncBridge** (phone-side, Expo Modules API) | Bridge between native WCSession and RN DataContext. Built with Expo Modules API (not raw RCTBridgeModule) for compatibility with Expo managed workflow |
| **Haptic feedback** (inline calls) | Light tick on point, medium buzz on side-out, strong notification on game-over. Different haptics distinguish point vs side-out |
| **Always-On Display** (scoring screen only) | Dimmed score + serve state visible during active game without wrist-raise. Uses `.onChange(of: scenePhase)` to switch views. No interactive elements in dimmed mode. Only active during scoring, not on other screens |

---

## 8. Technical Architecture

### Project Structure
```
ios/
  PickleGo/                          # Existing RN iOS app
  PickleGoWatch/                     # NEW: watchOS app target
    PickleGoWatchApp.swift           # @main SwiftUI app entry
    Views/
      MatchListView.swift            # Screen 1
      FirstServeView.swift           # Screen 2 -- who serves first?
      ScoringView.swift              # Screen 3 + game-over overlay
      GamesSummaryView.swift         # Swipe-left from scoring: completed game scores
      MatchSummaryView.swift         # Screen 5
    Models/
      WatchMatch.swift               # SwiftData @Model
      RallyEvent.swift               # Codable struct for rally log
    Engine/
      ScoreEngine.swift              # Side-out scoring, serve tracking, win-by-2
    Sync/
      WatchSessionManager.swift      # WCSessionDelegate (watch side)
    Theme/
      PickleGoColors.swift           # Color extensions
      PickleGoTypography.swift       # Font definitions
    Assets.xcassets/                 # Watch app icon
modules/
  watch-sync/                        # NEW: Expo Module (phone side)
    ios/
      PhoneSyncBridge.swift          # WCSession phone-side handler
    src/
      index.ts                       # JS API for DataContext
    expo-module.config.json
plugins/
  withWatchTarget.js                 # NEW: Expo config plugin
```

### Current iOS Project State
- **Single target**: `PickleGo` (com.picklego.picklego) -- no watch target exists yet
- **iOS deployment target**: 16.0 (set via `expo-build-properties` plugin in [app.config.ts](app.config.ts))
- **AppDelegate**: `ExpoAppDelegate` subclass with AppsFlyer attribution and deep linking ([AppDelegate.swift](ios/PickleGo/AppDelegate.swift))
- **Bridging header**: exists at `ios/PickleGo/PickleGo-Bridging-Header.h` (currently imports `RNAppsFlyer.h`)
- **Entitlements**: Apple Sign-In, Push Notifications, Associated Domains (deep linking). **No App Groups** -- must add for WatchConnectivity
- **No custom native modules**: project has zero custom Swift/ObjC modules beyond Expo boilerplate
- **New Architecture**: enabled (`RCTNewArchEnabled: true`)
- **9 config plugins** already active in app.config.ts (expo-build-properties, expo-font, expo-image-picker, expo-location, expo-notifications, expo-apple-authentication, expo-contacts, react-native-appsflyer, google-signin)
- **No `modules/` or `plugins/` directories** exist yet
- **EAS Build**: used for CI/CD (dev, preview, production profiles in [eas.json](eas.json))

### Key Technical Decisions

- **watchOS 10+**: enables SwiftData, modern navigation APIs, `.digitalCrownRotation` detents
- **Watch bundle ID**: `com.picklego.picklego.watchkitapp` (child of main app bundle)
- **App Groups entitlement**: must add `group.com.picklego.picklego` to both iOS app and watch target for WatchConnectivity shared data
- **Expo Modules API** for PhoneSyncBridge: consistent with Expo stack and New Architecture. Avoids raw Objective-C bridging. Supports Swift-native authoring with TypeScript type generation. This is the project's **first native module**
- **Expo config plugin** (`withWatchTarget.js`): modifies `.xcodeproj` during `expo prebuild` to add the watch target, build settings, embedded binary, and App Groups entitlement. Without this, every `expo prebuild` or `pod install` will destroy the watch target. Must also work with **EAS Build**
- **SwiftData** over UserDefaults: structured data with type safety. 10 fields, not 18+
- **Rally log as undo stack**: the persisted rally log doubles as a multi-level undo stack. Pop last event to undo. Survives app backgrounding via SwiftData
- **Side-out scoring is new logic**: the phone app has zero serve tracking. ScoreEngine.swift is entirely new (not a port), though win-by-2 detection is ported from JS. Built as `ScoringEngine` protocol with `SideOutScoringEngine` implementation for v2 extensibility (rally scoring mode)
- **Inline game-over overlay**: not a separate screen/navigation. 5 screens total (Match List, First Serve, Scoring, Games Summary swipe, Match Summary)
- **Match winner**: determined when a team wins the majority of games (e.g., 2 of 3). Match ends early -- no need to play remaining games
- **Fredoka font**: must be downloaded from Google Fonts and bundled as .ttf in watch target (phone uses `@expo-google-fonts/fredoka` npm package which is not available on watchOS)

### WCSession Lifecycle (Phone Side)
- `WCSession` activated in `AppDelegate` (currently an `ExpoAppDelegate` subclass with AppsFlyer) via the Expo config plugin modifying `didFinishLaunchingWithOptions`
- PhoneSyncBridge listens for `didReceiveMessage` and `didReceiveUserInfo`
- Incoming messages queued if RN bridge not ready, flushed on JS listener registration
- Thread safety: delegate callbacks on background thread, dispatch to main/JS thread for event emission

---

## 9. Edge Cases

| Scenario | Handling |
|---|---|
| **Phone not nearby** | Watch functions fully once match is loaded. Completed matches queue via `transferUserInfo`, sync on reconnect |
| **App backgrounded mid-game** | SwiftData saves on every score change. Resumes exactly where left off on wake. If terminated by OS, restores from SwiftData |
| **Two players scoring same match** | Each scores on their own phone+watch pair. Last `updateMatchDocument` to Firebase wins. Both watches operate independently |
| **Match completed on phone while active on watch** | Next `applicationContext` update removes the match from scheduled list. If watch has it "active", watch keeps local state but sync will use last-write-wins |
| **Accidental tap on wrong team** | Undo button restores full state (score + serve). Multi-level undo via rally log -- can undo back to 0-0 |
| **Accidental Crown input** | Crown is disabled on scoring screen. Tap is the only input. Use undo for corrections |
| **First serve of game rule** | ScoreEngine enforces: starting team only gets 1 server. `isFirstServeOfGame` flag cleared after first side-out |
| **Rally log size** | Typical game is 20-40 rallies. Even a long deuce game caps at ~80 rallies. Best-of-5 worst case ~400 rallies. Well within SwiftData and WatchConnectivity payload limits |
| **Multi-game early termination** | Match ends when a team wins majority (2 of 3, 3 of 5). Remaining games are not played. Match winner = team with more game wins |
| **Between-game serve selection** | First Serve screen shown before each game. In competitive play, teams typically alternate first serve -- but user picks to match reality |
| **Match abandoned on watch** | Stays "active" in SwiftData, shows "In Progress" badge. Long-press to delete from watch. Phone match unaffected |
| **Phone app not installed** | `WCSession.isSupported` check; watch shows empty state with guidance |
| **Duplicate sync delivery** | Phone-side idempotency check: if match already completed with newer `lastModifiedAt`, skip update |
| **`active` status must not reach Firestore** | Phone app only recognizes `scheduled`/`completed`/`expired`. Watch's `active` status is local-only. Sync bridge must map to `completed` when sending back. If `active` leaked to Firestore, matches would disappear from phone UI |
| **expo prebuild clobbers watch target** | Expo config plugin (`withWatchTarget.js`) re-adds watch target on every prebuild. Must also survive `pod install` |
| **EAS Build compatibility** | Config plugin must work in EAS Build cloud environment, not just local builds. Test with `eas build --platform ios --profile preview` |
| **Fredoka font missing on watch** | Fallback to system font. Must download Fredoka .ttf from Google Fonts (phone uses npm package, no .ttf in repo). Bundle in watch target Info.plist |
| **App Groups not configured** | Neither iOS app nor watch currently has App Groups entitlement. Config plugin must add `group.com.picklego.picklego` to both targets and update provisioning profiles |
| **Match deleted on phone while on watch** | Next `applicationContext` omits it. Watch removes from list (unless "active") |
| **Score display for deuce** | Layout validated for 2-digit scores on both sides (e.g., "15-13"). Score capped at 99 |
| **Game-over at exactly pointsToWin** | ScoreEngine checks: `max >= pointsToWin && max - min >= 2`. Handles deuce/extended play correctly |
| **No VoiceOver specified** | Must add: accessibility labels on tap zones ("Team 1 score: 7, tap to add point"), score announcements on change, game-over announcement. Required for App Store |

---

## 10. Implementation Phases

### Phase 1: Watch App Shell
1. Create `plugins/` directory and Expo config plugin (`withWatchTarget.js`) to add watchOS target, App Groups entitlement, and embedded binary
2. Add `withWatchTarget` to plugins array in [app.config.ts](app.config.ts)
3. Create watchOS target (`PickleGoWatch`, bundle ID `com.picklego.picklego.watchkitapp`) with SwiftUI lifecycle
4. SwiftData model (WatchMatch)
5. Port color palette to SwiftUI `Color` extensions from [colors.ts](src/theme/colors.ts)
6. Download Fredoka .ttf from Google Fonts and bundle in watch target (phone uses `@expo-google-fonts/fredoka` npm package -- not available on watchOS)
7. Generate watch app icon from existing 1024x1024 source in [Images.xcassets](ios/PickleGo/Images.xcassets/)
8. Verify `expo prebuild` preserves watch target; verify EAS Build compatibility

### Phase 2: Scoring Core
9. ScoreEngine with full side-out scoring state machine:
   - Side-out logic (serving team scores, receiving team triggers side-out)
   - 1st/2nd server tracking in doubles
   - First-serve-of-game rule (starting team gets 1 server only)
   - Singles mode (1 server per possession)
   - Win-by-2 game-over detection (port from [scoreValidation.test.ts](src/__tests__/scoreValidation.test.ts))
   - XCTest cases for all serve transitions + scoring edge cases
10. RallyEvent model and rally log persistence
11. FirstServeView (who serves first?)
12. ScoringView with tap-to-record-rally zones + serve indicator + Crown manual adjustment
13. Game-over inline overlay with Confirm/Cancel
14. Multi-level undo via rally log (pop last event, restore full state)
15. Haptic feedback: light tick (point), medium buzz (side-out), strong (game-over)

### Phase 3: Multi-Game & Navigation
16. Game transition flow: game-over confirmation -> First Serve -> next game scoring
17. Games Summary swipe view (completed game scores)
18. Match winner determination (majority of games)
19. MatchListView with synced matches display + "In Progress" badge
20. MatchSummaryView with per-game scores and sync status
21. SwiftData persistence on every rally (scores + rally log + serve state)
22. Resume in-progress match on app relaunch (restore current game, serve state, rally log)
23. Always-On Display for active game (dimmed scores + serve state, no interactive elements)

### Phase 4: Sync
15. WatchSessionManager (watch-side WCSessionDelegate)
16. Create `modules/watch-sync/` directory and PhoneSyncBridge (Expo Modules API, phone side) -- this is the project's first native module
17. Activate WCSession in [AppDelegate.swift](ios/PickleGo/AppDelegate.swift) (alongside existing ExpoAppDelegate + AppsFlyer setup)
18. Wire [DataContext.tsx](src/context/DataContext.tsx) `refreshMatches` (L267) to send scheduled matches via `updateApplicationContext`
19. Wire DataContext to receive completed matches via event emitter, calling existing `updateMatch` (L727) -> `updateMatchDocument` (L263 of [firebase.ts](src/config/firebase.ts))
20. Idempotency check on phone-side match updates (compare `lastModifiedAt`)
21. `transferUserInfo` fallback for offline scenarios

### Phase 5: Accessibility & QA
21. VoiceOver labels and announcements
22. Dynamic Type validation
23. Color contrast verification (non-color differentiator for focus state)
24. Simulator testing (no physical Apple Watch available -- haptics and wrist-raise deferred to pre-release)

---

## 11. Verification Plan

- **Unit tests (XCTest)**: ScoreEngine -- win-by-2 logic (port from [scoreValidation.test.ts](src/__tests__/scoreValidation.test.ts)), side-out transitions, 1st/2nd server in doubles, first-serve-of-game rule, singles mode, rally log generation
- **Unit tests (XCTest)**: ScoreEngine serve state machine -- verify: starting team loses rally -> side-out (not 2nd server); normal team loses with server 1 -> advance to server 2; server 2 loses -> side-out; side-out resets to server 1
- **Unit tests (XCTest)**: WatchMatch + RallyEvent SwiftData model CRUD, rally log persistence
- **UI tests (watchOS)**: tap serving team -> point scored, tap receiving team -> side-out (no point), undo restores serve state, game-over triggers at correct score, first serve selection works
- **Sync tests**: Verify `applicationContext` payload correctly populates Match List. Verify `transferUserInfo` payload correctly updates Firebase match via existing `updateMatchDocument`
- **Offline test**: Airplane mode on phone, complete match on watch, reconnect, verify match appears completed in phone app
- **Conflict test**: Two watches score same match, verify last write wins
- **Expo prebuild test**: Run `expo prebuild` and verify watch target survives. Also run `eas build --platform ios --profile preview` to verify EAS Build compatibility
- **Accessibility audit**: VoiceOver navigation through all screens, Dynamic Type at largest size
- **Physical device test**: Deferred (no Apple Watch available). Haptics, wrist-raise, and real-world tap accuracy cannot be tested in simulator. Plan to test on hardware before App Store submission

---

## 12. Critical Files to Modify/Reference

| File | Purpose |
|---|---|
| [src/types/index.ts](src/types/index.ts) L67-108 | Match (L75-108) & Game (L67-73) interfaces. **MODIFY**: add optional `rallyLog?: RallyEvent[]` and new `RallyEvent` interface to Game type. Note: Match also has open invite fields (`isOpenInvite`, `playerPool`, etc.) not relevant to watch |
| [brand-kit.json](brand-kit.json) | Canonical brand source: colors, fonts (Fredoka weights + Google Fonts URL), typography scale, spacing, tone |
| [src/theme/colors.ts](src/theme/colors.ts) | Color palette implementation (41 lines). Cross-reference with brand-kit.json |
| [src/theme/typography.ts](src/theme/typography.ts) | Fredoka font config. Uses `@expo-google-fonts/fredoka` -- must download .ttf separately for watch |
| [src/screens/CompleteMatchScreen.tsx](src/screens/CompleteMatchScreen.tsx) L167-216 | `validateScores()` win-by-2 logic to port to ScoreEngine |
| [src/__tests__/scoreValidation.test.ts](src/__tests__/scoreValidation.test.ts) L1-57 | 9 test cases to port to XCTest (valid scores, invalid scores, edge cases, custom pointsToWin) |
| [src/config/firebase.ts](src/config/firebase.ts) L263-273 | `updateMatchDocument(matchId, data: Partial<Match>)` -- uses `stripUndefined()`, forces token refresh |
| [src/context/DataContext.tsx](src/context/DataContext.tsx) L699-760 | `addMatch` (L699-725), `updateMatch` (L727-760), `refreshMatches` (L267-287). Wire watch sync into these existing functions |
| [ios/PickleGo/AppDelegate.swift](ios/PickleGo/AppDelegate.swift) L1-73 | `ExpoAppDelegate` subclass with AppsFlyer. WCSession activation must be added alongside existing `didFinishLaunchingWithOptions` |
| [ios/PickleGo/PickleGo-Bridging-Header.h](ios/PickleGo/PickleGo-Bridging-Header.h) | Currently imports `RNAppsFlyer.h` only. May need WatchConnectivity imports |
| [ios/PickleGo/PickleGo.entitlements](ios/PickleGo/PickleGo.entitlements) | Must add App Groups entitlement for WatchConnectivity |
| [ios/PickleGo/Images.xcassets](ios/PickleGo/Images.xcassets/) | Source for watch app icon (only 1024x1024@1x exists) |
| [app.config.ts](app.config.ts) L63-122 | Add `withWatchTarget` to existing plugins array (9 plugins already configured) |
| [eas.json](eas.json) | May need watch-specific build settings for EAS Build |

---

## V2 Candidates (Deferred)

| Feature | Notes |
|---|---|
| Quick match from watch | Requires player assignment flow on phone |
| Rally scoring mode | Option to use rally scoring (every rally = point) instead of side-out. Toggle on match setup |
| Complications | Show next match time on watch face |
| In-progress score sync | Live score visibility on phone mid-game |
| Rally log analytics on phone | Visualize rally log data stored in Firestore: serve efficiency (points per serve possession), side-out %, scoring runs (consecutive points), pace of play (timestamps), rally-by-rally replay, per-server performance in doubles |
| Siri "start scoring" shortcut | Voice-activated match start |
