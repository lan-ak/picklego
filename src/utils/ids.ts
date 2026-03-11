// SYNC: keep deterministic ID formats in sync with functions/src/ids.ts
import * as Crypto from 'expo-crypto';

/** New match document ID */
export const newMatchId = () => Crypto.randomUUID();

/** New placeholder player document ID */
export const newPlaceholderPlayerId = () => Crypto.randomUUID();

/** Player invite notification — idempotent, prevents duplicate invites */
export const playerInviteNotifId = (senderId: string, recipientId: string) =>
  `player_invite_${senderId}_${recipientId}`;

/** Match invite notification — idempotent per match+recipient */
export const matchInviteNotifId = (matchId: string, recipientId: string) =>
  `notif_${matchId}_${recipientId}`;

/** Match cancelled notification */
export const matchCancelledNotifId = (matchId: string, recipientId: string, timestamp: number) =>
  `notif_cancelled_${matchId}_${recipientId}_${timestamp}`;
