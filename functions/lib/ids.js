"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openMatchFullNotifId = exports.openMatchLeaveNotifId = exports.openMatchJoinNotifId = exports.matchRemovedNotifId = exports.matchUpdatedNotifId = exports.inviteAcceptedNotifId = exports.matchCancelledNotifId = exports.matchInviteNotifId = exports.playerInviteNotifId = exports.newPlaceholderPlayerId = exports.newMatchId = void 0;
// SYNC: keep deterministic ID formats in sync with src/utils/ids.ts
const crypto_1 = require("crypto");
/** New match document ID */
const newMatchId = () => (0, crypto_1.randomUUID)();
exports.newMatchId = newMatchId;
/** New placeholder player document ID */
const newPlaceholderPlayerId = () => (0, crypto_1.randomUUID)();
exports.newPlaceholderPlayerId = newPlaceholderPlayerId;
/** Player invite notification — idempotent, prevents duplicate invites */
const playerInviteNotifId = (senderId, recipientId) => `player_invite_${senderId}_${recipientId}`;
exports.playerInviteNotifId = playerInviteNotifId;
/** Match invite notification — idempotent per match+recipient */
const matchInviteNotifId = (matchId, recipientId) => `notif_${matchId}_${recipientId}`;
exports.matchInviteNotifId = matchInviteNotifId;
/** Match cancelled notification */
const matchCancelledNotifId = (matchId, recipientId, timestamp) => `notif_cancelled_${matchId}_${recipientId}_${timestamp}`;
exports.matchCancelledNotifId = matchCancelledNotifId;
// --- Server-only IDs (not needed on client) ---
/** Invite accepted notification */
const inviteAcceptedNotifId = (callerId, senderId) => `invite_accepted_${callerId}_${senderId}_${(0, crypto_1.randomUUID)()}`;
exports.inviteAcceptedNotifId = inviteAcceptedNotifId;
/** Match updated notification */
const matchUpdatedNotifId = (matchId, recipientId) => `notif_updated_${matchId}_${recipientId}_${(0, crypto_1.randomUUID)()}`;
exports.matchUpdatedNotifId = matchUpdatedNotifId;
/** Match removed notification (roster change) */
const matchRemovedNotifId = (matchId, recipientId) => `notif_removed_${matchId}_${recipientId}_${(0, crypto_1.randomUUID)()}`;
exports.matchRemovedNotifId = matchRemovedNotifId;
// --- Shared IDs (keep in sync with src/utils/ids.ts) ---
/** Open match join notification — idempotent per match+joiner */
const openMatchJoinNotifId = (matchId, joinerId) => `open_match_join_${matchId}_${joinerId}`;
exports.openMatchJoinNotifId = openMatchJoinNotifId;
/** Open match leave notification */
const openMatchLeaveNotifId = (matchId, leaverId) => `open_match_leave_${matchId}_${leaverId}_${(0, crypto_1.randomUUID)()}`;
exports.openMatchLeaveNotifId = openMatchLeaveNotifId;
/** Open match full notification — idempotent per match+recipient */
const openMatchFullNotifId = (matchId, recipientId) => `open_match_full_${matchId}_${recipientId}`;
exports.openMatchFullNotifId = openMatchFullNotifId;
//# sourceMappingURL=ids.js.map