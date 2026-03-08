# PRD: Unified Player Invitation System

## Context

PickleGo's current invitation system only supports email-based invites where users manually type a name and email. This creates friction — most people know friends by phone number, not email. This PRD unifies the existing email invite flow with a new SMS-via-contacts flow into a single "Invite Players" experience, letting users choose the method that works best for each person.

---

## Goals

1. Single "Invite Players" entry point that offers both email and contacts-based invitation
2. SMS invitations via native composer with deep links for auto-connection on signup
3. Show which contacts are already on PickleGo for direct in-app connection
4. Multi-select contacts for batch SMS invites (especially useful for doubles)
5. Preserve the existing email placeholder system (pre-add to matches before signup)

## Non-Goals

- Match invitations via SMS (only player connection invites)
- Backend SMS service (Twilio etc.) — uses native SMS composer only
- Contact syncing or importing — contacts are read on-demand, never stored

---

## User Stories

### US1: Choose how to invite
As a user, I want to tap "Invite Players" and choose between inviting from my contacts (SMS) or by email, so I can use whichever method I have for that person.

### US2: Invite friends from contacts via SMS
As a user, I want to select one or more contacts, send a group SMS with a deep link, and have them auto-connect with me when they sign up.

### US3: Invite by email (existing flow, preserved)
As a user, I want to enter a name and email to invite someone, so I can add them to matches even before they sign up (placeholder profile).

### US4: Discover existing users in my contacts
As a user, when I browse my contacts, I want to see which ones already use PickleGo so I can send an in-app connection request instead of an SMS.

### US5: Deep link signup
As a new user who received an SMS invite, I want to tap the link, install the app, sign up, and be automatically connected to the person who invited me.

### US6: Invite from Add Match screen
As a user creating a doubles match, I want to quickly invite friends from contacts or by email if they're not already on PickleGo.

---

## Detailed Design

### 1. Unified Invite Modal

**Replace** the current email-only invite modal in SettingsScreen and AddMatchScreen with a unified modal that has **two tabs**:

```
┌─────────────────────────────────┐
│         Invite Players          │
│                                 │
│  [ From Contacts ]  [ By Email ]│
│  ───────────────    ──────────  │
│                                 │
│  (tab content below)            │
└─────────────────────────────────┘
```

**"From Contacts" tab** (new — default tab):
- Requests contacts permission on first use
- Searchable list of contacts with phone numbers
- "On PickleGo" badge for matched contacts
- Multi-select checkboxes
- "Send Invites" / "Connect" button at bottom

**"By Email" tab** (existing flow, moved into the modal):
- Name + email input fields (same as current `showInviteModal` in SettingsScreen)
- "Send Invite" button
- Creates placeholder profile or sends in-app `player_invite` (unchanged logic)

**New file:** `src/components/InvitePlayersModal.tsx`
- Contains the tabbed modal, contact picker logic, and email form
- Replaces the inline invite modal in SettingsScreen
- Reusable from both SettingsScreen and AddMatchScreen

### 2. Contact Picker (From Contacts Tab)

On tab open:
- Request permission via `expo-contacts` (if not already granted)
- Load contacts that have at least one phone number
- Normalize phone numbers and call `lookupPhoneNumbers` Cloud Function to identify existing PickleGo users
- Display list with:
  - Contact name + phone number
  - Avatar (from contact image or fallback initial)
  - **"On PickleGo"** badge for matched users
  - Checkboxes for multi-select

**Actions on "Send Invites":**
- **Contacts on PickleGo** → send in-app `player_invite` notifications (reuses existing `sendPlayerInvite()` from DataContext)
- **Contacts NOT on PickleGo** → trigger SMS flow (section 3 below)
- Both types can be selected together — the modal handles them in sequence: in-app invites first, then opens SMS composer for the rest

### 3. SMS Invitation Flow

When user confirms invites for non-PickleGo contacts:

1. Call `createSMSInvite` Cloud Function with `{ recipientPhones[], recipientNames[] }`
   - Creates a single `smsInvites/{inviteId}` document (one per batch)
   - Returns the `inviteId`
2. Generate deep link: `https://picklego.app/invite/{inviteId}`
3. Open native SMS composer via `expo-sms`:
   - `SMS.sendSMSAsync([phone1, phone2, phone3], message)`
   - Opens a single composer with all recipients pre-filled
   - Body: `"Hey! I'm using PickleGo to track our pickleball matches. Join me and let's play! https://picklego.app/invite/{inviteId}"`
4. One tap of "Send" delivers to all selected contacts

**Why one batch SMS instead of individual messages:**
- Eliminates the "3 modal interruptions" problem for doubles invites
- The invite link is tied to the inviter (not a specific recipient), so any recipient who taps it gets connected
- `claimedBy[]` array tracks multiple claims from the same link

### 4. Email Invitation Flow (Existing — Unchanged)

The "By Email" tab preserves the current flow exactly:

1. User enters name + email → calls `invitePlayer(name, email)` from DataContext
2. If email matches existing user → sends in-app `player_invite` notification
3. If email doesn't exist → creates placeholder player doc (`pendingClaim: true`, `invitedBy: currentUser`)
4. Placeholder can be added to matches immediately (stats transfer on signup)
5. On signup, `claimPlaceholderProfile` Cloud Function handles the claim

**Key difference from SMS:** Email invites create placeholder profiles so the invitee can be added to matches before they sign up. SMS invites do not — they only establish a connection after signup.

### 5. Deep Link System

**URL scheme:** `https://picklego.app/invite/{inviteId}`

**Setup required:**
- Register `expo-linking` in `app.config.ts` with the app scheme
- Add `associatedDomains` for iOS (Universal Links)
- Add `intentFilters` for Android (App Links)
- Alternative for v1: use `picklego://invite/{inviteId}` custom scheme (simpler, no web hosting needed)

**Handling in App.tsx:**
- Register URL listener via `expo-linking` (`Linking.addEventListener` + `Linking.getInitialURL`)
- Parse invite ID from the URL
- Store pending invite ID in AsyncStorage (survives app install + signup flow)
- After user completes signup, call `claimSMSInvite` Cloud Function

**Claim flow:**
1. New user taps link → app store (if not installed) or app opens
2. After install + signup, app checks AsyncStorage for pending invite
3. Calls `claimSMSInvite(inviteId)` Cloud Function which:
   - Validates the invite exists
   - Checks the caller hasn't already claimed this invite (idempotent)
   - Creates a bidirectional connection between inviter and new user
   - Sends an `invite_accepted` notification to the inviter
   - Appends caller's UID to `claimedBy[]` array
   - Sets status to `'fully_claimed'` when `claimedBy.length >= recipientPhones.length`
   - Also triggers `claimPlaceholderProfile` if a placeholder exists for this user (handles the AddMatch case where both placeholder + SMS invite were created, and the email-then-SMS dual invite case)

### 6. Phone Number Matching (Privacy-Conscious)

**Cloud Function:** `lookupPhoneNumbers`

- Client sends **hashed phone numbers** (SHA-256 of normalized E.164 numbers)
- Server stores `phoneNumberHash` field on player documents (computed on profile create/update)
- Function queries Firestore for matching hashes and returns `{ hash: { playerId, playerName } }`
- This avoids sending raw phone numbers to the server

**Normalization:** Strip all non-digit characters, ensure country code prefix. Strip `+`, `-`, `(`, `)`, spaces; if 10 digits assume US (+1 prefix).

### 7. Data Model Changes

**New Firestore collection: `smsInvites`**
```typescript
interface SMSInvite {
  id: string;
  inviterId: string;            // UID of person who sent the invite
  inviterName: string;
  recipientPhones: string[];    // Normalized phone numbers (batch)
  recipientNames: string[];     // Contact names from phone (parallel array)
  status: 'sent' | 'fully_claimed';
  createdAt: number;
  claimedBy: string[];          // UIDs of users who claimed (supports multiple)
  claimedAt?: number;           // Timestamp of last claim
}
```

**Player interface additions** (in `src/types/index.ts`):
```typescript
phoneNumberHash?: string;  // SHA-256 of normalized phone number
```

**InviteResult type extension:**
```typescript
type: 'invited' | 'existing_player' | 'invite_sent' | 'already_connected'
    | 'request_pending' | 'sms_invited' | 'error';
```

**DataContextType additions:**
```typescript
invitePlayersBySMS: (contacts: { phone: string; name: string }[]) => Promise<{ inviteId: string }>;
lookupContactsOnPickleGo: (phoneHashes: string[]) => Promise<Map<string, { playerId: string; playerName: string }>>;
```

### 8. Cloud Function Changes

**Important:** The codebase uses **v1 Cloud Functions** (`https.onCall` from `firebase-functions/v1`). All new functions follow the existing `acceptPlayerInvite` / `claimPlaceholderProfile` pattern.

**New functions in `functions/src/index.ts`:**

1. **`createSMSInvite`** (v1 `https.onCall`)
   - Accepts `{ recipientPhones: string[], recipientNames: string[] }`
   - Creates a single `smsInvites` document for the batch
   - Returns the invite ID for deep link generation
   - Validates caller is authenticated

2. **`claimSMSInvite`** (v1 `https.onCall`)
   - Called after new user signs up with a pending invite
   - Checks caller not already in `claimedBy[]` (idempotent)
   - Creates bidirectional connection using `FieldValue.arrayUnion` in a batch write (same pattern as `acceptPlayerInvite`)
   - Sends `invite_accepted` notification to inviter
   - Appends caller UID to `claimedBy[]` via `FieldValue.arrayUnion`
   - Sets status to `'fully_claimed'` when all recipients have claimed

3. **`lookupPhoneNumbers`** (v1 `https.onCall`)
   - Accepts array of phone number hashes
   - Queries `players` collection for matching `phoneNumberHash` values
   - Returns map of `{ hash: { playerId, playerName } }`
   - Rate-limited to prevent abuse

**Existing functions — no changes needed:**
- `acceptPlayerInvite` — handles in-app player invite acceptance
- `sendPushOnNotificationWrite` — auto-fires push when `claimSMSInvite` creates `invite_accepted` notifications
- `claimPlaceholderProfile` — continues to handle email-based placeholder claims

### 9. Security Rules

**New `smsInvites` collection rules:**
```
match /smsInvites/{inviteId} {
  allow create: if request.auth != null
    && request.resource.data.inviterId == request.auth.uid;
  allow read: if request.auth != null
    && (resource.data.inviterId == request.auth.uid
        || request.auth.uid in resource.data.claimedBy);
  // No client-side updates — claiming is done server-side via Cloud Function
}
```

### 10. App Configuration Changes

**`app.config.ts` additions:**
```typescript
plugins: [
  // ... existing plugins
  [
    "expo-contacts",
    {
      contactsPermission: "Allow PickleGo to access your contacts to invite friends to play pickleball.",
    },
  ],
],
scheme: "picklego",
```

**New dependencies:**
- `expo-contacts` — access device contacts
- `expo-sms` — open native SMS composer
- `expo-linking` — handle deep links (likely already available via expo)

### 11. UI Entry Points

**SettingsScreen** (`src/screens/SettingsScreen.tsx`):
- Replace separate "Invite Players" modal with the new unified `InvitePlayersModal`
- Remove the current inline invite modal state/JSX (name, email fields)
- Single "Invite Players" menu item opens the unified modal

**AddMatchScreen** (`src/screens/AddMatchScreen.tsx`):
- Replace the current "Add New Player" inline modal with `InvitePlayersModal`
- `InvitePlayersModal` accepts an optional `context: 'settings' | 'addMatch'` prop to adjust behavior
- When `context === 'addMatch'`:
  - **Contact on PickleGo** → adds them to the match team directly (same as selecting an existing player)
  - **Contact NOT on PickleGo** → creates a placeholder profile (using their contact name + phone number) AND sends SMS with deep link. Placeholder is added to the match team immediately. When the invitee signs up via the deep link, `claimSMSInvite` triggers `claimPlaceholderProfile` to transfer match history + stats.
  - **Email tab** → creates placeholder and adds to match (same as current behavior)

### 12. Edge Cases

| Scenario | Handling |
|----------|----------|
| Contact has no phone number | Filter out from contacts list |
| Contact has no name | Show phone number as display name |
| Contact has multiple phone numbers | Show each number as a separate selectable entry |
| User already invited this phone number | Show "Invited" badge, prevent duplicate SMS |
| Same invite link claimed by multiple people | Supported — `claimedBy[]` tracks each claim |
| Invite link shared beyond original recipients | Works fine — anyone who signs up via link connects with inviter |
| User denies contacts permission | Show explanation screen with "Open Settings" button; email tab still works |
| SMS not available on device (iPad) | Contacts tab hidden or disabled; email tab is the default |
| Deep link opened but app not installed | Redirect to app store (Universal Links / App Links fallback) |
| User invited by BOTH email and SMS | Both claim functions run independently; email creates placeholder + stats transfer, SMS creates connection. No conflict — `claimSMSInvite` is idempotent if connection already exists |
| User signs up with different method than expected | `claimSMSInvite` works regardless of auth method — tied to invite ID, not phone number |

---

## Flow Comparison

| | Email Invite | SMS/Contacts (from Settings) | SMS/Contacts (from AddMatch) |
|---|---|---|---|
| **Entry** | "By Email" tab | "From Contacts" tab | "From Contacts" tab |
| **Input** | Name + email (manual) | Contact picker (multi-select) | Contact picker (multi-select) |
| **Creates placeholder?** | Yes | No | **Yes** — added to match team immediately |
| **Sends SMS?** | No | Yes (deep link) | Yes (deep link) |
| **Claim mechanism** | `claimPlaceholderProfile` | `claimSMSInvite` | `claimSMSInvite` → also triggers `claimPlaceholderProfile` |
| **Result** | Connection + stats transfer | Connection only | Connection + stats transfer + match history |
| **Best for** | Adding players to matches by email | Getting friends to download the app | Filling a match roster with friends not yet on the app |

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/InvitePlayersModal.tsx` | **Create** | Unified tabbed modal (contacts + email) |
| `src/types/index.ts` | Modify | Add `SMSInvite` interface, `phoneNumberHash` to Player |
| `src/context/DataContext.tsx` | Modify | Add `invitePlayersBySMS`, `lookupContactsOnPickleGo`, deep link claim on auth |
| `src/config/firebase.ts` | Modify | Add `callCreateSMSInvite`, `callClaimSMSInvite`, `callLookupPhoneNumbers` via `authenticatedCallable` helper |
| `src/screens/SettingsScreen.tsx` | Modify | Replace inline invite modal with `InvitePlayersModal` |
| `src/screens/AddMatchScreen.tsx` | Modify | Replace inline add-player modal with `InvitePlayersModal` |
| `App.tsx` | Modify | Add deep link listener for invite URLs |
| `app.config.ts` | Modify | Add `expo-contacts` plugin, `scheme`, associated domains |
| `functions/src/index.ts` | Modify | Add `createSMSInvite`, `claimSMSInvite`, `lookupPhoneNumbers` functions |
| `firestore.rules` | Modify | Add `smsInvites` collection rules |
| `package.json` | Modify | Add `expo-contacts`, `expo-sms` dependencies |

---

## Verification Plan

1. **Unified modal**: Open "Invite Players" → verify both tabs render, switching works
2. **Email tab**: Invite by email → verify placeholder created (existing behavior unchanged)
3. **Contacts permission**: Deny → verify explanation + email tab still works. Grant → verify contacts load
4. **Contact matching**: Two test accounts with phone numbers → verify "On PickleGo" badges
5. **In-app invite for matched contacts**: Select matched contact → verify `player_invite` sent (existing flow)
6. **SMS batch invite**: Select 3 contacts → verify single SMS composer opens with all recipients + deep link
7. **Deep link - app installed**: Tap invite link → verify app opens and connection established
8. **Deep link - app not installed**: Tap link → app store → signup → verify auto-connection
9. **Dual invite**: Invite same person by email AND SMS → verify both claims work without conflict
10. **AddMatch context**: Open from AddMatch → verify matched contacts get added to team, email creates placeholder on team
11. **iPad / no SMS**: Verify contacts tab hidden, email tab is default
