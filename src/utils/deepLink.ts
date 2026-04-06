import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigateToMatchIfReady } from '../navigation/navigationRef';

/**
 * Parse a deep link URL and store the relevant ID for post-auth claiming.
 * Handles:
 *   picklego://open-match/{matchId}  /  https://picklego.app/open-match/{matchId}
 *   picklego://invite/{inviteId}     /  https://picklego.app/invite/{inviteId}
 */
export function handleDeepLinkUrl(url: string | null | undefined): void {
  if (!url) return;

  const openMatchMatch = url.match(/open-match\/([a-zA-Z0-9_-]+)/);
  if (openMatchMatch?.[1]) {
    const matchId = openMatchMatch[1];
    AsyncStorage.setItem('pendingOpenMatchId', matchId);
    navigateToMatchIfReady(matchId);
    return;
  }

  const inviteMatch = url.match(/invite\/([a-zA-Z0-9_-]+)/);
  if (inviteMatch?.[1]) {
    AsyncStorage.setItem('pendingSMSInviteId', inviteMatch[1]);
  }
}
