import React, { useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import Layout from '../components/Layout';
import NotificationCard from '../components/NotificationCard';
import PicklePete from '../components/PicklePete';
import { colors, typography, spacing } from '../theme';

type NotificationsNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const NotificationsScreen = () => {
  const navigation = useNavigation<NotificationsNavigationProp>();
  const { notifications, matches, currentUser, markNotificationRead, markAllNotificationsRead, unreadNotificationCount, respondToPlayerInvite, deleteNotification, clearAllNotifications, refreshMatches, refreshNotifications } = useData();
  const { showToast } = useToast();

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refreshMatches();
      refreshNotifications();
    }, [])
  );

  // Only show notifications where user is the recipient; hide declined player invites
  const receivedNotifications = notifications.filter(
    n => currentUser && n.recipientId === currentUser.id
      && !(n.type === 'player_invite' && n.status === 'declined')
  );

  const receivedUnreadCount = receivedNotifications.filter(
    n => n.status === 'sent'
  ).length;

  const handleNotificationPress = async (notificationId: string, matchId?: string, type?: string) => {
    // Don't mark player_invite as read — they change status via accept/decline only
    if (type !== 'player_invite') {
      await markNotificationRead(notificationId);
    }

    if (matchId) {
      // Check if the match still exists before navigating
      const matchExists = matches.some(m => m.id === matchId);
      if (matchExists) {
        navigation.navigate('MatchDetails', { matchId });
      } else {
        showToast('This match no longer exists', 'info');
      }
    }
  };

  const handleAcceptInvite = async (notificationId: string) => {
    try {
      await respondToPlayerInvite(notificationId, true);
      showToast('Player invite accepted!', 'success');
    } catch (error) {
      console.error('Failed to accept invite:', error);
      showToast('Failed to accept invite. Please try again.', 'error');
    }
  };

  const handleDeclineInvite = async (notificationId: string) => {
    try {
      await respondToPlayerInvite(notificationId, false);
      showToast('Player invite declined', 'info');
    } catch (error) {
      console.error('Failed to decline invite:', error);
      showToast('Failed to decline invite. Please try again.', 'error');
    }
  };

  const handleDeleteNotification = async (notificationId: string) => {
    try {
      await deleteNotification(notificationId);
    } catch (error) {
      showToast('Failed to delete notification', 'error');
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Notifications',
      'Are you sure you want to clear all notifications?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear All', style: 'destructive', onPress: clearAllNotifications },
      ]
    );
  };

  return (
    <Layout title="Notifications" showBackButton={true}>
      {receivedNotifications.length > 0 && (
        <View style={styles.actionBar}>
          {receivedUnreadCount > 0 && (
            <TouchableOpacity
              onPress={markAllNotificationsRead}
              style={styles.markAllButton}
              accessibilityLabel="Mark all notifications as read"
              accessibilityRole="button"
            >
              <Text style={styles.markAllText}>Mark all as read</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleClearAll}
            style={styles.clearAllButton}
            accessibilityLabel="Clear all notifications"
            accessibilityRole="button"
          >
            <Text style={styles.clearAllText}>Clear all</Text>
          </TouchableOpacity>
        </View>
      )}

      {receivedNotifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <PicklePete pose="invite" size="md" message="No notifications yet" />
          <Text style={styles.emptySubtext}>
            When someone adds you to a match, you'll see it here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={receivedNotifications}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            if (item.type === 'player_invite') {
              return (
                <NotificationCard
                  notification={item}
                  onPress={() => handleNotificationPress(item.id, undefined, item.type)}
                  onAccept={item.status === 'sent' ? () => handleAcceptInvite(item.id) : undefined}
                  onDecline={item.status === 'sent' ? () => handleDeclineInvite(item.id) : undefined}
                  onDelete={() => handleDeleteNotification(item.id)}
                />
              );
            }
            if (item.type === 'invite_accepted') {
              return (
                <NotificationCard
                  notification={item}
                  onPress={() => handleNotificationPress(item.id, undefined, item.type)}
                  onDelete={() => handleDeleteNotification(item.id)}
                />
              );
            }
            return (
              <NotificationCard
                notification={item}
                onPress={() => handleNotificationPress(item.id, item.matchId, item.type)}
                onDelete={() => handleDeleteNotification(item.id)}
              />
            );
          }}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Layout>
  );
};

const styles = StyleSheet.create({
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  markAllButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  markAllText: {
    ...typography.bodySmall,
    color: colors.secondary,
    fontWeight: '600',
  },
  clearAllButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  clearAllText: {
    ...typography.bodySmall,
    color: colors.error,
    fontWeight: '600',
  },
  listContent: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  emptySubtext: {
    ...typography.bodySmall,
    color: colors.gray400,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});

export default NotificationsScreen;
