import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

initializeApp();

const db = getFirestore();

interface MatchNotification {
  id: string;
  type: string;
  status: 'sent' | 'read';
  recipientId: string;
  senderId: string;
  senderName: string;
  matchId: string;
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
  fcmTokens?: string[];
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

    if (notification.type !== 'match_invite') {
      console.log(`Skipping notification type: ${notification.type}`);
      return;
    }

    const recipientDoc = await db.collection('players').doc(notification.recipientId).get();
    if (!recipientDoc.exists) {
      console.log(`Recipient ${notification.recipientId} not found`);
      return;
    }

    const recipient = recipientDoc.data() as PlayerDoc;
    const tokens = recipient.fcmTokens;

    if (!tokens || tokens.length === 0) {
      console.log(`No FCM tokens for recipient ${notification.recipientId}`);
      return;
    }

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

    const title = 'New Match Invite';
    const body = `${notification.senderName} invited you to a ${matchTypeLabel} match on ${dateStr}`;

    const message = {
      tokens,
      notification: {
        title,
        body,
      },
      data: {
        matchId: notification.matchId,
        screen: 'MatchDetails',
        notificationId: notification.id,
      },
      android: {
        notification: {
          channelId: 'match-invites',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
          },
        },
      },
    };

    try {
      const response = await getMessaging().sendEachForMulticast(message);

      console.log(
        `Push to ${notification.recipientId}: ` +
        `${response.successCount} success, ${response.failureCount} failure`
      );

      if (response.failureCount > 0) {
        const staleTokens: string[] = [];

        response.responses.forEach((resp, index) => {
          if (!resp.success && resp.error) {
            const errorCode = resp.error.code;
            if (
              errorCode === 'messaging/registration-token-not-registered' ||
              errorCode === 'messaging/invalid-registration-token'
            ) {
              staleTokens.push(tokens[index]);
            }
          }
        });

        if (staleTokens.length > 0) {
          console.log(`Removing ${staleTokens.length} stale tokens for ${notification.recipientId}`);
          await db.collection('players').doc(notification.recipientId).update({
            fcmTokens: FieldValue.arrayRemove(...staleTokens),
          });
        }
      }
    } catch (error) {
      console.error('Error sending push notification:', error);
    }
  }
);
