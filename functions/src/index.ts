import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import Expo, { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

initializeApp();

const db = getFirestore();
const expo = new Expo();

interface MatchNotification {
  id: string;
  type: string;
  status: 'sent' | 'read';
  recipientId: string;
  senderId: string;
  senderName: string;
  matchId?: string;
  matchDate?: string;
  matchLocation?: string;
  matchType?: 'singles' | 'doubles';
  team?: 1 | 2;
  message?: string;
  createdAt: number;
  readAt?: number;
}

interface PlayerDoc {
  id: string;
  name: string;
  pushTokens?: string[];
}

export const sendPushOnNotification = onDocumentCreated(
  'notifications/{notificationId}',
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log('No data in notification document');
      return;
    }

    const notification = snapshot.data() as MatchNotification;

    if (notification.type !== 'match_invite' && notification.type !== 'player_invite') {
      console.log(`Skipping notification type: ${notification.type}`);
      return;
    }

    const recipientDoc = await db.collection('players').doc(notification.recipientId).get();
    if (!recipientDoc.exists) {
      console.log(`Recipient ${notification.recipientId} not found`);
      return;
    }

    const recipient = recipientDoc.data() as PlayerDoc;
    const tokens = (recipient.pushTokens ?? []).filter(t => Expo.isExpoPushToken(t));

    if (tokens.length === 0) {
      console.log(`No push tokens for recipient ${notification.recipientId}`);
      return;
    }

    let title: string;
    let body: string;

    if (notification.type === 'match_invite') {
      const matchTypeLabel = notification.matchType === 'doubles' ? 'doubles' : 'singles';
      const dateStr = notification.matchDate
        ? new Date(notification.matchDate).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })
        : 'TBD';
      title = 'New Match Invite';
      body = `${notification.senderName} invited you to a ${matchTypeLabel} match on ${dateStr}`;
    } else {
      title = 'New Player Invite';
      body = notification.message || `${notification.senderName} wants to add you as a player on PickleGo!`;
    }

    const messages: ExpoPushMessage[] = tokens.map(token => ({
      to: token,
      sound: 'default' as const,
      title,
      body,
      channelId: 'match-invites',
      data: {
        ...(notification.matchId ? { matchId: notification.matchId } : {}),
        screen: notification.type === 'match_invite' ? 'MatchDetails' : 'Notifications',
        notificationId: notification.id,
      },
    }));

    try {
      const chunks = expo.chunkPushNotifications(messages);
      let successCount = 0;
      let failureCount = 0;
      const staleTokens: string[] = [];

      for (const chunk of chunks) {
        const ticketChunk: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk);

        ticketChunk.forEach((ticket, index) => {
          if (ticket.status === 'ok') {
            successCount++;
          } else {
            failureCount++;
            if (ticket.details?.error === 'DeviceNotRegistered') {
              staleTokens.push(chunk[index].to as string);
            }
          }
        });
      }

      console.log(
        `Push to ${notification.recipientId}: ` +
        `${successCount} success, ${failureCount} failure`
      );

      if (staleTokens.length > 0) {
        console.log(`Removing ${staleTokens.length} stale tokens for ${notification.recipientId}`);
        await db.collection('players').doc(notification.recipientId).update({
          pushTokens: FieldValue.arrayRemove(...staleTokens),
        });
      }
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }
);

/**
 * Callable function to claim a placeholder profile.
 * When a user signs up with an email that matches a pending placeholder,
 * this function atomically transfers match history, merges stats, and
 * deletes the placeholder — all via Admin SDK to bypass security rules.
 */
export const claimPlaceholderProfile = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  const realUid = request.auth.uid;
  const realEmail = request.auth.token.email;

  const realName = request.data?.name as string | undefined;

  if (!realEmail) {
    throw new HttpsError('failed-precondition', 'User must have an email');
  }
  if (!realName || typeof realName !== 'string') {
    throw new HttpsError('invalid-argument', 'Name is required');
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

    const replaceId = (ids: string[]) =>
      ids.map((id: string) => (id === placeholderId ? realUid : id));

    const replaceName = (ids: string[], names: string[]) =>
      ids.map((id: string, i: number) => (id === placeholderId ? realName : names[i]));

    batch.update(matchDoc.ref, {
      allPlayerIds: replaceId(match.allPlayerIds),
      team1PlayerIds: replaceId(match.team1PlayerIds),
      team2PlayerIds: replaceId(match.team2PlayerIds),
      team1PlayerNames: replaceName(match.team1PlayerIds, match.team1PlayerNames),
      team2PlayerNames: replaceName(match.team2PlayerIds, match.team2PlayerNames),
    });
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

  console.log(
    `Claimed placeholder ${placeholderId} -> ${realUid} (${matchesSnapshot.size} matches updated)`
  );

  return { claimed: true, matchesUpdated: matchesSnapshot.size };
});
