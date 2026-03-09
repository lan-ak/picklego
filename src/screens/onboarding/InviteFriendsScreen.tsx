import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import * as Crypto from 'expo-crypto';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList, ContactInfo } from '../../types';
import OnboardingLayout from '../../components/OnboardingLayout';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { Icon } from '../../components/Icon';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { colors, typography, spacing, borderRadius, shadows, springConfig } from '../../theme';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'InviteFriends'>;

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return '1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  return digits;
}

async function hashPhone(normalizedPhone: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    normalizedPhone,
  );
}

const InviteFriendsScreen = () => {
  const navigation = useNavigation<Nav>();
  const { currentUser, invitePlayersBySMS, lookupContactsOnPickleGo, addPlayer } = useData();
  const { showToast } = useToast();
  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      setHasPermission(status === 'granted');

      if (status !== 'granted') {
        setContactsLoading(false);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Image],
      });

      const contactsWithPhone: ContactInfo[] = data
        .filter(c => c.phoneNumbers && c.phoneNumbers.length > 0 && c.name)
        .map(c => ({
          name: c.name || 'Unknown',
          phone: c.phoneNumbers![0].number || '',
          contactId: c.id,
          imageUri: c.image?.uri,
        }))
        .slice(0, 100); // Limit for performance

      // Look up which contacts are already on PickleGo
      if (contactsWithPhone.length > 0) {
        const hashes = await Promise.all(
          contactsWithPhone.map(c => hashPhone(normalizePhone(c.phone)))
        );
        const matches = await lookupContactsOnPickleGo(hashes);

        contactsWithPhone.forEach((contact, i) => {
          const match = matches.get(hashes[i]);
          if (match) {
            contact.isOnPickleGo = true;
            contact.pickleGoPlayerId = match.playerId;
            contact.pickleGoPlayerName = match.playerName;
          }
        });
      }

      // Sort: PickleGo users first, then alphabetical
      contactsWithPhone.sort((a, b) => {
        if (a.isOnPickleGo && !b.isOnPickleGo) return -1;
        if (!a.isOnPickleGo && b.isOnPickleGo) return 1;
        return a.name.localeCompare(b.name);
      });

      setContacts(contactsWithPhone);
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
    setContactsLoading(false);
  }, [lookupContactsOnPickleGo]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const toggleContact = (contactId: string) => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  };

  const handleSendInvites = async () => {
    const selected = contacts.filter(
      c => selectedContacts.has(c.contactId || c.phone) && !c.isOnPickleGo
    );

    if (selected.length === 0) {
      Alert.alert('No contacts selected', 'Select contacts to invite to PickleGo.');
      return;
    }

    setLoading(true);
    try {
      const contactsToInvite = selected.map(c => ({
        phone: normalizePhone(c.phone),
        name: c.name,
      }));

      await invitePlayersBySMS(contactsToInvite);

      // Create placeholder players so they appear in "My Players" tab
      if (currentUser) {
        for (const contact of selected) {
          try {
            await addPlayer({
              name: contact.name,
              pendingClaim: true,
              invitedBy: currentUser.id,
              isInvited: true,
            } as any);
          } catch {
            // Placeholder creation is best-effort
          }
        }
      }

      const isAvailable = await SMS.isAvailableAsync();
      if (isAvailable) {
        const phones = selected.map(c => c.phone);
        const message = `${currentUser?.name || 'A friend'} invited you to join PickleGo - the best way to track your pickleball matches! Download now: https://picklego.app/invite`;
        await SMS.sendSMSAsync(phones, message);
      }

      showToast(`Invited ${selected.length} friend${selected.length > 1 ? 's' : ''}!`, 'success');
      setSelectedContacts(new Set());
    } catch (error) {
      console.error('Error sending invites:', error);
      showToast('Failed to send invites', 'error');
    }
    setLoading(false);
  };

  const renderContact = ({ item }: { item: ContactInfo }) => {
    const id = item.contactId || item.phone;
    const isSelected = selectedContacts.has(id);

    return (
      <AnimatedPressable
        style={[styles.contactRow, isSelected && styles.contactRowSelected]}
        onPress={() => !item.isOnPickleGo && toggleContact(id)}
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
          <Text style={styles.contactName}>{item.name}</Text>
          {item.isOnPickleGo && (
            <Text style={styles.onPickleGo}>Already on PickleGo</Text>
          )}
        </View>
        {!item.isOnPickleGo && (
          <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
            {isSelected && <Icon name="check" size={14} color={colors.white} />}
          </View>
        )}
      </AnimatedPressable>
    );
  };

  const selectedCount = selectedContacts.size;
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

  return (
    <OnboardingLayout
      step={3}
      petePose="invite"
      peteSize="md"
      peteMessage={peteMessage}
      title="Invite Your Crew"
      subtitle="Pickleball is better with friends"
      ctaTitle="Continue"
      ctaOnPress={() => navigation.navigate('ScheduleMatch')}
    >
      <View style={styles.content}>
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

        {contactsLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading contacts...</Text>
          </View>
        ) : hasPermission === false ? (
          <View style={styles.emptyContainer}>
            <Icon name="users" size={32} color={colors.gray400} />
            <Text style={styles.emptyText}>
              Allow contact access to invite friends, or continue to schedule your first match.
            </Text>
          </View>
        ) : contacts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="users" size={32} color={colors.gray400} />
            <Text style={styles.emptyText}>No contacts found</Text>
          </View>
        ) : (
          <FlatList
            data={contacts}
            renderItem={renderContact}
            keyExtractor={item => item.contactId || item.phone}
            style={styles.list}
            showsVerticalScrollIndicator={false}
          />
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
});

export default InviteFriendsScreen;
