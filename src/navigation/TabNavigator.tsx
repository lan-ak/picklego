import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import type { MainTabParamList } from '../types';

// Screen imports
import HomeScreen from '../screens/HomeScreen';
import MatchesScreen from '../screens/MatchesScreen';
import AddMatchScreen from '../screens/AddMatchScreen';
import MyStatsScreen from '../screens/PlayerStatsScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

const MainTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={({ navigation }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: '#0D6B3E',
        tabBarInactiveTintColor: '#BBC3CE',
        tabBarStyle: styles.tabBar,
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Matches"
        component={MatchesScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" color={color} size={size} />
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
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: '#0D6B3E' }]}
                onPress={() => navigation.navigate('AddMatch')}
                accessibilityLabel="Create new match"
                accessibilityRole="button"
              >
                <Ionicons name="add" color="#FFFFFF" size={size} />
              </TouchableOpacity>
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
            <Ionicons name="stats-chart" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" color={color} size={size} />
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
    height: 60,
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 5,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  addButtonContainer: {
    position: 'absolute',
    top: -15,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  addButton: {
    backgroundColor: '#0D6B3E',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0D6B3E',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
});

export default MainTabs; 