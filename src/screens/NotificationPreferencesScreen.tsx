import React from 'react';
import {
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useFadeIn, staggeredEntrance } from '../hooks';
import Layout from '../components/Layout';
import { Section } from '../components/Section';
import { ToggleRow } from '../components/ToggleRow';
import { useData } from '../context/DataContext';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { useToast } from '../context/ToastContext';
import type { NotificationPreferences } from '../types';

type PreferenceKey = keyof NotificationPreferences;

const PREFERENCE_OPTIONS: { key: PreferenceKey; label: string; description: string }[] = [
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
  {
    key: 'open_match_join',
    label: 'Open Match Activity',
    description: 'When players join or leave your open matches',
  },
  {
    key: 'open_match_full',
    label: 'Open Match Ready',
    description: 'When your open match is full and teams are set',
  },
];

const DEFAULT_PREFERENCES: NotificationPreferences = {
  match_invite: true,
  match_updated: true,
  match_cancelled: true,
  player_invite: true,
  invite_accepted: true,
  open_match_join: true,
  open_match_full: true,
};

const NotificationPreferencesScreen: React.FC = () => {
  const { currentUser, updatePlayer } = useData();
  const { showToast } = useToast();
  const fadeStyle = useFadeIn();

  const preferences: NotificationPreferences = currentUser?.notificationPreferences ?? DEFAULT_PREFERENCES;

  const handleToggle = async (key: PreferenceKey) => {
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
            <Section title="Push Notifications" variant="settings" card={false} style={styles.section}>
              <Text style={styles.sectionDescription}>
                Choose which notifications you'd like to receive.
              </Text>
              {PREFERENCE_OPTIONS.map((option, index) => (
                <ToggleRow
                  key={option.key}
                  label={option.label}
                  description={option.description}
                  value={preferences[option.key]}
                  onValueChange={() => handleToggle(option.key)}
                  style={[
                    styles.preferenceItem,
                    index === 0 && styles.firstItem,
                  ]}
                />
              ))}
            </Section>
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
});

export default NotificationPreferencesScreen;
