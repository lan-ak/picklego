import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useFadeIn, staggeredEntrance } from '../hooks';
import Layout from '../components/Layout';
import { useData } from '../context/DataContext';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { useToast } from '../context/ToastContext';
import type { NotificationPreferences, MatchNotification } from '../types';

type NotificationType = MatchNotification['type'];

const PREFERENCE_OPTIONS: { key: NotificationType; label: string; description: string }[] = [
  {
    key: 'match_invite',
    label: 'Match Invites',
    description: 'When someone adds you to a match',
  },
  {
    key: 'match_updated',
    label: 'Match Updates',
    description: 'When a match you\'re in is modified',
  },
  {
    key: 'match_cancelled',
    label: 'Match Cancellations',
    description: 'When a match you\'re in is cancelled',
  },
  {
    key: 'player_invite',
    label: 'Player Invites',
    description: 'When someone wants to connect with you',
  },
  {
    key: 'invite_accepted',
    label: 'Invite Accepted',
    description: 'When someone accepts your connection invite',
  },
];

const DEFAULT_PREFERENCES: NotificationPreferences = {
  match_invite: true,
  match_updated: true,
  match_cancelled: true,
  player_invite: true,
  invite_accepted: true,
};

const NotificationPreferencesScreen: React.FC = () => {
  const { currentUser, updatePlayer } = useData();
  const { showToast } = useToast();
  const fadeStyle = useFadeIn();

  const preferences: NotificationPreferences = currentUser?.notificationPreferences ?? DEFAULT_PREFERENCES;

  const handleToggle = async (key: NotificationType) => {
    if (!currentUser) return;

    const updated: NotificationPreferences = {
      ...preferences,
      [key]: !preferences[key],
    };

    try {
      await updatePlayer(currentUser.id, { notificationPreferences: updated });
    } catch {
      showToast('Failed to update preference', 'error');
    }
  };

  return (
    <Layout title="Notifications" showBackButton>
      <ScrollView style={styles.container}>
        <Animated.View style={fadeStyle}>
          <Animated.View entering={staggeredEntrance(0)}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Push Notifications</Text>
              <Text style={styles.sectionDescription}>
                Choose which notifications you'd like to receive.
              </Text>
              {PREFERENCE_OPTIONS.map((option, index) => (
                <View
                  key={option.key}
                  style={[
                    styles.preferenceItem,
                    index === 0 && styles.firstItem,
                  ]}
                >
                  <View style={styles.preferenceTextContainer}>
                    <Text style={styles.preferenceLabel}>{option.label}</Text>
                    <Text style={styles.preferenceDescription}>{option.description}</Text>
                  </View>
                  <Switch
                    value={preferences[option.key]}
                    onValueChange={() => handleToggle(option.key)}
                    trackColor={{ false: colors.gray300, true: colors.primary }}
                    thumbColor={colors.white}
                  />
                </View>
              ))}
            </View>
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </Layout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    backgroundColor: colors.white,
    margin: spacing.lg,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.md,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.gray500,
    padding: spacing.lg,
    paddingBottom: spacing.xs,
  },
  sectionDescription: {
    ...typography.bodySmall,
    color: colors.gray400,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  firstItem: {
    borderTopWidth: 0,
  },
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  preferenceTextContainer: {
    flex: 1,
    marginRight: spacing.md,
  },
  preferenceLabel: {
    ...typography.bodyLarge,
    color: colors.neutral,
  },
  preferenceDescription: {
    ...typography.bodySmall,
    color: colors.gray400,
    marginTop: 2,
  },
});

export default NotificationPreferencesScreen;
