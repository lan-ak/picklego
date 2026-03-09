import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import * as Notifications from 'expo-notifications';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../types';
import OnboardingLayout from '../../components/OnboardingLayout';
import { Icon } from '../../components/Icon';
import { useData } from '../../context/DataContext';
import { requestPushPermissions, registerPushToken } from '../../services/pushNotifications';
import { useSlideIn, useHaptic } from '../../hooks';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'NotificationPerm'>;

const MOCK_NOTIFICATIONS = [
  {
    icon: 'activity' as const,
    title: 'Match Invites',
    subtitle: 'Get notified when someone invites you to play',
    accentColor: colors.secondary,
  },
  {
    icon: 'clock' as const,
    title: 'Game Reminders',
    subtitle: 'Never miss a match with timely reminders',
    accentColor: colors.action,
  },
  {
    icon: 'user-plus' as const,
    title: 'Connection Requests',
    subtitle: 'Know when players want to connect with you',
    accentColor: colors.primary,
  },
];

const MockNotificationCard = ({
  icon,
  title,
  subtitle,
  accentColor,
  index,
}: {
  icon: string;
  title: string;
  subtitle: string;
  accentColor: string;
  index: number;
}) => {
  const slideStyle = useSlideIn(index + 3, 'right', 40);

  return (
    <Animated.View style={[styles.notifCard, slideStyle]}>
      <View style={[styles.notifAccent, { backgroundColor: accentColor }]} />
      <View style={[styles.notifIcon, { backgroundColor: accentColor + '20' }]}>
        <Icon name={icon as any} size={20} color={accentColor} />
      </View>
      <View style={styles.notifContent}>
        <Text style={styles.notifTitle}>{title}</Text>
        <Text style={styles.notifSubtitle}>{subtitle}</Text>
      </View>
    </Animated.View>
  );
};

const NotificationPermScreen = () => {
  const navigation = useNavigation<Nav>();
  const { currentUser } = useData();
  const triggerHaptic = useHaptic();
  const [loading, setLoading] = useState(false);
  const [alreadyGranted, setAlreadyGranted] = useState(false);

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      if (status === 'granted') setAlreadyGranted(true);
    });
  }, []);

  const handleEnable = async () => {
    setLoading(true);
    try {
      const granted = await requestPushPermissions();
      if (granted && currentUser?.id) {
        await registerPushToken(currentUser.id);
        triggerHaptic('success');
      }
    } catch (error) {
      console.error('Error requesting notifications:', error);
    }
    setLoading(false);
    navigation.navigate('InviteFriends');
  };

  const goNext = () => navigation.navigate('InviteFriends');

  if (alreadyGranted) {
    return (
      <OnboardingLayout
        step={2}
        petePose="stopwatch"
        peteSize="lg"
        peteMessage="You're already set up!"
        title="Notifications Enabled"
        ctaTitle="Continue"
        ctaOnPress={goNext}
      >
        <View style={styles.checkContainer}>
          <Icon name="check-circle" size={48} color={colors.primary} />
          <Text style={styles.enabledText}>Notifications are active</Text>
        </View>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout
      step={2}
      petePose="stopwatch"
      peteSize="lg"
      peteMessage="Don't miss game time!"
      title="Stay in the Game"
      subtitle="Here's what you'll get notified about"
      ctaTitle="Enable Notifications"
      ctaOnPress={handleEnable}
      ctaLoading={loading}
      secondaryAction={{ title: 'Continue without', onPress: goNext }}
    >
      <View style={styles.notifications}>
        {MOCK_NOTIFICATIONS.map((notif, i) => (
          <MockNotificationCard key={notif.icon} {...notif} index={i} />
        ))}
      </View>
    </OnboardingLayout>
  );
};

const styles = StyleSheet.create({
  notifications: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  notifCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    gap: spacing.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  notifAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: borderRadius.md,
    borderBottomLeftRadius: borderRadius.md,
  },
  notifIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifContent: {
    flex: 1,
  },
  notifTitle: {
    ...typography.bodyLarge,
    color: colors.neutral,
  },
  notifSubtitle: {
    ...typography.caption,
    color: colors.gray400,
    marginTop: 2,
  },
  checkContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  enabledText: {
    ...typography.bodyLarge,
    color: colors.primary,
  },
});

export default NotificationPermScreen;
