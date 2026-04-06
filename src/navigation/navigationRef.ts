import { createNavigationContainerRef } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RootStackParamList } from '../types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateToMatchIfReady(matchId: string) {
  setTimeout(() => {
    if (navigationRef.isReady()) {
      const currentRoute = navigationRef.getCurrentRoute();
      if (currentRoute?.name !== 'Auth') {
        navigationRef.navigate('MatchDetails', { matchId });
        AsyncStorage.removeItem('pendingOpenMatchId');
      }
    }
  }, 500);
}
