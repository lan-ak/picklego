"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recalculateStatsOnMatchUpdate = exports.lookupPhoneNumbers = exports.claimSMSInvite = exports.createSMSInvite = exports.sendPushOnNotificationWrite = exports.claimPlaceholderProfile = exports.acceptPlayerInvite = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const v1_1 = require("firebase-functions/v1");
const app_1 = require("firebase-admin/app");
const firestore_2 = require("firebase-admin/firestore");
const expo_server_sdk_1 = require("expo-server-sdk");
const app = (0, app_1.initializeApp)();
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
    // Fetch and validate the notification
    const notifRef = db.collection('notifications').doc(notificationId);
    const notifDoc = await notifRef.get();
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
    const callerDoc = await db.collection('players').doc(callerUid).get();
    const callerName = callerDoc.exists ? (callerDoc.data().name || 'A player') : 'A player';
    const callerProfilePic = callerDoc.exists ? callerDoc.data().profilePic : undefined;
    const batch = db.batch();
    // Add bidirectional connections
    batch.update(db.collection('players').doc(callerUid), {
        connections: firestore_2.FieldValue.arrayUnion(senderId),
        updatedAt: now,
    });
    batch.update(db.collection('players').doc(senderId), {
        connections: firestore_2.FieldValue.arrayUnion(callerUid),
        updatedAt: now,
    });
    // Update the invite notification to accepted
    batch.update(notifRef, {
        status: 'accepted',
        respondedAt: now,
    });
    // Create invite_accepted notification for the sender
    const acceptNotifId = `invite_accepted_${callerUid}_${senderId}_${now}`;
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
    batch.set(db.collection('notifications').doc(acceptNotifId), acceptNotifData);
    await batch.commit();
    console.log(`Player invite accepted: ${callerUid} <-> ${senderId}`);
    return { accepted: true, senderId, acceptNotificationId: acceptNotifId };
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
    if (!request.auth.token.email_verified) {
        throw new https_1.HttpsError('failed-precondition', 'Email must be verified to claim a profile');
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
    const placeholderData = placeholderDoc.data();
    // Query all matches referencing the placeholder
    const matchesSnapshot = await db.collection('matches')
        .where('allPlayerIds', 'array-contains', placeholderId)
        .get();
    const batch = db.batch();
    // Update each match: swap placeholder ID/name for the real user
    for (const matchDoc of matchesSnapshot.docs) {
        const match = matchDoc.data();
        const replaceId = (ids) => ids.map((id) => (id === placeholderId ? realUid : id));
        const replaceName = (ids, names) => ids.map((id, i) => (id === placeholderId ? realName : names[i]));
        batch.update(matchDoc.ref, {
            allPlayerIds: replaceId(match.allPlayerIds),
            team1PlayerIds: replaceId(match.team1PlayerIds),
            team2PlayerIds: replaceId(match.team2PlayerIds),
            team1PlayerNames: replaceName(match.team1PlayerIds, match.team1PlayerNames),
            team2PlayerNames: replaceName(match.team2PlayerIds, match.team2PlayerNames),
        });
    }
    // Migrate notifications: swap placeholder ID for real UID
    const notifAsRecipient = await db.collection('notifications')
        .where('recipientId', '==', placeholderId)
        .get();
    for (const notifDoc of notifAsRecipient.docs) {
        batch.update(notifDoc.ref, { recipientId: realUid });
    }
    const notifAsSender = await db.collection('notifications')
        .where('senderId', '==', placeholderId)
        .get();
    for (const notifDoc of notifAsSender.docs) {
        batch.update(notifDoc.ref, { senderId: realUid });
    }
    // Merge stats from placeholder into the real player
    const pStats = placeholderData.stats;
    if (pStats && pStats.totalMatches > 0) {
        const realPlayerDoc = await playersRef.doc(realUid).get();
        if (realPlayerDoc.exists) {
            const rStats = realPlayerDoc.data()?.stats || {};
            const totalMatches = (rStats.totalMatches || 0) + pStats.totalMatches;
            const wins = (rStats.wins || 0) + pStats.wins;
            batch.update(playersRef.doc(realUid), {
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
    batch.delete(placeholderDoc.ref);
    await batch.commit();
    console.log(`Claimed placeholder ${placeholderId} -> ${realUid} ` +
        `(${matchesSnapshot.size} matches, ${notifAsRecipient.size + notifAsSender.size} notifications updated)`);
    return { claimed: true, matchesUpdated: matchesSnapshot.size };
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
    // Only send push for notifications with status 'sent'
    if (notification.status !== 'sent')
        return;
    // Only send push for types that warrant a push
    if (!['match_invite', 'match_updated', 'match_cancelled', 'player_invite'].includes(notification.type))
        return;
    // If this is an update, skip if nothing meaningful changed
    if (change.before.exists) {
        const before = change.before.data();
        if (before.status === 'sent' && before.createdAt === notification.createdAt)
            return;
    }
    // Look up recipient's push tokens
    const recipientDoc = await db.collection('players').doc(notification.recipientId).get();
    if (!recipientDoc.exists)
        return;
    const pushTokens = (recipientDoc.data().pushTokens || [])
        .filter((t) => expo_server_sdk_1.default.isExpoPushToken(t));
    if (pushTokens.length === 0)
        return;
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
        await db.collection('players').doc(notification.recipientId).update({
            pushTokens: firestore_2.FieldValue.arrayRemove(...staleTokens),
        });
    }
    console.log(`sendPushOnNotificationWrite: sent push for ${notification.type} to ${notification.recipientId} (${pushTokens.length} tokens)`);
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
    const inviteDoc = await inviteRef.get();
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
    const now = Date.now();
    const senderId = invite.inviterId;
    // Look up caller name
    const callerDoc = await db.collection('players').doc(callerUid).get();
    const callerName = callerDoc.exists ? (callerDoc.data().name || 'A player') : 'A player';
    const callerProfilePic = callerDoc.exists ? callerDoc.data().profilePic : undefined;
    const batch = db.batch();
    // Add bidirectional connections
    batch.update(db.collection('players').doc(callerUid), {
        connections: firestore_2.FieldValue.arrayUnion(senderId),
        updatedAt: now,
    });
    batch.update(db.collection('players').doc(senderId), {
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
    batch.update(inviteRef, fullyClaimedUpdate);
    // Create invite_accepted notification for the inviter
    const acceptNotifId = `invite_accepted_${callerUid}_${senderId}_${now}`;
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
    batch.set(db.collection('notifications').doc(acceptNotifId), acceptNotifData);
    await batch.commit();
    console.log(`SMS invite claimed: ${inviteId} by ${callerUid}, connected with ${senderId}`);
    // Check for SMS-originated placeholders (no email) created by the inviter for AddMatch context.
    // These need to be merged into the new user's account so match history transfers.
    try {
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
            const placeholderId = placeholderDoc.id;
            // Transfer matches: replace placeholder ID with the new user's ID
            const matchesSnapshot = await db.collection('matches')
                .where('allPlayerIds', 'array-contains', placeholderId)
                .get();
            const claimBatch = db.batch();
            let matchesUpdated = 0;
            for (const matchDoc of matchesSnapshot.docs) {
                const match = matchDoc.data();
                const updatedAllPlayerIds = (match.allPlayerIds || []).map((id) => id === placeholderId ? callerUid : id);
                const updatedTeam1 = (match.team1 || []).map((id) => id === placeholderId ? callerUid : id);
                const updatedTeam2 = (match.team2 || []).map((id) => id === placeholderId ? callerUid : id);
                claimBatch.update(matchDoc.ref, {
                    allPlayerIds: updatedAllPlayerIds,
                    team1: updatedTeam1,
                    team2: updatedTeam2,
                });
                matchesUpdated++;
            }
            // Mark placeholder as claimed
            claimBatch.update(placeholderDoc.ref, {
                pendingClaim: false,
                claimedBy: callerUid,
                updatedAt: now,
            });
            await claimBatch.commit();
            console.log(`SMS placeholder ${placeholderId} claimed by ${callerUid}, ${matchesUpdated} matches updated`);
            break; // Only claim one placeholder per inviter
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
    if (!phoneHashes || !Array.isArray(phoneHashes) || phoneHashes.length === 0) {
        throw new https_1.HttpsError('invalid-argument', 'phoneHashes is required');
    }
    // Limit batch size to prevent abuse
    if (phoneHashes.length > 500) {
        throw new https_1.HttpsError('invalid-argument', 'Maximum 500 phone hashes per request');
    }
    const callerUid = request.auth.uid;
    const results = {};
    // Firestore 'in' queries support max 30 items, so chunk
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
    return { matches: results };
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
//# sourceMappingURL=index.js.map