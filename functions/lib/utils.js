"use strict";
/**
 * Shared utilities for Cloud Functions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.shuffleArray = shuffleArray;
exports.assignTeams = assignTeams;
exports.buildNotification = buildNotification;
/** Fisher-Yates shuffle (in-place on a copy). */
function shuffleArray(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
/**
 * Assign shuffled players into two equal teams.
 * Returns team arrays and name arrays (looked up from nameMap).
 */
function assignTeams(playerIds, nameMap) {
    const halfSize = Math.floor(playerIds.length / 2);
    const shuffled = shuffleArray(playerIds);
    const team1PlayerIds = shuffled.slice(0, halfSize);
    const team2PlayerIds = shuffled.slice(halfSize);
    return {
        team1PlayerIds,
        team2PlayerIds,
        team1PlayerNames: team1PlayerIds.map(id => nameMap[id] || 'A player'),
        team2PlayerNames: team2PlayerIds.map(id => nameMap[id] || 'A player'),
    };
}
/**
 * Build a notification document object, handling optional profilePic cleanly.
 */
function buildNotification(fields) {
    const doc = {
        id: fields.id,
        type: fields.type,
        status: 'sent',
        recipientId: fields.recipientId,
        senderId: fields.senderId,
        senderName: fields.senderName,
        matchId: fields.matchId,
        matchDate: fields.matchDate,
        matchLocation: fields.matchLocation,
        matchType: fields.matchType,
        message: fields.message,
        createdAt: fields.createdAt,
    };
    if (fields.senderProfilePic)
        doc.senderProfilePic = fields.senderProfilePic;
    return doc;
}
//# sourceMappingURL=utils.js.map