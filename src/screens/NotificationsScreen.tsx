import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
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
  const { notifications, matches, currentUser, markNotificationRead, markAllNotificationsRead, unreadNotificationCount } = useData();
  const { showToast } = useToast();

  // Only show notifications where user is the recipient (not sent by them)
  const receivedNotifications = notifications.filter(
    n => currentUser && n.recipientId === currentUser.id
  );

  const receivedUnreadCount = receivedNotifications.filter(n => n.status !== 'read').length;

  const handleNotificationPress = async (notificationId: string, matchId: string) => {
    await markNotificationRead(notificationId);

    // Check if the match still exists before navigating
    const matchExists = matches.some(m => m.id === matchId);
    if (matchExists) {
      navigation.navigate('MatchDetails', { matchId });
    } else {
      showToast('This match no longer exists', 'info');
    }
  };

  return (
    <Layout title="Notifications" showBackButton={true}>
      {receivedUnreadCount > 0 && (
        <View style={styles.markAllContainer}>
          <TouchableOpacity
            onPress={markAllNotificationsRead}
            style={styles.markAllButton}
            accessibilityLabel="Mark all notifications as read"
            accessibilityRole="button"
          >
            <Text style={styles.markAllText}>Mark all as read</Text>
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
          renderItem={({ item }) => (
            <NotificationCard
              notification={item}
              onPress={() => handleNotificationPress(item.id, item.matchId)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Layout>
  );
};

const styles = StyleSheet.create({
  markAllContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
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
