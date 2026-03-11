import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../types';

import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import NotificationPermScreen from '../screens/onboarding/NotificationPermScreen';
import PhoneNumberScreen from '../screens/onboarding/PhoneNumberScreen';
import InviteFriendsScreen from '../screens/onboarding/InviteFriendsScreen';
import ScheduleMatchScreen from '../screens/onboarding/ScheduleMatchScreen';
import CelebrationScreen from '../screens/onboarding/CelebrationScreen';
import AddMatchScreen from '../screens/AddMatchScreen';

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

const OnboardingNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="NotificationPerm" component={NotificationPermScreen} />
      <Stack.Screen name="PhoneNumber" component={PhoneNumberScreen} />
      <Stack.Screen name="InviteFriends" component={InviteFriendsScreen} />
      <Stack.Screen name="ScheduleMatch" component={ScheduleMatchScreen} />
      <Stack.Screen
        name="OnboardingAddMatch"
        component={AddMatchScreen}
        options={{ gestureEnabled: true, headerShown: false }}
      />
      <Stack.Screen name="Celebration" component={CelebrationScreen} />
    </Stack.Navigator>
  );
};

export default OnboardingNavigator;
