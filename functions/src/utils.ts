/**
 * Shared utilities for Cloud Functions.
 */

/** Fisher-Yates shuffle (in-place on a copy). */
export function shuffleArray<T>(arr: T[]): T[] {
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
export function assignTeams(
  playerIds: string[],
  nameMap: Record<string, string>,
): { team1PlayerIds: string[]; team2PlayerIds: string[]; team1PlayerNames: string[]; team2PlayerNames: string[] } {
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

/** Base fields every notification shares. */
interface NotificationBase {
  id: string;
  type: string;
  recipientId: string;
  senderId: string;
  senderName: string;
  matchId: string;
  matchDate: string | null;
  matchLocation: string | null;
  matchType: string;
  message: string;
  createdAt: number;
  senderProfilePic?: string;
}

/**
 * Build a notification document object, handling optional profilePic cleanly.
 */
export function buildNotification(fields: NotificationBase): Record<string, any> {
  const doc: Record<string, any> = {
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
  if (fields.senderProfilePic) doc.senderProfilePic = fields.senderProfilePic;
  return doc;
}
