import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Icon } from './Icon';
import { AnimatedPressable } from './AnimatedPressable';
import { useData } from '../context/DataContext';
import { RootStackParamList } from '../types';
import { colors, typography, spacing } from '../theme';

export const NotificationBell = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { unreadNotificationCount } = useData();

  return (
    <AnimatedPressable
      onPress={() => navigation.navigate('Notifications')}
      style={styles.container}
      accessibilityLabel={`Notifications${unreadNotificationCount > 0 ? `, ${unreadNotificationCount} unread` : ''}`}
      accessibilityRole="button"
    >
      <Icon name="bell" size={24} color={colors.primary} />
      {unreadNotificationCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>
            {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
          </Text>
        </View>
      )}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.xs,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: colors.error,
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    ...typography.caption,
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
});
