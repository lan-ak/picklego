import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types';
import { useData } from '../context/DataContext';
import { colors } from '../theme';

// Screen imports
import AuthScreen from '../screens/AuthScreen';
import MatchDetailsScreen from '../screens/MatchDetailsScreen';
import CompleteMatchScreen from '../screens/CompleteMatchScreen';
import PlayerStatsScreen from '../screens/PlayerStatsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import CourtsDiscoveryScreen from '../screens/CourtsDiscoveryScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import NotificationPreferencesScreen from '../screens/NotificationPreferencesScreen';
import InvitePlayersScreen from '../screens/InvitePlayersScreen';
import PlayersScreen from '../screens/PlayersScreen';
import MainTabs from './TabNavigator';
import OnboardingNavigator from './OnboardingNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

const defaultScreenOptions: NativeStackNavigationOptions = {
  headerShown: false,
  animation: 'default',
  gestureEnabled: true,
  gestureDirection: 'horizontal',
  fullScreenGestureEnabled: true,
};

const modalScreenOptions: NativeStackNavigationOptions = {
  headerShown: false,
  presentation: 'modal',
  animation: 'slide_from_bottom',
  gestureEnabled: true,
  gestureDirection: 'vertical',
};

const Navigation = () => {
  const { currentUser, authLoading, hasCompletedOnboarding } = useData();

  if (authLoading || (currentUser && hasCompletedOnboarding === null)) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={defaultScreenOptions}>
      {currentUser ? (
        hasCompletedOnboarding ? (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="MatchDetails" component={MatchDetailsScreen} />
            <Stack.Screen name="CompleteMatch" component={CompleteMatchScreen} options={modalScreenOptions} />
            <Stack.Screen name="PlayerStats" component={PlayerStatsScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="ManagePlayers" component={PlayersScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="CourtsDiscovery" component={CourtsDiscoveryScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} />
            <Stack.Screen name="InvitePlayers" component={InvitePlayersScreen} options={modalScreenOptions} />
          </>
        ) : (
          <Stack.Screen name="Onboarding" component={OnboardingNavigator} />
        )
      ) : (
        <Stack.Screen name="Auth" component={AuthScreen} />
      )}
    </Stack.Navigator>
  );
};

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
});

export default Navigation;
