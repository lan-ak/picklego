import { createNavigationContainerRef } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RootStackParamList } from '../types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateToMatchIfReady(matchId: string) {
  setTimeout(() => {
    if (navigationRef.isReady()) {
      const state = navigationRef.getRootState();
      if (state?.routeNames?.includes('MatchDetails')) {
        navigationRef.navigate('MatchDetails', { matchId });
        AsyncStorage.removeItem('pendingOpenMatchId');
      }
      // Otherwise pendingOpenMatchId stays in AsyncStorage — HomeScreen handles it after auth
    }
  }, 500);
}
