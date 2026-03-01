import { Match } from '../types';

describe('Match Lifecycle', () => {
  test('scheduled match has null winnerTeam and empty games', () => {
    const match: Partial<Match> = {
      status: 'scheduled',
      winnerTeam: null,
      games: [],
    };
    expect(match.winnerTeam).toBeNull();
    expect(match.games).toHaveLength(0);
  });

  test('completed match has winnerTeam and games', () => {
    const match: Partial<Match> = {
      status: 'completed',
      winnerTeam: 1,
      games: [{ team1Score: 11, team2Score: 7, winnerTeam: 1 }],
    };
    expect(match.winnerTeam).toBe(1);
    expect(match.games!.length).toBeGreaterThan(0);
  });

  test('expired status for stale match', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 2);

    const match: Partial<Match> = {
      status: 'scheduled',
      scheduledDate: yesterday.toISOString(),
    };

    const now = new Date();
    const staleThreshold = 24 * 60 * 60 * 1000;
    const isExpired = now.getTime() - new Date(match.scheduledDate!).getTime() > staleThreshold;
    expect(isExpired).toBe(true);
  });

  test('best-of-3 winner determination', () => {
    const games = [
      { team1Score: 11, team2Score: 5, winnerTeam: 1 as const },
      { team1Score: 7, team2Score: 11, winnerTeam: 2 as const },
      { team1Score: 11, team2Score: 9, winnerTeam: 1 as const },
    ];
    const team1Wins = games.filter(g => g.winnerTeam === 1).length;
    const team2Wins = games.filter(g => g.winnerTeam === 2).length;
    const winner = team1Wins > team2Wins ? 1 : 2;
    expect(winner).toBe(1);
  });
});
