"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resendMatchNotifications = exports.createNotificationsOnMatchUpdate = exports.createNotificationsOnMatchCreate = exports.deleteAccount = exports.recalculateStatsOnMatchUpdate = exports.lookupPhoneNumbers = exports.claimSMSInvite = exports.createSMSInvite = exports.sendPushOnNotificationWrite = exports.claimPlaceholderProfile = exports.acceptPlayerInvite = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const v1_1 = require("firebase-functions/v1");
const app_1 = require("firebase-admin/app");
const firestore_2 = require("firebase-admin/firestore");
const auth_1 = require("firebase-admin/auth");
const storage_1 = require("firebase-admin/storage");
const expo_server_sdk_1 = require("expo-server-sdk");
const crypto_1 = require("crypto");
const app = (0, app_1.initializeApp)();
/** Normalize a phone number to digits-only with US country code. */
function normalizePhone(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10)
        return '1' + digits;
    return digits;
}
const db = (0, firestore_2.getFirestore)(app);
const expo = new expo_server_sdk_1.default();
/**
 * Callable function to accept a player invite.
 * Validates the invite exists and is pending, then atomically:
 * 1. Adds bidirectional connections via Admin SDK
 * 2. Updates the invite notification status to 'accepted'
 * 3. Creates an invite_accepted notification for the sender
 */
exports.acceptPlayerInvite = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const callerUid = request.auth.uid;
    const notificationId = request.data?.notificationId;
    if (!notificationId || typeof notificationId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'notificationId is required');
    }
    // Use a transaction to prevent duplicate accepts from concurrent requests
    const notifRef = db.collection('notifications').doc(notificationId);
    const result = await db.runTransaction(async (transaction) => {
        const notifDoc = await transaction.get(notifRef);
        if (!notifDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Notification not found');
        }
        const notif = notifDoc.data();
        if (notif.type !== 'player_invite') {
            throw new https_1.HttpsError('failed-precondition', 'Not a player invite');
        }
        if (notif.status !== 'sent') {
            throw new https_1.HttpsError('failed-precondition', 'Invite already responded to');
        }
        if (notif.recipientId !== callerUid) {
            throw new https_1.HttpsError('permission-denied', 'Not the invite recipient');
        }
        const senderId = notif.senderId;
        const now = Date.now();
        // Look up the caller's name for the accept notification
        const callerDoc = await transaction.get(db.collection('players').doc(callerUid));
        const callerName = callerDoc.exists ? (callerDoc.data().name || 'A player') : 'A player';
        const callerProfilePic = callerDoc.exists ? callerDoc.data().profilePic : undefined;
        // Add bidirectional connections
        transaction.update(db.collection('players').doc(callerUid), {
            connections: firestore_2.FieldValue.arrayUnion(senderId),
            updatedAt: now,
        });
        transaction.update(db.collection('players').doc(senderId), {
            connections: firestore_2.FieldValue.arrayUnion(callerUid),
            updatedAt: now,
        });
        // Update the invite notification to accepted
        transaction.update(notifRef, {
            status: 'accepted',
            respondedAt: now,
        });
        // Create invite_accepted notification for the sender (if they haven't disabled it)
        const senderDoc = await transaction.get(db.collection('players').doc(senderId));
        const senderPrefs = senderDoc.exists ? senderDoc.data().notificationPreferences : undefined;
        let acceptNotifId = null;
        if (!senderPrefs || senderPrefs.invite_accepted !== false) {
            acceptNotifId = `invite_accepted_${callerUid}_${senderId}_${(0, crypto_1.randomUUID)()}`;
            const acceptNotifData = {
                id: acceptNotifId,
                type: 'invite_accepted',
                status: 'sent',
                recipientId: senderId,
                senderId: callerUid,
                senderName: callerName,
                message: `${callerName} accepted your player invite!`,
                createdAt: now,
            };
            if (callerProfilePic) {
                acceptNotifData.senderProfilePic = callerProfilePic;
            }
            transaction.set(db.collection('notifications').doc(acceptNotifId), acceptNotifData);
        }
        return { senderId, acceptNotifId };
    });
    console.log(`Player invite accepted: ${callerUid} <-> ${result.senderId}`);
    return { accepted: true, senderId: result.senderId, acceptNotificationId: result.acceptNotifId };
});
/**
 * Callable function to claim a placeholder profile.
 * When a user signs up with an email that matches a pending placeholder,
 * this function atomically transfers match history, merges stats, and
 * deletes the placeholder — all via Admin SDK to bypass security rules.
 */
exports.claimPlaceholderProfile = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const realUid = request.auth.uid;
    const realEmail = request.auth.token.email;
    const realName = request.data?.name;
    if (!realEmail) {
        throw new https_1.HttpsError('failed-precondition', 'User must have an email');
    }
    if (!realName || typeof realName !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'Name is required');
    }
    const normalizedEmail = realEmail.trim().toLowerCase();
    const playersRef = db.collection('players');
    // Find the placeholder player doc by email + pendingClaim
    const snapshot = await playersRef
        .where('email', '==', normalizedEmail)
        .where('pendingClaim', '==', true)
        .get();
    // Also check non-normalized email in case it was stored differently
    let allDocs = snapshot.docs;
    if (allDocs.length === 0) {
        const fallback = await playersRef
            .where('email', '==', realEmail)
            .where('pendingClaim', '==', true)
            .get();
        allDocs = fallback.docs;
    }
    const placeholderDoc = allDocs.find(d => d.id !== realUid);
    if (!placeholderDoc) {
        return { claimed: false, matchesUpdated: 0 };
    }
    const placeholderId = placeholderDoc.id;
    // Query all matches referencing the placeholder (queries can't run inside transactions)
    const matchesSnapshot = await db.collection('matches')
        .where('allPlayerIds', 'array-contains', placeholderId)
        .get();
    // Migrate notifications: swap placeholder ID for real UID
    const notifAsRecipient = await db.collection('notifications')
        .where('recipientId', '==', placeholderId)
        .get();
    const notifAsSender = await db.collection('notifications')
        .where('senderId', '==', placeholderId)
        .get();
    // Use a transaction to prevent double-claim race conditions
    const result = await db.runTransaction(async (transaction) => {
        // Re-read the placeholder doc inside the transaction to verify it's still pendingClaim
        const placeholderSnap = await transaction.get(playersRef.doc(placeholderId));
        if (!placeholderSnap.exists || placeholderSnap.data().pendingClaim !== true) {
            return { claimed: false, matchesUpdated: 0 };
        }
        const placeholderData = placeholderSnap.data();
        // Re-read the real player doc inside the transaction for stats merge
        const realPlayerDoc = await transaction.get(playersRef.doc(realUid));
        // Update each match: swap placeholder ID/name for the real user
        for (const matchDoc of matchesSnapshot.docs) {
            const match = matchDoc.data();
            const replaceId = (ids) => ids.map((id) => (id === placeholderId ? realUid : id));
            const replaceName = (ids, names) => ids.map((id, i) => (id === placeholderId ? realName : names[i]));
            transaction.update(matchDoc.ref, {
                allPlayerIds: replaceId(match.allPlayerIds),
                team1PlayerIds: replaceId(match.team1PlayerIds),
                team2PlayerIds: replaceId(match.team2PlayerIds),
                team1PlayerNames: replaceName(match.team1PlayerIds, match.team1PlayerNames),
                team2PlayerNames: replaceName(match.team2PlayerIds, match.team2PlayerNames),
            });
        }
        for (const notifDoc of notifAsRecipient.docs) {
            // Reset status + createdAt so the onWrite dedup guard re-triggers the push notification
            transaction.update(notifDoc.ref, { recipientId: realUid, status: 'sent', createdAt: Date.now() });
        }
        for (const notifDoc of notifAsSender.docs) {
            transaction.update(notifDoc.ref, { senderId: realUid });
        }
        // Create match_invite notifications for transferred matches.
        // Since cloud functions skip notifications for placeholders, we create them
        // here with the real UID so the push notification fires immediately.
        const existingNotifMatchIds = new Set(notifAsRecipient.docs.map(d => d.data().matchId).filter(Boolean));
        for (const matchDoc of matchesSnapshot.docs) {
            if (existingNotifMatchIds.has(matchDoc.id))
                continue; // already migrated above
            const match = matchDoc.data();
            if (match.createdBy === realUid)
                continue; // don't notify yourself
            const team = (match.team1PlayerIds || []).includes(placeholderId) ? 1 : 2;
            const notifId = `notif_${matchDoc.id}_${realUid}`;
            transaction.set(db.collection('notifications').doc(notifId), {
                id: notifId,
                type: 'match_invite',
                status: 'sent',
                recipientId: realUid,
                senderId: match.createdBy,
                senderName: match.createdByName || 'A player',
                matchId: matchDoc.id,
                matchDate: match.scheduledDate,
                matchLocation: match.location || null,
                matchType: match.matchType,
                team,
                createdAt: Date.now(),
            });
        }
        // Merge stats from placeholder into the real player
        const pStats = placeholderData.stats;
        if (pStats && pStats.totalMatches > 0) {
            if (realPlayerDoc.exists) {
                const rStats = realPlayerDoc.data()?.stats || {};
                const totalMatches = (rStats.totalMatches || 0) + pStats.totalMatches;
                const wins = (rStats.wins || 0) + pStats.wins;
                transaction.update(playersRef.doc(realUid), {
                    stats: {
                        totalMatches,
                        wins,
                        losses: (rStats.losses || 0) + (pStats.losses || 0),
                        winPercentage: totalMatches > 0
                            ? Math.round((wins / totalMatches) * 1000) / 10
                            : 0,
                        totalGames: (rStats.totalGames || 0) + (pStats.totalGames || 0),
                        gameWins: (rStats.gameWins || 0) + (pStats.gameWins || 0),
                        gameLosses: (rStats.gameLosses || 0) + (pStats.gameLosses || 0),
                    },
                });
            }
        }
        // Delete the placeholder
        transaction.delete(playersRef.doc(placeholderId));
        return { claimed: true, matchesUpdated: matchesSnapshot.size };
    });
    if (!result.claimed) {
        return { claimed: false, matchesUpdated: 0 };
    }
    console.log(`Claimed placeholder ${placeholderId} -> ${realUid} ` +
        `(${matchesSnapshot.size} matches, ${notifAsRecipient.size + notifAsSender.size} notifications updated)`);
    return result;
});
/**
 * v1 Firestore trigger: send push notifications when a notification document
 * is created or updated with status 'sent'.
 * Uses onWrite so it fires for both new notifications AND re-sends
 * (match edits use setDoc which overwrites existing docs).
 */
exports.sendPushOnNotificationWrite = v1_1.firestore
    .document('notifications/{notificationId}')
    .onWrite(async (change, context) => {
    // Skip deletes
    if (!change.after.exists)
        return;
    const notification = change.after.data();
    const notifId = context.params.notificationId;
    const isCreate = !change.before.exists;
    const isUpdate = change.before.exists;
    console.log(`[Push] onWrite triggered: id=${notifId}, type=${notification.type}, status=${notification.status}, recipientId=${notification.recipientId}, senderId=${notification.senderId}, isCreate=${isCreate}`);
    // Only send push for notifications with status 'sent'
    if (notification.status !== 'sent') {
        console.log(`[Push] skipping: status=${notification.status} (not 'sent'), id=${notifId}`);
        return;
    }
    // Only send push for types that warrant a push
    if (!['match_invite', 'match_updated', 'match_cancelled', 'player_invite', 'invite_accepted'].includes(notification.type)) {
        console.log(`[Push] skipping: unsupported type=${notification.type}, id=${notifId}`);
        return;
    }
    // If this is an update, skip if nothing meaningful changed
    if (isUpdate) {
        const before = change.before.data();
        if (before.status === 'sent' && before.createdAt === notification.createdAt) {
            console.log(`[Push] skipping: dedup guard (status+createdAt unchanged), id=${notifId}`);
            return;
        }
    }
    // Look up recipient's push tokens
    let recipientDoc = await db.collection('players').doc(notification.recipientId).get();
    // Skip notifications for placeholder users (belt-and-suspenders guard)
    if (recipientDoc.exists && recipientDoc.data().pendingClaim === true) {
        console.log(`[Push] skipping: placeholder recipient ${notification.recipientId}, id=${notifId}`);
        return;
    }
    // Check if recipient has this notification type disabled in preferences
    const prefs = recipientDoc.exists ? recipientDoc.data().notificationPreferences : undefined;
    if (prefs && prefs[notification.type] === false) {
        console.log(`[Push] skipping: ${notification.type} disabled for ${notification.recipientId}, id=${notifId}`);
        return;
    }
    const pushTokens = recipientDoc.exists
        ? (recipientDoc.data().pushTokens || []).filter((t) => expo_server_sdk_1.default.isExpoPushToken(t))
        : [];
    // If no push tokens, skip silently. Placeholder recipients will have their
    // notification docs migrated by claimPlaceholderProfile, which swaps the
    // recipientId to the real UID and re-triggers this function.
    if (pushTokens.length === 0) {
        console.log(`[Push] skipping: no push tokens for recipient ${notification.recipientId}, id=${notifId}`);
        return;
    }
    // Build message based on notification type
    let title;
    let body;
    if (notification.type === 'match_invite') {
        const matchTypeLabel = notification.matchType === 'doubles' ? 'doubles' : 'singles';
        const dateStr = notification.matchDate
            ? new Date(notification.matchDate).toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric',
                hour: 'numeric', minute: '2-digit',
            })
            : 'TBD';
        title = 'New Match Invite';
        body = `${notification.senderName} invited you to a ${matchTypeLabel} match on ${dateStr}`;
    }
    else if (notification.type === 'match_updated') {
        title = 'Match Updated';
        body = notification.message || `${notification.senderName} updated a match`;
    }
    else if (notification.type === 'match_cancelled') {
        title = 'Match Cancelled';
        body = notification.message || `${notification.senderName} cancelled a match`;
    }
    else if (notification.type === 'invite_accepted') {
        title = 'Invite Accepted';
        body = notification.message || `${notification.senderName} accepted your invite!`;
    }
    else {
        title = 'New Player Invite';
        body = notification.message || `${notification.senderName} wants to add you as a player!`;
    }
    // Send via Expo
    const messages = pushTokens.map((token) => ({
        to: token, sound: 'default', title, body,
        channelId: 'match-invites',
        data: {
            ...(notification.matchId ? { matchId: notification.matchId } : {}),
            screen: ['match_invite', 'match_updated'].includes(notification.type) ? 'MatchDetails' : 'Notifications',
            notificationId: notification.id,
        },
    }));
    const chunks = expo.chunkPushNotifications(messages);
    const staleTokens = [];
    for (const chunk of chunks) {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        tickets.forEach((ticket, i) => {
            if (ticket.status !== 'ok' && 'details' in ticket && ticket.details?.error === 'DeviceNotRegistered') {
                staleTokens.push(chunk[i].to);
            }
        });
    }
    // Clean up stale tokens
    if (staleTokens.length > 0) {
        await db.collection('players').doc(recipientDoc.id).update({
            pushTokens: firestore_2.FieldValue.arrayRemove(...staleTokens),
        });
    }
    console.log(`[Push] SENT: type=${notification.type}, recipient=${notification.recipientId}, sender=${notification.senderId}, tokens=${pushTokens.length}, stale=${staleTokens.length}, id=${notifId}, title="${title}"`);
});
/**
 * Callable function to create an SMS invite record.
 * Creates a document in smsInvites collection and returns the invite ID
 * for deep link generation.
 */
exports.createSMSInvite = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const callerUid = request.auth.uid;
    const recipientPhones = request.data?.recipientPhones;
    const recipientNames = request.data?.recipientNames;
    if (!recipientPhones || !Array.isArray(recipientPhones) || recipientPhones.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'recipientPhones is required and must be a non-empty array');
    }
    if (!recipientNames || !Array.isArray(recipientNames) || recipientNames.length !== recipientPhones.length) {
        throw new https_1.HttpsError('invalid-argument', 'recipientNames must match recipientPhones length');
    }
    // Look up inviter name
    const callerDoc = await db.collection('players').doc(callerUid).get();
    const callerName = callerDoc.exists ? (callerDoc.data().name || 'A player') : 'A player';
    const inviteRef = db.collection('smsInvites').doc();
    const now = Date.now();
    await inviteRef.set({
        id: inviteRef.id,
        inviterId: callerUid,
        inviterName: callerName,
        recipientPhones,
        recipientNames,
        status: 'sent',
        createdAt: now,
        claimedBy: [],
    });
    console.log(`SMS invite created: ${inviteRef.id} by ${callerUid} for ${recipientPhones.length} recipients`);
    return { inviteId: inviteRef.id };
});
/**
 * Callable function to claim an SMS invite.
 * Called after a new user signs up via a deep link invite.
 * Creates a bidirectional connection and notifies the inviter.
 */
exports.claimSMSInvite = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const callerUid = request.auth.uid;
    const inviteId = request.data?.inviteId;
    if (!inviteId || typeof inviteId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'inviteId is required');
    }
    const inviteRef = db.collection('smsInvites').doc(inviteId);
    const now = Date.now();
    // Use a transaction to prevent double-claim race conditions
    const txResult = await db.runTransaction(async (transaction) => {
        // Re-read invite doc inside the transaction
        const inviteDoc = await transaction.get(inviteRef);
        if (!inviteDoc.exists) {
            throw new https_1.HttpsError('not-found', 'Invite not found');
        }
        const invite = inviteDoc.data();
        // Don't let inviter claim their own invite
        if (invite.inviterId === callerUid) {
            return { claimed: false, reason: 'self_invite' };
        }
        // Check if already claimed by this user (idempotent)
        if ((invite.claimedBy || []).includes(callerUid)) {
            return { claimed: false, reason: 'already_claimed' };
        }
        const senderId = invite.inviterId;
        // Look up caller and validate phone number matches invite recipients
        const callerDoc = await transaction.get(db.collection('players').doc(callerUid));
        const callerPhone = callerDoc.exists ? callerDoc.data().phoneNumber : undefined;
        if (!callerPhone) {
            throw new https_1.HttpsError('failed-precondition', 'Phone number required to claim SMS invite');
        }
        const normalizedCallerPhone = normalizePhone(callerPhone);
        const recipientPhones = (invite.recipientPhones || []).map((p) => normalizePhone(p));
        if (!recipientPhones.includes(normalizedCallerPhone)) {
            throw new https_1.HttpsError('permission-denied', 'Phone number does not match invite recipients');
        }
        const callerName = callerDoc.exists ? (callerDoc.data().name || 'A player') : 'A player';
        const callerProfilePic = callerDoc.exists ? callerDoc.data().profilePic : undefined;
        // Read sender doc for notification preferences
        const senderDoc = await transaction.get(db.collection('players').doc(senderId));
        const senderPrefs = senderDoc.exists ? senderDoc.data().notificationPreferences : undefined;
        // Add bidirectional connections
        transaction.update(db.collection('players').doc(callerUid), {
            connections: firestore_2.FieldValue.arrayUnion(senderId),
            updatedAt: now,
        });
        transaction.update(db.collection('players').doc(senderId), {
            connections: firestore_2.FieldValue.arrayUnion(callerUid),
            updatedAt: now,
        });
        // Update the SMS invite
        const newClaimedBy = [...(invite.claimedBy || []), callerUid];
        const fullyClaimedUpdate = {
            claimedBy: firestore_2.FieldValue.arrayUnion(callerUid),
            claimedAt: now,
        };
        if (newClaimedBy.length >= (invite.recipientPhones || []).length) {
            fullyClaimedUpdate.status = 'fully_claimed';
        }
        transaction.update(inviteRef, fullyClaimedUpdate);
        // Create invite_accepted notification for the inviter (if they haven't disabled it)
        if (!senderPrefs || senderPrefs.invite_accepted !== false) {
            const acceptNotifId = `invite_accepted_${callerUid}_${senderId}_${(0, crypto_1.randomUUID)()}`;
            const acceptNotifData = {
                id: acceptNotifId,
                type: 'invite_accepted',
                status: 'sent',
                recipientId: senderId,
                senderId: callerUid,
                senderName: callerName,
                message: `${callerName} joined PickleGo from your invite!`,
                createdAt: now,
            };
            if (callerProfilePic) {
                acceptNotifData.senderProfilePic = callerProfilePic;
            }
            transaction.set(db.collection('notifications').doc(acceptNotifId), acceptNotifData);
        }
        return { claimed: true, senderId, callerPhone };
    });
    if (!txResult.claimed) {
        return { claimed: false, reason: txResult.reason };
    }
    const senderId = txResult.senderId;
    console.log(`SMS invite claimed: ${inviteId} by ${callerUid}, connected with ${senderId}`);
    // Check for SMS-originated placeholders (no email) created by the inviter for AddMatch context.
    // These need to be merged into the new user's account so match history transfers.
    // Match by phone number to ensure the correct placeholder is claimed.
    try {
        const callerPhone = txResult.callerPhone;
        const placeholderQuery = await db.collection('players')
            .where('invitedBy', '==', senderId)
            .where('pendingClaim', '==', true)
            .get();
        for (const placeholderDoc of placeholderQuery.docs) {
            const placeholder = placeholderDoc.data();
            // Only claim placeholders without email (SMS-originated) — email placeholders
            // are handled by the separate claimPlaceholderProfile flow
            if (placeholder.email)
                continue;
            // Verify the placeholder's phone number matches the claiming user's phone
            if (!callerPhone || !placeholder.phoneNumber)
                continue;
            if (normalizePhone(placeholder.phoneNumber) !== normalizePhone(callerPhone))
                continue;
            const placeholderId = placeholderDoc.id;
            // Transfer matches: replace placeholder ID with the new user's ID (query outside transaction)
            const matchesSnapshot = await db.collection('matches')
                .where('allPlayerIds', 'array-contains', placeholderId)
                .get();
            // Migrate notifications: swap placeholder ID for real UID (query outside transaction)
            const notifSnapshot = await db.collection('notifications')
                .where('recipientId', '==', placeholderId)
                .get();
            // Look up caller name for match name replacement
            const callerDoc = await db.collection('players').doc(callerUid).get();
            const callerName = callerDoc.exists ? (callerDoc.data().name || 'A player') : 'A player';
            // Use a transaction to prevent double-claim of the placeholder
            const matchesUpdated = await db.runTransaction(async (transaction) => {
                // Re-read placeholder inside transaction to verify it's still pendingClaim
                const phSnap = await transaction.get(db.collection('players').doc(placeholderId));
                if (!phSnap.exists || phSnap.data().pendingClaim !== true) {
                    return 0;
                }
                let updated = 0;
                for (const matchDoc of matchesSnapshot.docs) {
                    const match = matchDoc.data();
                    const replaceId = (ids) => ids.map((id) => (id === placeholderId ? callerUid : id));
                    const replaceName = (ids, names) => ids.map((id, i) => (id === placeholderId ? callerName : names[i]));
                    transaction.update(matchDoc.ref, {
                        allPlayerIds: replaceId(match.allPlayerIds || []),
                        team1PlayerIds: replaceId(match.team1PlayerIds || []),
                        team2PlayerIds: replaceId(match.team2PlayerIds || []),
                        team1PlayerNames: replaceName(match.team1PlayerIds || [], match.team1PlayerNames || []),
                        team2PlayerNames: replaceName(match.team2PlayerIds || [], match.team2PlayerNames || []),
                    });
                    updated++;
                }
                // Migrate notifications: swap recipientId to real UID and re-trigger push
                for (const notifDoc of notifSnapshot.docs) {
                    transaction.update(notifDoc.ref, { recipientId: callerUid, status: 'sent', createdAt: Date.now() });
                }
                // Create match_invite notifications for transferred matches that had none
                // (cloud functions skip notifications for placeholders)
                const existingNotifMatchIds = new Set(notifSnapshot.docs.map(d => d.data().matchId).filter(Boolean));
                for (const matchDoc of matchesSnapshot.docs) {
                    if (existingNotifMatchIds.has(matchDoc.id))
                        continue;
                    const match = matchDoc.data();
                    if (match.createdBy === callerUid)
                        continue;
                    const team = (match.team1PlayerIds || []).includes(placeholderId) ? 1 : 2;
                    const notifId = `notif_${matchDoc.id}_${callerUid}`;
                    transaction.set(db.collection('notifications').doc(notifId), {
                        id: notifId,
                        type: 'match_invite',
                        status: 'sent',
                        recipientId: callerUid,
                        senderId: match.createdBy,
                        senderName: match.createdByName || 'A player',
                        matchId: matchDoc.id,
                        matchDate: match.scheduledDate,
                        matchLocation: match.location || null,
                        matchType: match.matchType,
                        team,
                        createdAt: Date.now(),
                    });
                }
                // Mark placeholder as claimed
                transaction.update(db.collection('players').doc(placeholderId), {
                    pendingClaim: false,
                    claimedBy: callerUid,
                    updatedAt: now,
                });
                return updated;
            });
            console.log(`SMS placeholder ${placeholderId} claimed by ${callerUid}, ${matchesUpdated} matches updated, ${notifSnapshot.size} notifications migrated`);
        }
    }
    catch (error) {
        // Placeholder claiming is best-effort — don't fail the whole claim
        console.error('Error claiming SMS placeholder:', error);
    }
    return { claimed: true, senderId };
});
/**
 * Callable function to look up phone numbers on PickleGo.
 * Accepts hashed phone numbers (SHA-256) and returns matching player IDs.
 * Privacy-conscious: never receives or stores raw phone numbers.
 */
exports.lookupPhoneNumbers = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const phoneHashes = request.data?.phoneHashes;
    const normalizedPhone = request.data?.normalizedPhone;
    const hasHashes = phoneHashes && Array.isArray(phoneHashes) && phoneHashes.length > 0;
    const hasPhone = normalizedPhone && typeof normalizedPhone === 'string';
    if (!hasHashes && !hasPhone) {
        throw new https_1.HttpsError('invalid-argument', 'phoneHashes or normalizedPhone is required');
    }
    // Limit batch size to prevent abuse
    if (hasHashes && phoneHashes.length > 500) {
        throw new https_1.HttpsError('invalid-argument', 'Maximum 500 phone hashes per request');
    }
    const callerUid = request.auth.uid;
    const results = {};
    // Look up players by phone hash
    if (hasHashes) {
        const chunkSize = 30;
        for (let i = 0; i < phoneHashes.length; i += chunkSize) {
            const chunk = phoneHashes.slice(i, i + chunkSize);
            const snapshot = await db.collection('players')
                .where('phoneNumberHash', 'in', chunk)
                .get();
            for (const doc of snapshot.docs) {
                if (doc.id === callerUid)
                    continue; // Skip self
                const playerData = doc.data();
                if (playerData.phoneNumberHash) {
                    results[playerData.phoneNumberHash] = {
                        playerId: doc.id,
                        playerName: playerData.name || 'Unknown',
                    };
                }
            }
        }
    }
    // Optionally find pending SMS invites for a phone number
    let pendingInvites = [];
    if (hasPhone) {
        const inviteSnapshot = await db.collection('smsInvites')
            .where('recipientPhones', 'array-contains', normalizedPhone)
            .where('status', '==', 'sent')
            .limit(20)
            .get();
        pendingInvites = inviteSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                inviterId: data.inviterId,
                inviterName: data.inviterName,
                recipientPhones: data.recipientPhones,
                recipientNames: data.recipientNames,
                status: data.status,
                createdAt: data.createdAt,
                claimedBy: data.claimedBy || [],
            };
        });
    }
    return { matches: results, pendingInvites };
});
function emptyPlayerStats() {
    return {
        totalMatches: 0, wins: 0, losses: 0, winPercentage: 0,
        totalGames: 0, gameWins: 0, gameLosses: 0,
        currentWinStreak: 0, bestWinStreak: 0,
    };
}
function computeWinStreaks(results) {
    let best = 0;
    let streak = 0;
    for (const won of results) {
        if (won) {
            streak++;
            if (streak > best)
                best = streak;
        }
        else {
            streak = 0;
        }
    }
    return { current: streak, best };
}
function buildStatsBreakdown(matches, playerId) {
    const stats = emptyPlayerStats();
    if (matches.length === 0)
        return stats;
    const sorted = [...matches].sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
    const results = [];
    for (const match of sorted) {
        const userTeam = match.team1PlayerIds.includes(playerId) ? 1 : 2;
        const won = match.winnerTeam === userTeam;
        stats.totalMatches++;
        if (won)
            stats.wins++;
        else
            stats.losses++;
        results.push(won);
        for (const game of match.games) {
            stats.totalGames++;
            if (game.winnerTeam === userTeam)
                stats.gameWins++;
            else
                stats.gameLosses++;
        }
    }
    stats.winPercentage =
        stats.totalMatches > 0
            ? Math.round((stats.wins / stats.totalMatches) * 1000) / 10
            : 0;
    const streaks = computeWinStreaks(results);
    stats.currentWinStreak = streaks.current;
    stats.bestWinStreak = streaks.best;
    return stats;
}
function calculateOverallStats(matchDocs, playerId) {
    const completedMatches = matchDocs.filter((m) => m.status === 'completed' && (m.allPlayerIds || []).includes(playerId));
    return buildStatsBreakdown(completedMatches, playerId);
}
/**
 * Firestore trigger: recalculate player stats when a match is completed,
 * edited while completed, or uncompleted. Uses Admin SDK to write stats
 * to all player documents, bypassing client-side security rules.
 */
exports.recalculateStatsOnMatchUpdate = (0, firestore_1.onDocumentUpdated)('matches/{matchId}', async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    const justCompleted = before.status !== 'completed' && after.status === 'completed';
    const completedMatchEdited = after.status === 'completed' &&
        (JSON.stringify(before.games) !== JSON.stringify(after.games) ||
            before.winnerTeam !== after.winnerTeam);
    const wasUncompleted = before.status === 'completed' && after.status !== 'completed';
    if (!justCompleted && !completedMatchEdited && !wasUncompleted)
        return;
    // Union of before/after player IDs in case roster changed
    const playerIdSet = new Set([
        ...(before.allPlayerIds || []),
        ...(after.allPlayerIds || []),
    ]);
    const allPlayerIds = Array.from(playerIdSet);
    if (allPlayerIds.length === 0)
        return;
    console.log(`recalculateStatsOnMatchUpdate: match=${event.params.matchId} ` +
        `players=[${allPlayerIds.join(',')}]`);
    const batch = db.batch();
    let updatedCount = 0;
    for (const playerId of allPlayerIds) {
        try {
            const matchesSnapshot = await db
                .collection('matches')
                .where('allPlayerIds', 'array-contains', playerId)
                .get();
            const playerMatches = matchesSnapshot.docs.map((d) => d.data());
            const stats = calculateOverallStats(playerMatches, playerId);
            batch.update(db.collection('players').doc(playerId), {
                stats,
                updatedAt: Date.now(),
            });
            updatedCount++;
        }
        catch (error) {
            console.error(`recalculateStatsOnMatchUpdate: error for player ${playerId}:`, error);
        }
    }
    if (updatedCount > 0) {
        await batch.commit();
        console.log(`recalculateStatsOnMatchUpdate: updated stats for ${updatedCount} players`);
    }
});
/**
 * Callable function to permanently delete a user's account.
 * 1. Deletes the caller's player document from Firestore
 * 2. Deletes any unclaimed placeholder profiles created by the caller
 * 3. Deletes the caller's profile picture from Storage
 * 4. Deletes the caller's Firebase Auth account
 */
exports.deleteAccount = (0, https_1.onCall)(async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const callerUid = request.auth.uid;
    // Verify the caller's player document exists
    const playerDocRef = db.collection('players').doc(callerUid);
    const playerDoc = await playerDocRef.get();
    if (!playerDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Player document not found');
    }
    // Delete the Firebase Auth account FIRST — if this fails, Firestore stays intact
    await (0, auth_1.getAuth)().deleteUser(callerUid);
    console.log(`deleteAccount: deleted auth user ${callerUid}`);
    // Find all unclaimed placeholder profiles created by this user
    const placeholdersSnapshot = await db
        .collection('players')
        .where('invitedBy', '==', callerUid)
        .where('pendingClaim', '==', true)
        .get();
    // Batch delete: player doc + unclaimed placeholders
    const batch = db.batch();
    batch.delete(playerDocRef);
    let placeholdersRemoved = 0;
    placeholdersSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
        placeholdersRemoved++;
    });
    await batch.commit();
    console.log(`deleteAccount: deleted player ${callerUid} and ${placeholdersRemoved} unclaimed profiles`);
    // Delete profile picture from Storage (ignore if not found)
    try {
        await (0, storage_1.getStorage)().bucket().file(`profilePics/${callerUid}`).delete();
    }
    catch {
        // File may not exist, ignore
    }
    return { deleted: true, placeholdersRemoved };
});
/**
 * Firestore trigger: create match_invite notifications when a new match is created.
 * Runs server-side so notifications are guaranteed even if the client crashes.
 */
exports.createNotificationsOnMatchCreate = (0, firestore_1.onDocumentCreated)('matches/{matchId}', async (event) => {
    const match = event.data?.data();
    if (!match)
        return;
    const matchId = event.params.matchId;
    const senderId = match.createdBy;
    const allPlayerIds = match.allPlayerIds || [];
    if (allPlayerIds.length === 0)
        return;
    // Determine sender info: prefer denormalized fields, fall back to player doc
    let senderName = match.createdByName;
    let senderProfilePic = match.createdByProfilePic;
    if (!senderName) {
        const senderDoc = await db.collection('players').doc(senderId).get();
        senderName = senderDoc.exists ? (senderDoc.data().name || 'A player') : 'A player';
        senderProfilePic = senderDoc.exists ? senderDoc.data().profilePic : undefined;
    }
    // Pre-fetch recipient docs to skip placeholders (they'll get notifications when claimed)
    const recipientIds = allPlayerIds.filter(id => id !== senderId);
    const recipientDocs = await Promise.all(recipientIds.map(id => db.collection('players').doc(id).get()));
    const realRecipientIds = new Set(recipientDocs
        .filter(d => d.exists && d.data().pendingClaim !== true)
        .map(d => d.id));
    const batch = db.batch();
    const now = Date.now();
    let count = 0;
    for (const recipientId of allPlayerIds) {
        if (recipientId === senderId)
            continue;
        // Skip placeholders — they have no push tokens; notifications will be
        // created when the placeholder is claimed and the real UID is known
        if (!realRecipientIds.has(recipientId))
            continue;
        const team = (match.team1PlayerIds || []).includes(recipientId) ? 1 : 2;
        const notifId = `notif_${matchId}_${recipientId}`;
        const notifData = {
            id: notifId,
            type: 'match_invite',
            status: 'sent',
            recipientId,
            senderId,
            senderName,
            matchId,
            matchDate: match.scheduledDate,
            matchLocation: match.location || null,
            matchType: match.matchType,
            team,
            createdAt: now,
        };
        if (senderProfilePic)
            notifData.senderProfilePic = senderProfilePic;
        batch.set(db.collection('notifications').doc(notifId), notifData);
        count++;
    }
    if (count > 0) {
        await batch.commit();
        console.log(`[Notifications] createNotificationsOnMatchCreate: match=${matchId}, wrote ${count} match_invite docs`);
    }
});
/**
 * Firestore trigger: create notifications when a match is updated.
 * - Added players get match_invite
 * - Existing players get match_updated (timestamp-suffixed ID to avoid overwrite suppression)
 * - Removed players get match_cancelled
 */
exports.createNotificationsOnMatchUpdate = (0, firestore_1.onDocumentUpdated)('matches/{matchId}', async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    const matchId = event.params.matchId;
    const modifiedBy = after.lastModifiedBy;
    if (!modifiedBy)
        return;
    // Skip if no meaningful match fields changed
    const meaningfulFieldsChanged = (before.scheduledDate !== after.scheduledDate ||
        before.location !== after.location ||
        before.matchType !== after.matchType ||
        before.pointsToWin !== after.pointsToWin ||
        before.numberOfGames !== after.numberOfGames ||
        JSON.stringify(before.allPlayerIds) !== JSON.stringify(after.allPlayerIds) ||
        JSON.stringify(before.team1PlayerIds) !== JSON.stringify(after.team1PlayerIds) ||
        JSON.stringify(before.team2PlayerIds) !== JSON.stringify(after.team2PlayerIds));
    if (!meaningfulFieldsChanged)
        return;
    // Skip completion-related status changes (handled by stats trigger)
    if (before.status === 'completed' || after.status === 'completed')
        return;
    // Determine sender info
    let senderName = after.lastModifiedByName;
    let senderProfilePic = after.lastModifiedByProfilePic;
    if (!senderName) {
        const senderDoc = await db.collection('players').doc(modifiedBy).get();
        senderName = senderDoc.exists ? (senderDoc.data().name || 'A player') : 'A player';
        senderProfilePic = senderDoc.exists ? senderDoc.data().profilePic : undefined;
    }
    const oldPlayerIds = before.allPlayerIds || [];
    const newPlayerIds = after.allPlayerIds || [];
    const oldSet = new Set(oldPlayerIds);
    const newSet = new Set(newPlayerIds);
    const added = newPlayerIds.filter((id) => !oldSet.has(id) && id !== modifiedBy);
    const removed = oldPlayerIds.filter((id) => !newSet.has(id) && id !== modifiedBy);
    const existing = newPlayerIds.filter((id) => oldSet.has(id) && id !== modifiedBy);
    // Pre-fetch recipient docs to skip placeholders
    const allRecipientIds = [...new Set([...added, ...existing, ...removed])];
    const recipientDocs = await Promise.all(allRecipientIds.map(id => db.collection('players').doc(id).get()));
    const realRecipientIds = new Set(recipientDocs
        .filter(d => d.exists && d.data().pendingClaim !== true)
        .map(d => d.id));
    const batch = db.batch();
    const now = Date.now();
    const dateStr = new Date(after.scheduledDate).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
    });
    const matchTypeLabel = after.matchType === 'doubles' ? 'doubles' : 'singles';
    let count = 0;
    // Added players get match_invite (deterministic ID)
    for (const recipientId of added) {
        if (!realRecipientIds.has(recipientId))
            continue;
        const team = (after.team1PlayerIds || []).includes(recipientId) ? 1 : 2;
        const notifId = `notif_${matchId}_${recipientId}`;
        const notifData = {
            id: notifId, type: 'match_invite', status: 'sent',
            recipientId, senderId: modifiedBy, senderName,
            matchId, matchDate: after.scheduledDate,
            matchLocation: after.location || null,
            matchType: after.matchType, team, createdAt: now,
        };
        if (senderProfilePic)
            notifData.senderProfilePic = senderProfilePic;
        batch.set(db.collection('notifications').doc(notifId), notifData);
        count++;
    }
    // Existing players get match_updated (timestamp-suffixed ID)
    for (const recipientId of existing) {
        if (!realRecipientIds.has(recipientId))
            continue;
        const notifId = `notif_updated_${matchId}_${recipientId}_${(0, crypto_1.randomUUID)()}`;
        const notifData = {
            id: notifId, type: 'match_updated', status: 'sent',
            recipientId, senderId: modifiedBy, senderName,
            matchId, matchDate: after.scheduledDate,
            matchLocation: after.location || null,
            matchType: after.matchType,
            message: `${senderName} updated the ${matchTypeLabel} match on ${dateStr}`,
            createdAt: now,
        };
        if (senderProfilePic)
            notifData.senderProfilePic = senderProfilePic;
        batch.set(db.collection('notifications').doc(notifId), notifData);
        count++;
    }
    // Removed players get match_cancelled (timestamp-suffixed ID)
    for (const recipientId of removed) {
        if (!realRecipientIds.has(recipientId))
            continue;
        const notifId = `notif_removed_${matchId}_${recipientId}_${(0, crypto_1.randomUUID)()}`;
        const notifData = {
            id: notifId, type: 'match_cancelled', status: 'sent',
            recipientId, senderId: modifiedBy, senderName,
            matchId, matchDate: after.scheduledDate || before.scheduledDate,
            matchLocation: after.location || before.location || null,
            matchType: after.matchType || before.matchType,
            message: `${senderName} removed you from the ${matchTypeLabel} match on ${dateStr}`,
            createdAt: now,
        };
        if (senderProfilePic)
            notifData.senderProfilePic = senderProfilePic;
        batch.set(db.collection('notifications').doc(notifId), notifData);
        count++;
    }
    if (count > 0) {
        await batch.commit();
        console.log(`[Notifications] createNotificationsOnMatchUpdate: match=${matchId}, added=${added.length}, existing=${existing.length}, removed=${removed.length}`);
    }
});
/**
 * Callable function to resend match invite notifications.
 * Used by the "Resend Notifications" button in MatchDetailsScreen.
 */
exports.resendMatchNotifications = (0, https_1.onCall)({ invoker: "private" }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const matchId = request.data?.matchId;
    if (!matchId) {
        throw new https_1.HttpsError('invalid-argument', 'matchId is required');
    }
    const callerUid = request.auth.uid;
    const matchDoc = await db.collection('matches').doc(matchId).get();
    if (!matchDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Match not found');
    }
    const match = matchDoc.data();
    if (!match.allPlayerIds?.includes(callerUid)) {
        throw new https_1.HttpsError('permission-denied', 'Not a participant in this match');
    }
    // Look up sender info
    const senderDoc = await db.collection('players').doc(callerUid).get();
    const senderName = senderDoc.exists ? (senderDoc.data().name || 'A player') : 'A player';
    const senderProfilePic = senderDoc.exists ? senderDoc.data().profilePic : undefined;
    // Pre-fetch recipient docs to skip placeholders
    const recipientIds = match.allPlayerIds.filter((id) => id !== callerUid);
    const recipientDocs = await Promise.all(recipientIds.map((id) => db.collection('players').doc(id).get()));
    const realRecipientIds = new Set(recipientDocs
        .filter(d => d.exists && d.data().pendingClaim !== true)
        .map(d => d.id));
    const batch = db.batch();
    const now = Date.now();
    let count = 0;
    for (const recipientId of match.allPlayerIds) {
        if (recipientId === callerUid)
            continue;
        if (!realRecipientIds.has(recipientId))
            continue;
        const team = (match.team1PlayerIds || []).includes(recipientId) ? 1 : 2;
        const notifId = `notif_${matchId}_${recipientId}`;
        const notifData = {
            id: notifId, type: 'match_invite', status: 'sent',
            recipientId, senderId: callerUid, senderName,
            matchId, matchDate: match.scheduledDate,
            matchLocation: match.location || null,
            matchType: match.matchType, team, createdAt: now,
        };
        if (senderProfilePic)
            notifData.senderProfilePic = senderProfilePic;
        batch.set(db.collection('notifications').doc(notifId), notifData);
        count++;
    }
    if (count > 0) {
        await batch.commit();
    }
    console.log(`[Notifications] resendMatchNotifications: match=${matchId}, sender=${callerUid}, sent=${count}`);
    return { sent: count };
});
//# sourceMappingURL=index.js.map