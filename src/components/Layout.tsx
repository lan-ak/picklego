import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Platform, StatusBar } from 'react-native';
import { Icon } from './Icon';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { colors, typography, spacing, shadows } from '../theme';

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
      <StatusBar backgroundColor={colors.white} barStyle="dark-content" />
      {title && (
        <View style={[
          styles.header,
          Platform.OS === 'android' && { paddingTop: statusBarHeight + spacing.lg }
        ]}>
          {showBackButton && navigation.canGoBack() && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Icon name="arrow-left" size={24} color={colors.primary} />
            </TouchableOpacity>
          )}
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          <View style={styles.rightContainer}>
            {!isHomeScreen && (
              <TouchableOpacity
                style={styles.homeButton}
                onPress={navigateToHome}
                accessibilityLabel="Go to home screen"
                accessibilityRole="button"
              >
                <Icon name="home" size={24} color={colors.primary} />
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
    backgroundColor: colors.surface,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'android' ? spacing.lg : spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    ...shadows.sm,
  },
  title: {
    ...typography.h3,
    color: colors.primary,
    textAlign: 'center',
    flex: 1,
  },
  backButton: {
    padding: spacing.sm,
    marginRight: spacing.sm,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 40,
  },
  homeButton: {
    padding: spacing.sm,
    marginRight: spacing.sm,
  },
  rightComponent: {
    alignItems: 'flex-end',
  },
});

export default Layout;
