import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import Navigation from './src/navigation';
import { DataProvider } from './src/context/DataContext';

export default function App() {
  return (
    <DataProvider>
      <NavigationContainer>
        <SafeAreaProvider>
          <Navigation />
          <StatusBar style="auto" />
        </SafeAreaProvider>
      </NavigationContainer>
    </DataProvider>
  );
}
