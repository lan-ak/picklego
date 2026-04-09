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

/** Open match join notification — idempotent per match+joiner */
export const openMatchJoinNotifId = (matchId: string, joinerId: string) =>
  `open_match_join_${matchId}_${joinerId}`;

/** Open match leave notification */
export const openMatchLeaveNotifId = (matchId: string, leaverId: string) =>
  `open_match_leave_${matchId}_${leaverId}_${Crypto.randomUUID()}`;

/** Open match full notification — idempotent per match+recipient */
export const openMatchFullNotifId = (matchId: string, recipientId: string) =>
  `open_match_full_${matchId}_${recipientId}`;

/** Open match waitlist join notification — idempotent per match+joiner */
export const openMatchWaitlistJoinNotifId = (matchId: string, joinerId: string) =>
  `open_match_waitlist_join_${matchId}_${joinerId}`;

/** Open match waitlist promoted notification */
export const openMatchWaitlistPromotedNotifId = (matchId: string, promotedId: string) =>
  `open_match_waitlist_promoted_${matchId}_${promotedId}_${Crypto.randomUUID()}`;
