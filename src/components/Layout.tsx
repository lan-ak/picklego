import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Platform, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';

type LayoutProps = {
  children: React.ReactNode;
  title?: string;
  showBackButton?: boolean;
  rightComponent?: React.ReactNode;
  isHomeScreen?: boolean;
};

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  title, 
  showBackButton = true,
  rightComponent,
  isHomeScreen = false
}) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const statusBarHeight = StatusBar.currentHeight || 0;

  const navigateToHome = () => {
    navigation.navigate('MainTabs', { screen: 'Home' });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar backgroundColor="#FFFFFF" barStyle="dark-content" />
      {title && (
        <View style={[
          styles.header, 
          Platform.OS === 'android' && { paddingTop: statusBarHeight + 16 }
        ]}>
          {showBackButton && navigation.canGoBack() && (
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="arrow-back" size={24} color="#0D6B3E" />
            </TouchableOpacity>
          )}
          <Text style={styles.title}>{title}</Text>
          <View style={styles.rightContainer}>
            {!isHomeScreen && (
              <TouchableOpacity 
                style={styles.homeButton}
                onPress={navigateToHome}
              >
                <Ionicons name="home" size={24} color="#0D6B3E" />
              </TouchableOpacity>
            )}
            {rightComponent && (
              <View style={styles.rightComponent}>
                {rightComponent}
              </View>
            )}
          </View>
        </View>
      )}
      <View style={styles.container}>
        {children}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 16 : 12,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0D6B3E',
    textAlign: 'center',
    flex: 1,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  rightPlaceholder: {
    width: 40,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 40,
  },
  homeButton: {
    padding: 8,
    marginRight: 8,
  },
  rightComponent: {
    alignItems: 'flex-end',
  },
});

export default Layout; 