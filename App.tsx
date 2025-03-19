import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import Navigation from './src/navigation';
import { DataProvider } from './src/context/DataContext';
import AuthScreen from './src/screens/AuthScreen';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './src/types';
import { MainTabs } from './src/navigation';
import MatchDetailsScreen from './src/screens/MatchDetailsScreen';
import CompleteMatchScreen from './src/screens/CompleteMatchScreen';
import PlayerStatsScreen from './src/screens/PlayerStatsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import EditProfileScreen from './src/screens/EditProfileScreen';
import PrivacyPolicyScreen from './src/screens/PrivacyPolicyScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <DataProvider>
      <NavigationContainer>
        <SafeAreaProvider>
          <Stack.Navigator 
            initialRouteName="Auth"
            screenOptions={{ headerShown: false }}
          >
            <Stack.Screen name="Auth" component={AuthScreen} />
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="MatchDetails" component={MatchDetailsScreen} />
            <Stack.Screen name="CompleteMatch" component={CompleteMatchScreen} />
            <Stack.Screen name="PlayerStats" component={PlayerStatsScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} />
            <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
          </Stack.Navigator>
          <StatusBar style="auto" />
        </SafeAreaProvider>
      </NavigationContainer>
    </DataProvider>
  );
}
