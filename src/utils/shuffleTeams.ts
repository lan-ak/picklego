/**
 * Shuffles an array of 4 player IDs into two teams of 2 using Fisher-Yates.
 * The currentUserId is guaranteed to appear on team1 (matching the app convention).
 */
export function shuffleTeams(
  playerIds: string[],
  currentUserId: string
): { team1: string[]; team2: string[] } {
  const shuffled = [...playerIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const team1 = shuffled.slice(0, 2);
  const team2 = shuffled.slice(2, 4);

  if (team2.includes(currentUserId)) {
    return { team1: team2, team2: team1 };
  }

  return { team1, team2 };
}
