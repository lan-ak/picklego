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

// --- Server-only IDs (not needed on client) ---

/** Invite accepted notification */
export const inviteAcceptedNotifId = (callerId: string, senderId: string) =>
  `invite_accepted_${callerId}_${senderId}_${randomUUID()}`;

/** Match updated notification */
export const matchUpdatedNotifId = (matchId: string, recipientId: string) =>
  `notif_updated_${matchId}_${recipientId}_${randomUUID()}`;

/** Match removed notification (roster change) */
export const matchRemovedNotifId = (matchId: string, recipientId: string) =>
  `notif_removed_${matchId}_${recipientId}_${randomUUID()}`;

// --- Shared IDs (keep in sync with src/utils/ids.ts) ---

/** Open match join notification — idempotent per match+joiner */
export const openMatchJoinNotifId = (matchId: string, joinerId: string) =>
  `open_match_join_${matchId}_${joinerId}`;

/** Open match leave notification */
export const openMatchLeaveNotifId = (matchId: string, leaverId: string) =>
  `open_match_leave_${matchId}_${leaverId}_${randomUUID()}`;

/** Open match full notification — idempotent per match+recipient */
export const openMatchFullNotifId = (matchId: string, recipientId: string) =>
  `open_match_full_${matchId}_${recipientId}`;
