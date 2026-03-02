"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushOnNotification = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const app_1 = require("firebase-admin/app");
const firestore_2 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
(0, app_1.initializeApp)();
const db = (0, firestore_2.getFirestore)();
exports.sendPushOnNotification = (0, firestore_1.onDocumentCreated)('notifications/{notificationId}', async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
        console.log('No data in notification document');
        return;
    }
    const notification = snapshot.data();
    if (notification.type !== 'match_invite') {
        console.log(`Skipping notification type: ${notification.type}`);
        return;
    }
    const recipientDoc = await db.collection('players').doc(notification.recipientId).get();
    if (!recipientDoc.exists) {
        console.log(`Recipient ${notification.recipientId} not found`);
        return;
    }
    const recipient = recipientDoc.data();
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
        const response = await (0, messaging_1.getMessaging)().sendEachForMulticast(message);
        console.log(`Push to ${notification.recipientId}: ` +
            `${response.successCount} success, ${response.failureCount} failure`);
        if (response.failureCount > 0) {
            const staleTokens = [];
            response.responses.forEach((resp, index) => {
                if (!resp.success && resp.error) {
                    const errorCode = resp.error.code;
                    if (errorCode === 'messaging/registration-token-not-registered' ||
                        errorCode === 'messaging/invalid-registration-token') {
                        staleTokens.push(tokens[index]);
                    }
                }
            });
            if (staleTokens.length > 0) {
                console.log(`Removing ${staleTokens.length} stale tokens for ${notification.recipientId}`);
                await db.collection('players').doc(notification.recipientId).update({
                    fcmTokens: firestore_2.FieldValue.arrayRemove(...staleTokens),
                });
            }
        }
    }
    catch (error) {
        console.error('Error sending push notification:', error);
    }
});
//# sourceMappingURL=index.js.map