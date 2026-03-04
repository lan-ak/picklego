import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Icon } from './Icon';
import { MatchNotification } from '../types';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';

type NotificationCardProps = {
  notification: MatchNotification;
  onPress: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  onDelete?: () => void;
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

const NotificationCard = ({ notification, onPress, onAccept, onDecline, onDelete }: NotificationCardProps) => {
  const isUnread = notification.status === 'sent' && notification.type !== 'player_invite';
  const isPlayerInvite = notification.type === 'player_invite';
  const isInviteAccepted = notification.type === 'invite_accepted';
  const isMatchUpdated = notification.type === 'match_updated';
  const isMatchCancelled = notification.type === 'match_cancelled';
  const isPendingPlayerInvite = isPlayerInvite && notification.status === 'sent';

  const deleteButton = onDelete ? (
    <TouchableOpacity
      onPress={onDelete}
      style={styles.deleteButton}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      accessibilityLabel="Delete notification"
    >
      <Icon name="x" size={16} color={colors.gray400} />
    </TouchableOpacity>
  ) : null;

  if (isPlayerInvite) {
    return (
      <TouchableOpacity
        style={[styles.card, isPendingPlayerInvite && styles.unreadCard]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityLabel={`Player invite from ${notification.senderName}`}
        accessibilityRole="button"
      >
        <View style={styles.row}>
          {isPendingPlayerInvite && <View style={styles.unreadDot} />}
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={[styles.title, isPendingPlayerInvite && styles.unreadTitle]}>
                Player Invite
              </Text>
              <View style={styles.headerRight}>
                <Text style={styles.timeAgo}>{formatTimeAgo(notification.createdAt)}</Text>
                {deleteButton}
              </View>
            </View>
            <Text style={styles.body}>
              {notification.senderName} wants to add you as a player!
            </Text>
            {isPendingPlayerInvite && onAccept && onDecline ? (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={onAccept}
                  activeOpacity={0.7}
                >
                  <Icon name="check-circle" size={16} color={colors.white} />
                  <Text style={styles.acceptButtonText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.declineButton}
                  onPress={onDecline}
                  activeOpacity={0.7}
                >
                  <Icon name="x-circle" size={16} color={colors.gray500} />
                  <Text style={styles.declineButtonText}>Decline</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={[
                styles.statusText,
                notification.status === 'accepted' ? styles.acceptedText : styles.declinedText,
              ]}>
                {notification.status === 'accepted' ? 'Accepted' : 'Declined'}
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  if (isInviteAccepted) {
    const isUnreadAccepted = notification.status === 'sent';
    return (
      <TouchableOpacity
        style={[styles.card, isUnreadAccepted && styles.unreadCard]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityLabel={`${notification.senderName} accepted your player invite`}
        accessibilityRole="button"
      >
        <View style={styles.row}>
          {isUnreadAccepted && <View style={styles.unreadDot} />}
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={[styles.title, isUnreadAccepted && styles.unreadTitle]}>
                Player Added
              </Text>
              <View style={styles.headerRight}>
                <Text style={styles.timeAgo}>{formatTimeAgo(notification.createdAt)}</Text>
                {deleteButton}
              </View>
            </View>
            <Text style={styles.body}>
              {notification.senderName} accepted your player invite!
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  if (isMatchUpdated || isMatchCancelled) {
    return (
      <TouchableOpacity
        style={[styles.card, isUnread && styles.unreadCard]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityLabel={`${isMatchCancelled ? 'Match cancelled' : 'Match updated'} by ${notification.senderName}`}
        accessibilityRole="button"
      >
        <View style={styles.row}>
          {isUnread && <View style={styles.unreadDot} />}
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={[styles.title, isUnread && styles.unreadTitle]}>
                {isMatchCancelled ? 'Match Cancelled' : 'Match Updated'}
              </Text>
              <View style={styles.headerRight}>
                <Text style={styles.timeAgo}>{formatTimeAgo(notification.createdAt)}</Text>
                {deleteButton}
              </View>
            </View>
            <Text style={styles.body}>
              {notification.message}
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
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Default: match_invite (unchanged)
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
            <View style={styles.headerRight}>
              <Text style={styles.timeAgo}>{formatTimeAgo(notification.createdAt)}</Text>
              {deleteButton}
            </View>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  deleteButton: {
    padding: 2,
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
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  acceptButtonText: {
    ...typography.bodySmall,
    color: colors.white,
    fontWeight: '600',
  },
  declineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  declineButtonText: {
    ...typography.bodySmall,
    color: colors.gray500,
    fontWeight: '600',
  },
  statusText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  acceptedText: {
    color: colors.primary,
  },
  declinedText: {
    color: colors.gray400,
  },
});

export default NotificationCard;
