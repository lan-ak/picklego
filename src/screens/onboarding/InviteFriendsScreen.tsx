import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList, ContactInfo } from '../../types';
import OnboardingLayout from '../../components/OnboardingLayout';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { Icon } from '../../components/Icon';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { useContacts } from '../../hooks/useContacts';
import { sendSMSInviteToContacts } from '../../utils/smsInvite';
import { colors, typography, spacing, borderRadius, shadows, springConfig } from '../../theme';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'InviteFriends'>;

const InviteFriendsScreen = () => {
  const navigation = useNavigation<Nav>();
  const { currentUser, invitePlayersBySMS, invitePlayer, sendPlayerInvite } = useData();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [hasRequestedPermission, setHasRequestedPermission] = useState(false);

  const contacts = useContacts({ enabled: hasRequestedPermission });

  const handleInvitePress = useCallback(() => {
    setHasRequestedPermission(true);
    contacts.handleAllowContacts();
  }, [contacts.handleAllowContacts]);

  const handleSendInvites = async () => {
    const selected = contacts.contactsList.filter(
      c => contacts.selectedContacts.has(c.phone),
    );

    if (selected.length === 0) {
      Alert.alert('No contacts selected', 'Select contacts to invite to PickleGo.');
      return;
    }

    setLoading(true);
    try {
      const onPickleGo = selected.filter(c => c.isOnPickleGo && c.pickleGoPlayerId);
      const notOnPickleGo = selected.filter(c => !c.isOnPickleGo);

      // Send in-app invites to contacts already on PickleGo
      for (const contact of onPickleGo) {
        try {
          await sendPlayerInvite(contact.pickleGoPlayerId!);
        } catch (error) {
          console.error(`Error sending invite to ${contact.name}:`, error);
        }
      }

      // For contacts not on PickleGo: create placeholders first, then send SMS
      if (notOnPickleGo.length > 0) {
        for (const contact of notOnPickleGo) {
          try {
            await invitePlayer(contact.name, { phone: contact.phone });
          } catch {
            // Placeholder creation is best-effort
          }
        }

        await sendSMSInviteToContacts(
          notOnPickleGo.map(c => ({ phone: c.phone, name: c.name })),
          invitePlayersBySMS,
        );
      }

      const totalInvited = onPickleGo.length + notOnPickleGo.length;
      showToast(`Invited ${totalInvited} friend${totalInvited > 1 ? 's' : ''}!`, 'success');
      contacts.resetSelection();
    } catch (error) {
      console.error('Error sending invites:', error);
      showToast('Failed to send invites', 'error');
    }
    setLoading(false);
  };

  const selectedCount = contacts.selectedContacts.size;
  const [invitedCount, setInvitedCount] = useState(0);

  // Pulsing animation for send button when contacts are selected
  const pulseScale = useSharedValue(1);
  useEffect(() => {
    if (selectedCount > 0) {
      pulseScale.value = withRepeat(
        withSequence(
          withSpring(1.03, springConfig.gentle),
          withSpring(1, springConfig.gentle)
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = withSpring(1, springConfig.snappy);
    }
  }, [selectedCount]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const firstName = currentUser?.name?.split(' ')[0] || 'Your';
  const peteMessage = invitedCount > 0
    ? `${invitedCount} friend${invitedCount > 1 ? 's' : ''} invited!`
    : `${firstName}'s crew is empty... let's fix that!`;

  const renderContact = ({ item }: { item: ContactInfo }) => {
    const id = item.phone;
    const isSelected = contacts.selectedContacts.has(id);

    return (
      <AnimatedPressable
        style={[styles.contactRow, isSelected && styles.contactRowSelected]}
        onPress={() => contacts.toggleContact(id)}
        hapticStyle="light"
      >
        <View style={styles.contactAvatar}>
          <Icon
            name={item.isOnPickleGo ? 'check-circle' : 'user'}
            size={20}
            color={item.isOnPickleGo ? colors.primary : colors.gray400}
          />
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>
            {item.isOnPickleGo ? item.pickleGoPlayerName || item.name : item.name}
          </Text>
          {item.isOnPickleGo && (
            <Text style={styles.onPickleGo}>Already on PickleGo</Text>
          )}
        </View>
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Icon name="check" size={14} color={colors.white} />}
        </View>
      </AnimatedPressable>
    );
  };

  return (
    <OnboardingLayout
      step={4}
      petePose="invite"
      peteSize="md"
      peteMessage={peteMessage}
      title="Invite Your Crew"
      subtitle="Pickleball is better with friends"
      ctaTitle={hasRequestedPermission ? 'Continue' : 'Invite my friends'}
      ctaOnPress={hasRequestedPermission ? () => navigation.navigate('ScheduleMatch') : handleInvitePress}
      secondaryAction={!hasRequestedPermission ? { title: 'Skip', onPress: () => navigation.navigate('ScheduleMatch') } : undefined}
    >
      <View style={styles.content}>
        {!hasRequestedPermission ? (
          <View style={styles.emptyContainer}>
            <Icon name="users" size={48} color={colors.primary} />
            <Text style={styles.prePermissionText}>
              Find your friends already on PickleGo and invite others to play
            </Text>
          </View>
        ) : (
          <>
            {selectedCount > 0 && (
              <Animated.View style={pulseStyle}>
                <AnimatedPressable
                  style={styles.sendButton}
                  onPress={() => {
                    const count = selectedCount;
                    handleSendInvites().then(() => setInvitedCount(prev => prev + count));
                  }}
                  hapticStyle="medium"
                >
                  {loading ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <>
                      <Icon name="send" size={16} color={colors.white} />
                      <Text style={styles.sendButtonText}>
                        Send {selectedCount} Invite{selectedCount > 1 ? 's' : ''}
                      </Text>
                    </>
                  )}
                </AnimatedPressable>
              </Animated.View>
            )}

            {contacts.loadingContacts ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Loading contacts...</Text>
              </View>
            ) : contacts.permissionDenied ? (
              <View style={styles.emptyContainer}>
                <Icon name="users" size={32} color={colors.gray400} />
                <Text style={styles.emptyText}>
                  {contacts.canAskAgain
                    ? 'Allow contact access to invite friends, or continue to schedule your first match.'
                    : 'Contact access was denied. Enable it in Settings to invite friends.'}
                </Text>
                <AnimatedPressable
                  style={styles.settingsButton}
                  onPress={contacts.canAskAgain ? contacts.loadContacts : () => Linking.openSettings()}
                  hapticStyle="light"
                >
                  <Text style={styles.settingsButtonText}>
                    {contacts.canAskAgain ? 'Try Again' : 'Open Settings'}
                  </Text>
                </AnimatedPressable>
              </View>
            ) : contacts.contactsList.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Icon name="users" size={32} color={colors.gray400} />
                <Text style={styles.emptyText}>No contacts found</Text>
              </View>
            ) : (
              <FlatList
                data={contacts.contactsList}
                renderItem={renderContact}
                keyExtractor={item => item.phone}
                style={styles.list}
                showsVerticalScrollIndicator={false}
              />
            )}
          </>
        )}
      </View>
    </OnboardingLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    marginTop: spacing.sm,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  sendButtonText: {
    ...typography.button,
    color: colors.white,
  },
  list: {
    flex: 1,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
    gap: spacing.md,
  },
  contactRowSelected: {
    backgroundColor: colors.primaryOverlay,
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    ...typography.bodyLarge,
    color: colors.neutral,
  },
  onPickleGo: {
    ...typography.caption,
    color: colors.primary,
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.bodySmall,
    color: colors.gray500,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xxl,
  },
  emptyText: {
    ...typography.bodyLarge,
    color: colors.gray500,
    textAlign: 'center',
  },
  prePermissionText: {
    ...typography.bodyLarge,
    color: colors.gray500,
    textAlign: 'center',
    lineHeight: 24,
  },
  settingsButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
  },
  settingsButtonText: {
    ...typography.button,
    color: colors.white,
  },
});

export default InviteFriendsScreen;
