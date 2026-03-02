import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Icon } from './Icon';
import { MatchNotification } from '../types';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';

type NotificationCardProps = {
  notification: MatchNotification;
  onPress: () => void;
};

const formatTimeAgo = (timestamp: number): string => {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatMatchDate = (dateString?: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) + ' · ' + date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
};

const NotificationCard = ({ notification, onPress }: NotificationCardProps) => {
  const isUnread = notification.status !== 'read';
  const matchTypeLabel = notification.matchType === 'doubles' ? 'doubles' : 'singles';

  return (
    <TouchableOpacity
      style={[styles.card, isUnread && styles.unreadCard]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={`${isUnread ? 'Unread: ' : ''}${notification.senderName} added you to a ${matchTypeLabel} match`}
      accessibilityRole="button"
    >
      <View style={styles.row}>
        {isUnread && <View style={styles.unreadDot} />}
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, isUnread && styles.unreadTitle]}>Match Added</Text>
            <Text style={styles.timeAgo}>{formatTimeAgo(notification.createdAt)}</Text>
          </View>
          <Text style={styles.body}>
            {notification.senderName} added you to a {matchTypeLabel} match
          </Text>
          {notification.matchDate && (
            <View style={styles.detailRow}>
              <Icon name="calendar" size={14} color={colors.gray400} />
              <Text style={styles.detailText}>{formatMatchDate(notification.matchDate)}</Text>
            </View>
          )}
          {notification.matchLocation && (
            <View style={styles.detailRow}>
              <Icon name="map-pin" size={14} color={colors.gray400} />
              <Text style={styles.detailText}>{notification.matchLocation}</Text>
            </View>
          )}
          {notification.message && (
            <Text style={styles.message}>"{notification.message}"</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    ...shadows.sm,
  },
  unreadCard: {
    backgroundColor: colors.secondaryOverlay,
    borderLeftWidth: 3,
    borderLeftColor: colors.secondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.secondary,
    marginTop: 6,
    marginRight: spacing.sm,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.bodyLarge,
    color: colors.neutral,
  },
  unreadTitle: {
    fontWeight: '700',
  },
  timeAgo: {
    ...typography.caption,
    color: colors.gray400,
  },
  body: {
    ...typography.bodySmall,
    color: colors.gray500,
    marginBottom: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  detailText: {
    ...typography.caption,
    color: colors.gray400,
    marginLeft: spacing.xs,
  },
  message: {
    ...typography.bodySmall,
    color: colors.gray500,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
});

export default NotificationCard;
