import React, { useCallback, useEffect } from 'react';
import { View, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { Fredoka_400Regular, Fredoka_500Medium, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import Navigation from './src/navigation';
import { DataProvider } from './src/context/DataContext';
import { ToastProvider } from './src/context/ToastContext';
import { navigationRef } from './src/navigation/navigationRef';
import type { PushNotificationData } from './src/types';

// Import to register the foreground notification handler
import './src/services/pushNotifications';

SplashScreen.preventAutoHideAsync();

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

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <DataProvider>
        <NavigationContainer ref={navigationRef}>
          <SafeAreaProvider>
            <ToastProvider>
              <Navigation />
              <StatusBar style="auto" />
            </ToastProvider>
          </SafeAreaProvider>
        </NavigationContainer>
      </DataProvider>
    </View>
  );
}
