import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updatePlayerDocument, getPlayerDocument } from '../config/firebase';
import { logAppsFlyerEvent } from '../services/appsflyer';

const ONBOARDING_KEY_PREFIX = '@picklego_onboarding_complete_';

export function useOnboardingStatus(userId: string | undefined) {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) {
      setHasCompletedOnboarding(null);
      return;
    }

    const checkStatus = async () => {
      const userKey = `${ONBOARDING_KEY_PREFIX}${userId}`;

      // Fast local check first
      const localValue = await AsyncStorage.getItem(userKey);
      if (localValue === 'true') {
        setHasCompletedOnboarding(true);
        return;
      }

      // Fallback to Firestore (handles reinstall / new device)
      try {
        const playerDoc = await getPlayerDocument(userId);
        if (playerDoc && (playerDoc as any).onboardingCompletedAt) {
          await AsyncStorage.setItem(userKey, 'true');
          setHasCompletedOnboarding(true);
          return;
        }
      } catch (error) {
        console.error('Error checking onboarding status from Firestore:', error);
      }

      setHasCompletedOnboarding(false);
    };

    checkStatus();
  }, [userId]);

  const completeOnboarding = useCallback(async () => {
    if (!userId) return;

    const userKey = `${ONBOARDING_KEY_PREFIX}${userId}`;
    await AsyncStorage.setItem(userKey, 'true');

    try {
      await updatePlayerDocument(userId, { onboardingCompletedAt: Date.now() } as any);
    } catch (error) {
      console.error('Error saving onboarding status to Firestore:', error);
    }

    logAppsFlyerEvent('onboarding_complete');
    setHasCompletedOnboarding(true);
  }, [userId]);

  return { hasCompletedOnboarding, completeOnboarding };
}
