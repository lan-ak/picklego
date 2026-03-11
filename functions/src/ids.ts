// SYNC: keep deterministic ID formats in sync with src/utils/ids.ts
import { randomUUID } from 'crypto';

/** New match document ID */
export const newMatchId = () => randomUUID();

/** New placeholder player document ID */
export const newPlaceholderPlayerId = () => randomUUID();

/** Player invite notification — idempotent, prevents duplicate invites */
export const playerInviteNotifId = (senderId: string, recipientId: string) =>
  `player_invite_${senderId}_${recipientId}`;

/** Match invite notification — idempotent per match+recipient */
export const matchInviteNotifId = (matchId: string, recipientId: string) =>
  `notif_${matchId}_${recipientId}`;

/** Match cancelled notification */
export const matchCancelledNotifId = (matchId: string, recipientId: string, timestamp: number) =>
  `notif_cancelled_${matchId}_${recipientId}_${timestamp}`;

/** Invite accepted notification */
export const inviteAcceptedNotifId = (callerId: string, senderId: string) =>
  `invite_accepted_${callerId}_${senderId}_${randomUUID()}`;

/** Match updated notification */
export const matchUpdatedNotifId = (matchId: string, recipientId: string) =>
  `notif_updated_${matchId}_${recipientId}_${randomUUID()}`;

/** Match removed notification (roster change) */
export const matchRemovedNotifId = (matchId: string, recipientId: string) =>
  `notif_removed_${matchId}_${recipientId}_${randomUUID()}`;
