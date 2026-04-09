import { requireNativeModule, EventEmitter } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

interface MatchCompletedPayload {
  action: string;
  match: {
    phoneMatchId: string;
    games: Array<{
      team1Score: number;
      team2Score: number;
      winnerTeam: number;
      rallyLog?: Array<{
        rallyNumber: number;
        rallyWinner: 1 | 2;
        type: 'point' | 'sideout';
        team1Score: number;
        team2Score: number;
        servingTeam: 1 | 2;
        serverNumber: 1 | 2;
        timestamp: number;
      }>;
    }>;
    winnerTeam: number;
    completedAt: number;
  };
}

const WatchSyncNative = requireNativeModule<{
  sendScheduledMatchesToWatch(matchesJson: string): boolean;
  isWatchAvailable(): boolean;
}>('WatchSync');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const emitter = new EventEmitter(WatchSyncNative as any) as any;

/**
 * Send scheduled matches to the Apple Watch via WatchConnectivity applicationContext.
 */
export function sendScheduledMatchesToWatch(
  matches: Array<{
    id: string;
    matchType: string;
    pointsToWin: number;
    numberOfGames: number;
    team1Label: string;
    team2Label: string;
    team1PlayerIds: string[];
    team2PlayerIds: string[];
    scheduledDate: string;
  }>,
  currentUserId: string
): boolean {
  const payload = {
    scheduledMatches: matches,
    currentUserId,
    timestamp: Date.now(),
  };
  return WatchSyncNative.sendScheduledMatchesToWatch(JSON.stringify(payload));
}

/**
 * Check if an Apple Watch is paired and has the PickleGo watch app installed.
 */
export function isWatchAvailable(): boolean {
  return WatchSyncNative.isWatchAvailable();
}

/**
 * Subscribe to completed match events from the watch.
 * Returns an unsubscribe function.
 */
export function onMatchCompletedFromWatch(
  callback: (payload: MatchCompletedPayload) => void
): () => void {
  const subscription = emitter.addListener('onMatchCompletedFromWatch', callback);
  return () => subscription.remove();
}
