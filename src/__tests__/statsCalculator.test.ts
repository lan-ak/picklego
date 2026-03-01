import { calculatePlayerStats } from '../utils/statsCalculator';
import { Match } from '../types';

function makeMatch(overrides: Partial<Match> & { id: string }): Match {
  return {
    createdBy: 'p1',
    createdAt: Date.now(),
    lastModifiedAt: Date.now(),
    lastModifiedBy: 'p1',
    scheduledDate: new Date().toISOString(),
    matchType: 'singles',
    pointsToWin: 11,
    numberOfGames: 1,
    location: 'Test Court',
    status: 'completed',
    team1PlayerIds: ['p1'],
    team2PlayerIds: ['p2'],
    team1PlayerNames: ['Player 1'],
    team2PlayerNames: ['Player 2'],
    allPlayerIds: ['p1', 'p2'],
    games: [{ team1Score: 11, team2Score: 5, winnerTeam: 1 }],
    winnerTeam: 1,
    ...overrides,
  };
}

describe('calculatePlayerStats', () => {
  test('single win produces correct stats', () => {
    const matches = [makeMatch({ id: 'm1' })];
    const stats = calculatePlayerStats(matches, 'p1');
    expect(stats.overall.totalMatches).toBe(1);
    expect(stats.overall.wins).toBe(1);
    expect(stats.overall.losses).toBe(0);
    expect(stats.overall.winPercentage).toBe(100);
  });

  test('single loss produces correct stats', () => {
    const matches = [makeMatch({ id: 'm1' })];
    const stats = calculatePlayerStats(matches, 'p2');
    expect(stats.overall.totalMatches).toBe(1);
    expect(stats.overall.wins).toBe(0);
    expect(stats.overall.losses).toBe(1);
  });

  test('multiple matches compute win percentage correctly', () => {
    const matches = [
      makeMatch({ id: 'm1', winnerTeam: 1 }),
      makeMatch({ id: 'm2', winnerTeam: 2 }),
      makeMatch({ id: 'm3', winnerTeam: 1 }),
    ];
    const stats = calculatePlayerStats(matches, 'p1');
    expect(stats.overall.totalMatches).toBe(3);
    expect(stats.overall.wins).toBe(2);
    expect(stats.overall.losses).toBe(1);
    expect(stats.overall.winPercentage).toBeCloseTo(66.7, 0);
  });

  test('win streak is calculated correctly', () => {
    const matches = [
      makeMatch({ id: 'm1', winnerTeam: 1, scheduledDate: '2024-01-01T10:00:00Z' }),
      makeMatch({ id: 'm2', winnerTeam: 2, scheduledDate: '2024-01-02T10:00:00Z' }),
      makeMatch({ id: 'm3', winnerTeam: 1, scheduledDate: '2024-01-03T10:00:00Z' }),
      makeMatch({ id: 'm4', winnerTeam: 1, scheduledDate: '2024-01-04T10:00:00Z' }),
      makeMatch({ id: 'm5', winnerTeam: 1, scheduledDate: '2024-01-05T10:00:00Z' }),
    ];
    const stats = calculatePlayerStats(matches, 'p1');
    expect(stats.overall.currentWinStreak).toBe(3);
    expect(stats.overall.bestWinStreak).toBe(3);
  });

  test('singles vs doubles split correctly', () => {
    const matches = [
      makeMatch({ id: 'm1', matchType: 'singles' }),
      makeMatch({
        id: 'm2',
        matchType: 'doubles',
        team1PlayerIds: ['p1', 'p3'],
        team2PlayerIds: ['p2', 'p4'],
        allPlayerIds: ['p1', 'p2', 'p3', 'p4'],
        winnerTeam: 1,
      }),
    ];
    const stats = calculatePlayerStats(matches, 'p1');
    expect(stats.overall.totalMatches).toBe(2);
    expect(stats.singles.totalMatches).toBe(1);
    expect(stats.doubles.totalMatches).toBe(1);
  });

  test('empty matches returns zero stats', () => {
    const stats = calculatePlayerStats([], 'p1');
    expect(stats.overall.totalMatches).toBe(0);
    expect(stats.overall.wins).toBe(0);
    expect(stats.overall.winPercentage).toBe(0);
    expect(stats.overall.currentWinStreak).toBe(0);
  });

  test('scheduled matches are excluded', () => {
    const matches = [makeMatch({ id: 'm1', status: 'scheduled', winnerTeam: null, games: [] })];
    const stats = calculatePlayerStats(matches, 'p1');
    expect(stats.overall.totalMatches).toBe(0);
  });

  test('game-level stats are correct', () => {
    const matches = [
      makeMatch({
        id: 'm1',
        numberOfGames: 3,
        games: [
          { team1Score: 11, team2Score: 5, winnerTeam: 1 },
          { team1Score: 7, team2Score: 11, winnerTeam: 2 },
          { team1Score: 11, team2Score: 9, winnerTeam: 1 },
        ],
        winnerTeam: 1,
      }),
    ];
    const stats = calculatePlayerStats(matches, 'p1');
    expect(stats.overall.totalGames).toBe(3);
    expect(stats.overall.gameWins).toBe(2);
    expect(stats.overall.gameLosses).toBe(1);
  });
});
