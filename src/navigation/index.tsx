import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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
import MainTabs from './TabNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

const Navigation = () => {
  const { currentUser, authLoading } = useData();

  if (authLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {currentUser ? (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="MatchDetails" component={MatchDetailsScreen} />
          <Stack.Screen name="CompleteMatch" component={CompleteMatchScreen} />
          <Stack.Screen name="PlayerStats" component={PlayerStatsScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="EditProfile" component={EditProfileScreen} />
          <Stack.Screen name="CourtsDiscovery" component={CourtsDiscoveryScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
        </>
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
