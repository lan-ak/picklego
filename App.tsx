import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import React, { useCallback, useEffect } from 'react';
import { View, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { SuperwallProvider, useSuperwallEvents } from 'expo-superwall';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import { Fredoka_400Regular, Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import Navigation from './src/navigation';
import { DataProvider } from './src/context/DataContext';
import { ToastProvider } from './src/context/ToastContext';
import { navigationRef } from './src/navigation/navigationRef';
import { handleDeepLinkUrl } from './src/utils/deepLink';
import { useSuperwallIdentity } from './src/hooks/useSuperwallIdentity';
import type { PushNotificationData } from './src/types';
import { initAppsFlyer } from './src/services/appsflyer';
import { initMeta } from './src/services/meta';
import { track } from './src/services/analytics';
import TrackingPrimer from './src/components/TrackingPrimer';

// Import to register the foreground notification handler
import './src/services/pushNotifications';

SplashScreen.preventAutoHideAsync();

initAppsFlyer();

// Fire-and-forget: internally waits for the ATT result before initializing the
// Meta SDK, so the install event carries the correct tracking flag. Events logged
// before that resolves are queued, not dropped.
initMeta();

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

/** Extract invite/open-match ID from a deep link URL and store for post-auth claiming. */
const handleDeepLink = (url: string | null) => handleDeepLinkUrl(url);

// Screens that require a matchId param
const MATCH_SCREENS = new Set<string>(['MatchDetails']);

function handleNotificationResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as PushNotificationData;
  if (!data?.screen) return;

  setTimeout(() => {
    if (navigationRef.isReady()) {
      const state = navigationRef.getRootState();
      // Backward compat: old push notifications may reference removed screen
      const screen = data.screen === 'OpenMatchLobby' ? 'MatchDetails' : data.screen;
      if (MATCH_SCREENS.has(screen!) && data.matchId && state?.routeNames?.includes(screen!)) {
        navigationRef.navigate(screen as any, { matchId: data.matchId });
      } else if (!MATCH_SCREENS.has(screen!) && state?.routeNames?.includes(data.screen!)) {
        navigationRef.navigate(data.screen as any);
      }
      // If screen not available (auth/onboarding), notification stays in in-app list
    }
  }, 500);
}

/** Renderless component that syncs Firebase Auth identity + attributes to Superwall */
function SuperwallIdentitySync() {
  useSuperwallIdentity();
  return null;
}

/**
 * Renderless component that forwards Superwall purchase outcomes to the attribution
 * SDKs. Superwall does not do this itself for native StoreKit purchases — its Meta
 * integration is browser-side Pixel for web paywalls only.
 *
 * Purchases go to AppsFlyer ONLY from here. Meta's copy is sent server-side by the
 * superwallWebhook (functions/src/meta), which is also the only path that sees renewals —
 * the client never does. Do not add a Meta purchase call here: FBSDK's logPurchase() cannot
 * set an event_id, so it could never be deduplicated against the server's and revenue would
 * double-count.
 */
function MetaPurchaseSync() {
  useSuperwallEvents({
    onSuperwallEvent: (info) => {
      const event = info.event;
      switch (event.event) {
        case 'transactionComplete':
          track.purchaseCompleted(event.product.price, event.product.productIdentifier);
          break;
        case 'freeTrialStart':
          track.trialStarted(event.product.productIdentifier);
          break;
        case 'subscriptionStart':
          track.subscriptionStarted(event.product.productIdentifier);
          break;
        default:
          break;
      }
    },
  });
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
          <MetaPurchaseSync />
          <NavigationContainer ref={navigationRef}>
            <SafeAreaProvider>
              <ToastProvider>
                <Navigation />
                <TrackingPrimer />
                <StatusBar style="auto" />
              </ToastProvider>
            </SafeAreaProvider>
          </NavigationContainer>
        </SuperwallProvider>
      </DataProvider>
    </GestureHandlerRootView>
  );
}
