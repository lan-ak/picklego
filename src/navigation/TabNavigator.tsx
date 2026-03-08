import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { AnimatedPressable } from '../components/AnimatedPressable';
import type { MainTabParamList } from '../types';
import { colors, shadows, layout, typography, spacing } from '../theme';

// Screen imports
import HomeScreen from '../screens/HomeScreen';
import MatchesScreen from '../screens/MatchesScreen';
import AddMatchScreen from '../screens/AddMatchScreen';
import MyStatsScreen from '../screens/PlayerStatsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

const MainTabs = () => {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ navigation }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          ...styles.tabBar,
          height: layout.TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: {
          ...typography.bodySmall,
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name="home" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Matches"
        component={MatchesScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name="calendar" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="AddMatch"
        component={AddMatchScreen}
        options={({ navigation }) => ({
          tabBarLabel: "New Match",
          tabBarIcon: ({ color, size }) => (
            <View style={styles.addButtonContainer}>
              <AnimatedPressable
                style={styles.addButton}
                onPress={() => navigation.navigate('AddMatch')}
                accessibilityLabel="Create new match"
                accessibilityRole="button"
              >
                <Icon name="plus" color={colors.white} size={size} />
              </AnimatedPressable>
            </View>
          ),
        })}
      />
      <Tab.Screen
        name="Players"
        component={MyStatsScreen}
        options={{
          tabBarLabel: "My Stats",
          tabBarIcon: ({ color, size }) => (
            <Icon name="bar-chart-2" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Icon name="settings" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    position: 'relative',
    bottom: 0,
    left: 0,
    right: 0,
    height: layout.TAB_BAR_HEIGHT,
    backgroundColor: colors.white,
    borderRadius: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 5,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  addButtonContainer: {
    position: 'absolute',
    top: -15,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  addButton: {
    backgroundColor: colors.action, // Power Yellow FAB
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.fab,
  },
});

export default MainTabs;
