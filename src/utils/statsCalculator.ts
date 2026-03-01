import { Match } from '../types';

export interface StatsBreakdown {
  totalMatches: number;
  wins: number;
  losses: number;
  winPercentage: number;
  totalGames: number;
  gameWins: number;
  gameLosses: number;
  currentWinStreak: number;
  bestWinStreak: number;
}

export interface DerivedPlayerStats {
  overall: StatsBreakdown;
  singles: StatsBreakdown;
  doubles: StatsBreakdown;
}

function emptyStats(): StatsBreakdown {
  return {
    totalMatches: 0,
    wins: 0,
    losses: 0,
    winPercentage: 0,
    totalGames: 0,
    gameWins: 0,
    gameLosses: 0,
    currentWinStreak: 0,
    bestWinStreak: 0,
  };
}

function computeStreaks(matchResults: boolean[]): { current: number; best: number } {
  let current = 0;
  let best = 0;
  let streak = 0;

  for (const won of matchResults) {
    if (won) {
      streak++;
      if (streak > best) best = streak;
    } else {
      streak = 0;
    }
  }
  current = streak;
  return { current, best };
}

function buildBreakdown(matches: Match[], playerId: string): StatsBreakdown {
  const stats = emptyStats();
  if (matches.length === 0) return stats;

  // Sort by scheduledDate for streak calculation
  const sorted = [...matches].sort(
    (a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
  );

  const results: boolean[] = [];

  for (const match of sorted) {
    const userTeam = match.team1PlayerIds.includes(playerId) ? 1 : 2;
    const won = match.winnerTeam === userTeam;

    stats.totalMatches++;
    if (won) {
      stats.wins++;
    } else {
      stats.losses++;
    }
    results.push(won);

    // Game-level stats
    for (const game of match.games) {
      stats.totalGames++;
      if (game.winnerTeam === userTeam) {
        stats.gameWins++;
      } else {
        stats.gameLosses++;
      }
    }
  }

  stats.winPercentage = stats.totalMatches > 0
    ? Math.round((stats.wins / stats.totalMatches) * 1000) / 10
    : 0;

  const streaks = computeStreaks(results);
  stats.currentWinStreak = streaks.current;
  stats.bestWinStreak = streaks.best;

  return stats;
}

export function calculatePlayerStats(matches: Match[], playerId: string): DerivedPlayerStats {
  const completedMatches = matches.filter(
    m => m.status === 'completed' && m.allPlayerIds.includes(playerId)
  );

  const singlesMatches = completedMatches.filter(m => m.matchType === 'singles');
  const doublesMatches = completedMatches.filter(m => m.matchType === 'doubles');

  return {
    overall: buildBreakdown(completedMatches, playerId),
    singles: buildBreakdown(singlesMatches, playerId),
    doubles: buildBreakdown(doublesMatches, playerId),
  };
}
