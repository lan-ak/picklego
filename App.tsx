import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useCallback, useEffect } from 'react';
import { View, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { SuperwallProvider } from 'expo-superwall';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Fredoka_400Regular, Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import Navigation from './src/navigation';
import { DataProvider } from './src/context/DataContext';
import { ToastProvider } from './src/context/ToastContext';
import { navigationRef } from './src/navigation/navigationRef';
import { useSuperwallIdentity } from './src/hooks/useSuperwallIdentity';
import type { PushNotificationData } from './src/types';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { initAppsFlyer } from './src/services/appsflyer';

// Import to register the foreground notification handler
import './src/services/pushNotifications';

SplashScreen.preventAutoHideAsync();

// Initialize AppsFlyer SDK (request ATT on iOS first)
(async () => {
  if (Platform.OS === 'ios') {
    try {
      await requestTrackingPermissionsAsync();
    } catch {
      // ATT not available (e.g. iOS < 14.5) — continue without it
    }
  }
  initAppsFlyer();
})();

// Set up Android notification channel
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('match-invites', {
    name: 'Match Invites',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#4CAF50',
    sound: 'default',
  });
}

/**
 * Extract invite ID from a deep link URL and store it for post-signup claiming.
 * Handles both: picklego://invite/{id} and https://picklego.app/invite/{id}
 */
async function handleDeepLink(url: string | null) {
  if (!url) return;
  const match = url.match(/invite\/([a-zA-Z0-9_-]+)/);
  if (match?.[1]) {
    await AsyncStorage.setItem('pendingSMSInviteId', match[1]);
  }
}

function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as PushNotificationData;
  if (data?.matchId && data?.screen === 'MatchDetails') {
    setTimeout(() => {
      if (navigationRef.isReady()) {
        const currentRoute = navigationRef.getCurrentRoute();
        if (currentRoute?.name !== 'Auth') {
          navigationRef.navigate('MatchDetails', { matchId: data.matchId! });
        }
      }
    }, 500);
  }
}

/** Renderless component that syncs Firebase Auth identity + attributes to Superwall */
function SuperwallIdentitySync() {
  useSuperwallIdentity();
  return null;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });

  // Handle notification tap when app was killed (cold start)
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (lastResponse) {
      handleNotificationResponse(lastResponse);
    }
  }, [lastResponse]);

  // Handle notification tap when app is in foreground or background
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      handleNotificationResponse
    );
    return () => subscription.remove();
  }, []);

  // Handle deep links for SMS invites
  useEffect(() => {
    // Cold start: check initial URL
    Linking.getInitialURL().then(handleDeepLink);

    // App already running: listen for incoming URLs
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });
    return () => subscription.remove();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <DataProvider>
        <SuperwallProvider
          apiKeys={{
            ios: process.env.EXPO_PUBLIC_SUPERWALL_IOS_API_KEY ?? '',
          }}
          options={{
            logging: {
              level: __DEV__ ? 'warn' : 'error',
              scopes: ['all'],
            },
          }}
          onConfigurationError={(error) => {
            console.error('[Superwall] Configuration failed:', error.message);
          }}
        >
          <SuperwallIdentitySync />
          <NavigationContainer ref={navigationRef}>
            <SafeAreaProvider>
              <ToastProvider>
                <Navigation />
                <StatusBar style="auto" />
              </ToastProvider>
            </SafeAreaProvider>
          </NavigationContainer>
        </SuperwallProvider>
      </DataProvider>
    </GestureHandlerRootView>
  );
}
