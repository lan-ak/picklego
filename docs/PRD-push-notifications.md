# PRD: Notifications & Player Invites for PickleGo

**Author:** Engineering
**Date:** 2026-03-01
**Status:** Draft
**Version:** 1.0

---

## 1. Overview

PickleGo currently has no way to notify users about match activity and no channel to invite new players who aren't already on the platform. This PRD defines a notification and invitation system that covers three channels: push notifications for existing users, and email/SMS invites for bringing new players into the app.

---

## 2. Problem Statement

- **Match invitations are invisible.** When a player is added to a match, they have no idea until they manually open the app.
- **No reminders for upcoming matches.** Players forget about scheduled matches and they silently expire.
- **Match results are silent.** When scores are recorded, other participants don't know.
- **No way to invite non-app users.** The current "invite by email" flow creates a placeholder profile but never actually sends an email or text to the invited person. New players have no idea they've been invited.
- **Low re-engagement.** Without notifications there is no trigger to bring lapsed users back.

---

## 3. Goals

| Goal | Metric |
|------|--------|
| Increase daily active users | +20% DAU within 30 days of launch |
| Reduce missed matches | <10% of scheduled matches expire without being played |
| Faster match acceptance | Median time from invite to first app open < 15 min |
| New player conversion | >30% of email/SMS-invited players install the app within 7 days |
| User satisfaction | >80% of users keep notifications enabled after 30 days |

---

## 4. Non-Goals

- In-app messaging / chat between players.
- Rich media notifications (images, video).
- Notification preferences UI beyond simple per-category toggles (v1).
- Marketing or promotional notifications.

---

## 5. User Stories

### Push Notifications

**5.1 Match Invitation**
> As a player, I want to receive a push notification when someone adds me to a match so I can review the details and plan accordingly.

**5.2 Match Reminder**
> As a player, I want to be reminded about an upcoming match (1 hour and 15 minutes before) so I don't forget to show up.

**5.3 Match Completed**
> As a player, I want to be notified when a match I participated in has been scored so I can see the results immediately.

**5.4 Match Updated**
> As a player, I want to know when a match I'm part of has been edited (time, location, players changed) so I have the latest information.

**5.5 Match Cancelled**
> As a player, I want to be notified if a match gets deleted so I can free up my schedule.

**5.6 Invitation Claimed**
> As a match creator, I want to know when an invited player signs up and claims their profile so I know they're active on the platform.

**5.7 Notification Preferences**
> As a player, I want to control which types of notifications I receive so I'm not overwhelmed.

### Email & SMS Invites

**5.8 Email Invite to New Player**
> As a match creator, when I add a player by email who isn't on PickleGo yet, I want that person to receive an email with a link to download the app and join the match.

**5.9 SMS Invite to New Player**
> As a match creator, when I add a player by phone number who isn't on PickleGo yet, I want that person to receive a text message with a link to download the app and join the match.

**5.10 Invite Deep Link**
> As an invited player, when I tap the link in an email or text, I want to be taken to the app store (or directly into the app if installed) and have my match and profile automatically linked.

**5.11 Invite Resend**
> As a match creator, I want to be able to resend an invitation to a player who hasn't joined yet.

---

## 6. Notification Types

### 6.1 Push Notifications

| Type | Trigger | Title | Body Example | Deep Link |
|------|---------|-------|-------------|-----------|
| `match_invite` | Player added to a match | New Match Invite | "{Creator} invited you to play on {date}" | MatchDetails |
| `match_reminder_60` | 60 min before `scheduledDate` | Match Starting Soon | "Your match at {location} starts in 1 hour" | MatchDetails |
| `match_reminder_15` | 15 min before `scheduledDate` | Match Starting Soon | "Your match at {location} starts in 15 minutes!" | MatchDetails |
| `match_completed` | Match status → `completed` | Match Results Are In | "Your match vs {opponent} has been scored" | MatchDetails |
| `match_updated` | Match edited (time/location/players) | Match Updated | "{Creator} updated your match on {date}" | MatchDetails |
| `match_cancelled` | Match deleted by creator | Match Cancelled | "{Creator} cancelled the match on {date}" | Matches |
| `profile_claimed` | Invited player signs up | Player Joined | "{Player} just joined PickleGo!" | PlayerStats |

### 6.2 Email Invites

| Trigger | Subject | Content |
|---------|---------|---------|
| Placeholder player created with email | "You've been invited to play pickleball!" | Personalized email with creator name, match date/time/location, CTA button linking to app store / dynamic link |
| Resend requested by creator | "Reminder: {Creator} is waiting for you on PickleGo" | Same content, softer reminder tone |

### 6.3 SMS Invites

| Trigger | Message |
|---------|---------|
| Placeholder player created with phone number | "{Creator} invited you to play pickleball on {date}! Download PickleGo to join: {dynamic_link}" |
| Resend requested by creator | "Reminder from {Creator}: your pickleball match is on {date}. Join here: {dynamic_link}" |

---

## 7. Technical Architecture

### 7.1 Stack

| Component | Technology |
|-----------|-----------|
| Push delivery | Firebase Cloud Messaging (FCM) — sender ID `79098545592` already configured |
| Token management | `@react-native-firebase/messaging` |
| Scheduled notifications | Firebase Cloud Functions + Cloud Scheduler |
| Email delivery | Firebase Extensions (Trigger Email from Firestore) with SendGrid or Mailgun SMTP |
| SMS delivery | Twilio Programmable SMS via Cloud Functions |
| Dynamic links | Firebase Dynamic Links (or Branch.io) for deep linking from email/SMS |
| Notification storage | Firestore `notifications` collection |
| Deep linking | React Navigation deep link config |

### 7.2 Data Model

#### `players/{playerId}` — new fields

```typescript
{
  // ... existing fields
  fcmTokens: string[]              // one per device
  phoneNumber?: string             // already exists, used for SMS invites
  notificationPreferences: {
    match_invite: boolean           // default true
    match_reminder: boolean         // default true
    match_completed: boolean        // default true
    match_updated: boolean          // default true
    match_cancelled: boolean        // default true
    profile_claimed: boolean        // default true
  }
  inviteStatus?: {
    channel: 'email' | 'sms'       // how they were invited
    sentAt: number                  // timestamp of last invite sent
    sentCount: number               // total invites sent (cap at 3)
    invitedBy: string               // player ID of inviter
    matchId: string                 // match they were invited to
  }
}
```

#### New collection: `notifications/{notificationId}`

```typescript
{
  id: string
  recipientId: string               // player ID
  type: NotificationType
  title: string
  body: string
  data: {
    matchId?: string
    playerId?: string
    screen: string
  }
  read: boolean                     // default false
  createdAt: number
}
```

#### New collection: `mail/{mailId}` (used by Firebase Trigger Email extension)

```typescript
{
  to: string                        // email address
  template: {
    name: 'match-invite' | 'match-invite-reminder'
    data: {
      creatorName: string
      matchDate: string
      matchLocation: string
      dynamicLink: string
    }
  }
  delivery?: {                      // written by extension
    state: 'PENDING' | 'SUCCESS' | 'ERROR'
    attempts: number
    error?: string
  }
}
```

### 7.3 System Flow — Push Notifications

```
┌─────────────┐       ┌──────────────────┐       ┌───────────┐
│  App Client  │──────▶│  Firestore Write │──────▶│  Cloud    │
│  (RN/Expo)   │       │  (match CRUD)    │       │  Function │
└──────┬───────┘       └──────────────────┘       └─────┬─────┘
       │                                                 │
       │  ◀── FCM push ───────────────────────────────── │
       │                                                 │
       ▼                                                 ▼
  Display push                                    Write to
  + deep link                                   notifications/
```

1. **Client writes** to `matches/` (create, update, delete).
2. **Cloud Function trigger** (`onDocumentCreated` / `onDocumentUpdated` / `onDocumentDeleted`) fires.
3. **Cloud Function** determines affected players, checks `notificationPreferences`, looks up `fcmTokens`, writes to `notifications/`, and sends FCM message.
4. **Client** receives push via `@react-native-firebase/messaging` and deep-links on tap.
5. **Scheduled reminders** — Cloud Scheduler (every 5 min) triggers a function that queries matches starting within the next 60/15 minute windows and sends reminders (tracked via `remindersSent` map on the match document).

### 7.4 System Flow — Email & SMS Invites

```
┌─────────────┐       ┌──────────────────┐       ┌───────────┐
│  App Client  │──────▶│  Firestore Write │──────▶│  Cloud    │
│  (creates    │       │  (placeholder    │       │  Function │
│   player)    │       │   player doc)    │       │           │
└──────────────┘       └──────────────────┘       └─────┬─────┘
                                                        │
                              ┌──────────────────┐      │
                              │  Generate         │◀─────┘
                              │  Dynamic Link     │
                              └────────┬──────────┘
                                       │
                         ┌─────────────┴──────────────┐
                         ▼                            ▼
                  ┌─────────────┐             ┌─────────────┐
                  │ Write to    │             │ Twilio SMS   │
                  │ mail/       │             │ API call     │
                  │ collection  │             │              │
                  └──────┬──────┘             └─────────────┘
                         ▼
                  ┌─────────────┐
                  │ Firebase     │
                  │ Trigger      │
                  │ Email ext.   │
                  └─────────────┘
```

1. **Client creates a placeholder player** with an email or phone number (existing flow).
2. **Cloud Function** (`onDocumentCreated` on `players/`) detects `isInvited: true` + `pendingClaim: true`.
3. **Function generates a Dynamic Link** encoding `matchId` and `playerId` so the new user lands on the right match after install.
4. **Email path:** writes to `mail/` collection → Firebase Trigger Email extension sends the email via SMTP.
5. **SMS path:** calls Twilio API directly from the Cloud Function.
6. **Resend:** client updates `inviteStatus.sentCount` on the player doc → Cloud Function `onDocumentUpdated` detects the change and re-sends (capped at 3 total sends).

### 7.5 Dynamic Link Structure

```
https://picklego.page.link/?link=https://picklego.app/invite?matchId=abc123&playerId=xyz789
  &apn=com.picklego.app
  &isi=APPSTORE_ID
  &ibi=com.picklego.app
```

When tapped:
- **App installed:** opens app → navigation handler reads `matchId` and `playerId` → navigates to MatchDetails → triggers profile claim flow.
- **App not installed:** redirects to App Store / Play Store → after install and first launch, deferred deep link delivers the same parameters.

### 7.6 FCM Token Lifecycle

| Event | Action |
|-------|--------|
| App launch (authenticated) | Request permission → get token → upsert to `players/{uid}.fcmTokens` |
| Token refresh | `messaging().onTokenRefresh` → replace old token |
| Sign out | Remove token from `players/{uid}.fcmTokens` |
| Token invalid (FCM 404) | Cloud Function removes stale token from array |

---

## 8. Firestore Security Rules (additions)

```javascript
match /notifications/{notificationId} {
  allow read: if request.auth != null
               && resource.data.recipientId == request.auth.uid;
  allow update: if request.auth != null
               && resource.data.recipientId == request.auth.uid
               && request.resource.data.diff(resource.data)
                    .affectedKeys().hasOnly(['read']);
  allow delete: if request.auth != null
               && resource.data.recipientId == request.auth.uid;
  allow create: if false; // only Cloud Functions write
}

match /mail/{mailId} {
  allow read, write: if false; // Cloud Functions and extension only
}
```

---

## 9. Client-Side Changes

### 9.1 New Files

| File | Purpose |
|------|---------|
| `src/services/notifications.ts` | Token registration, permission request, FCM listeners |
| `src/hooks/useNotifications.ts` | Initialize notification handling on app start |
| `src/screens/NotificationsScreen.tsx` | Notification inbox/history |
| `functions/src/index.ts` | All Cloud Functions (match triggers, scheduler, email, SMS) |
| `functions/src/templates/matchInvite.html` | Email template for match invitations |

### 9.2 Modified Files

| File | Change |
|------|--------|
| [navigation/index.tsx](src/navigation/index.tsx) | Notification tap handler + dynamic link resolution |
| [navigation/TabNavigator.tsx](src/navigation/TabNavigator.tsx) | Unread badge on notifications icon |
| [screens/SettingsScreen.tsx](src/screens/SettingsScreen.tsx) | Notification preference toggles |
| [context/DataContext.tsx](src/context/DataContext.tsx) | Expose unread notification count, resend invite function |
| [types/index.ts](src/types/index.ts) | Add `Notification`, `NotificationType`, `NotificationPreferences`, `InviteStatus` types |
| [screens/MatchDetailsScreen.tsx](src/screens/MatchDetailsScreen.tsx) | "Resend Invite" button for pending players |
| [config/firebase.ts](src/config/firebase.ts) | Add messaging initialization |
| `app.json` | FCM + APNs configuration for Expo builds |
| `package.json` | Add `@react-native-firebase/messaging` + `@react-native-firebase/dynamic-links` |

### 9.3 Notification Preferences UI (Settings Screen)

```
Notifications
─────────────────────────────
Match invitations          [ON]
Match reminders            [ON]
Match results              [ON]
Match updates              [ON]
Match cancellations        [ON]
Player joined              [ON]
```

### 9.4 Resend Invite UI (Match Details Screen)

For each pending/unclaimed player on a match, show:

```
┌──────────────────────────────────┐
│  👤 John Doe (invited)           │
│  john@email.com                  │
│  Invite sent Mar 1 · [Resend]   │
└──────────────────────────────────┘
```

The "Resend" button is disabled after 3 sends. Shows "Joined!" once the player claims their profile.

---

## 10. Edge Cases

| Scenario | Handling |
|----------|----------|
| Player has no FCM token (never opened app) | Skip push; still write to `notifications/` so they see it on next open |
| Player on multiple devices | Send to all tokens in `fcmTokens` array |
| Rapid match edits | Debounce: Cloud Function skips `match_updated` if last one for same match was < 5 min ago |
| Expired match | Do not send reminders for matches past their `scheduledDate` |
| Placeholder player (no app) added to match | Send email/SMS invite instead of push |
| Placeholder player has both email and phone | Prefer email; fall back to SMS if email bounces |
| Invite resend limit | Cap at 3 total sends per invited player per match |
| Email bounce / SMS undeliverable | Log error; surface "invite failed" status in UI |
| User revokes OS notification permission | Respect OS setting; still write to `notifications/` for in-app inbox |
| Stale FCM token | Cloud Function catches `messaging/registration-token-not-registered` and removes it |
| Dynamic link opened months later | Link still resolves; if match is expired, show "this match has ended" in app |

---

## 11. Implementation Phases

### Phase 1 — Push Foundation (Week 1–2)
- Add `@react-native-firebase/messaging` dependency
- Implement FCM token registration, refresh, and cleanup
- Request notification permissions on first authenticated launch
- Set up Firebase Cloud Functions project (`functions/` directory)
- Add `notifications` Firestore collection + security rules
- Add new types to [types/index.ts](src/types/index.ts)

### Phase 2 — Core Push Notifications (Week 3–4)
- Cloud Function: `onMatchCreated` → send `match_invite`
- Cloud Function: `onMatchUpdated` → send `match_completed` / `match_updated`
- Cloud Function: `onMatchDeleted` → send `match_cancelled`
- Client: foreground notification display (toast/banner)
- Client: background/quit notification tap → deep link to correct screen

### Phase 3 — Email Invites (Week 5–6)
- Set up SendGrid/Mailgun SMTP credentials
- Install Firebase Trigger Email extension
- Design and build HTML email template for match invitations
- Cloud Function: `onPlayerCreated` → detect placeholder with email → generate dynamic link → write to `mail/`
- Set up Firebase Dynamic Links with app store routing
- Client: handle dynamic link on app open → navigate to match → trigger claim flow
- Client: "Resend Invite" button on MatchDetails for pending players

### Phase 4 — SMS Invites (Week 7)
- Set up Twilio account and credentials (stored in Firebase Functions config)
- Cloud Function: `onPlayerCreated` → detect placeholder with phone number → generate dynamic link → send SMS via Twilio
- Resend logic (shared with email, capped at 3)
- Handle delivery failures and surface status in UI

### Phase 5 — Scheduled Reminders (Week 8)
- Cloud Scheduler (every 5 min) + Cloud Function for `match_reminder_60` and `match_reminder_15`
- Add `remindersSent` map to match documents to prevent duplicates
- Skip reminders for expired matches

### Phase 6 — Notification Inbox & Preferences (Week 9)
- `NotificationsScreen` — list past notifications, mark as read, tap to navigate
- Unread badge on tab bar
- Notification preference toggles in Settings screen
- Cloud Functions check per-user preferences before sending

### Phase 7 — Polish & Monitoring (Week 10)
- Analytics events: `notification_sent`, `notification_opened`, `invite_sent`, `invite_converted`
- Cloud Function error alerting and logging
- Stale token cleanup
- Email bounce / SMS failure monitoring
- End-to-end testing on iOS + Android

---

## 12. Testing Strategy

| Layer | Approach |
|-------|----------|
| Cloud Functions (push) | Unit tests with `firebase-functions-test` — mock Firestore triggers, verify FCM payloads |
| Cloud Functions (email) | Verify `mail/` document written with correct template data; test with SendGrid sandbox |
| Cloud Functions (SMS) | Mock Twilio client; verify message body and phone number |
| Token management | Manual: install on two devices, verify both receive pushes; sign out, verify token removed |
| Deep linking (push) | Tap notification from background/quit state → verify correct screen opens |
| Deep linking (invite) | Tap dynamic link with app installed → verify match/profile linking. Tap without app → verify store redirect + deferred deep link |
| Preferences | Toggle off a category → trigger event → verify no push sent but `notifications/` doc created |
| Reminders | Create match 20 min in future → verify two reminders at correct times |
| Invite resend | Resend 3 times → verify 4th attempt blocked |
| Edge cases | Revoke OS permissions, uninstall/reinstall, sign out/in, expired links |

---

## 13. Dependencies & Prerequisites

| Dependency | Notes |
|------------|-------|
| **Firebase Blaze plan** | Required for Cloud Functions, Cloud Scheduler, and outbound network calls (Twilio) |
| **APNs key** | Required for iOS push delivery. Upload to Firebase Console → Cloud Messaging |
| **SendGrid or Mailgun account** | SMTP credentials for email delivery |
| **Twilio account** | For SMS delivery. Store credentials in `functions.config()` |
| **Firebase Dynamic Links** | For deep linking from email/SMS into the app (or Branch.io alternative) |
| **App Store / Play Store listing** | Dynamic links need valid store IDs for redirect |
| **Development builds** | `@react-native-firebase/messaging` is not compatible with Expo Go — requires `eas build` dev client |

---

## 14. Cost Estimates

| Service | Free Tier | Expected Cost (1k users) |
|---------|-----------|-------------------------|
| FCM | Unlimited pushes | $0 |
| Cloud Functions | 2M invocations/mo free | ~$0 at this scale |
| Cloud Scheduler | 3 free jobs | $0 (1 job needed) |
| SendGrid | 100 emails/day free | $0–$15/mo |
| Twilio SMS | None (pay as you go) | ~$0.0079/msg → ~$20/mo for 2,500 texts |
| Firebase Dynamic Links | Free | $0 |

---

## 15. Open Questions

| # | Question | Impact |
|---|----------|--------|
| 1 | Should we show an in-app notification center (bell icon tab) or rely on the OS notification tray? | Scope of Phase 6 |
| 2 | Should push notifications support "accept/decline" action buttons? | Adds actionable notification complexity |
| 3 | What is the retention policy for the `notifications` collection — 30, 60, or 90 days? | Storage cost |
| 4 | Should match reminders be user-configurable (e.g., "remind me 2 hours before")? | Phase 5 complexity |
| 5 | Do we need notification grouping/stacking for users in many matches? | Android/iOS UX |
| 6 | Should email invites include an "Add to Calendar" (.ics) attachment? | Nice-to-have for email phase |
| 7 | Which email provider (SendGrid vs Mailgun vs AWS SES)? | Phase 3 setup |
| 8 | Do we need SMS opt-out compliance (STOP keyword handling)? | Twilio handles this, but need to confirm regulatory requirements |

---

## 16. Success Criteria

The feature is considered successful when:

1. **Push:** 90%+ of authenticated users have a valid FCM token registered.
2. **Push:** Notifications delivered within 5 seconds of the triggering event.
3. **Push:** Notification tap deep-links to the correct screen 100% of the time.
4. **Reminders:** Scheduled reminders fire within the correct time window (±2 minutes).
5. **Email:** >95% email delivery rate (non-bounce).
6. **SMS:** >90% SMS delivery rate.
7. **Conversion:** >30% of email/SMS-invited players install the app within 7 days.
8. **Engagement:** Users who receive match invite notifications open the app within 15 minutes at a >40% rate.
9. **Retention:** <10% of scheduled matches expire without being played.
