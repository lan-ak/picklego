import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList, SMSInvite } from '../../types';
import OnboardingLayout from '../../components/OnboardingLayout';
import { AnimatedPressable } from '../../components/AnimatedPressable';
import { Icon } from '../../components/Icon';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { useSlideIn, useHaptic } from '../../hooks';
import { callClaimSMSInvite } from '../../config/firebase';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';
import { normalizePhone, formatPhoneInput, isValidPhone } from '../../utils/phone';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'PhoneNumber'>;

type ScreenState = 'idle' | 'saving' | 'showingInvites' | 'noInvites';

const InviteCard = ({
  invite,
  index,
  onAccept,
  accepting,
}: {
  invite: SMSInvite;
  index: number;
  onAccept: (invite: SMSInvite) => void;
  accepting: string | null;
}) => {
  const slideStyle = useSlideIn(index + 2, 'right', 40);
  const isAccepting = accepting === invite.id;

  return (
    <Animated.View style={[styles.inviteCard, slideStyle]}>
      <View style={[styles.inviteAccent, { backgroundColor: colors.primary }]} />
      <View style={[styles.inviteIcon, { backgroundColor: colors.primary + '20' }]}>
        <Icon name="user-plus" size={20} color={colors.primary} />
      </View>
      <View style={styles.inviteContent}>
        <Text style={styles.inviteName}>{invite.inviterName}</Text>
        <Text style={styles.inviteSubtitle}>Invited you to PickleGo</Text>
      </View>
      <AnimatedPressable
        style={[styles.acceptButton, isAccepting && styles.acceptButtonDisabled]}
        onPress={() => onAccept(invite)}
        hapticStyle="medium"
        disabled={isAccepting}
      >
        {isAccepting ? (
          <ActivityIndicator color={colors.white} size="small" />
        ) : (
          <Text style={styles.acceptButtonText}>Accept</Text>
        )}
      </AnimatedPressable>
    </Animated.View>
  );
};

const NoInvitesCard = () => {
  const slideStyle = useSlideIn(2, 'up', 30);

  return (
    <Animated.View style={[styles.noInvitesCard, slideStyle]}>
      <View style={[styles.noInvitesIcon, { backgroundColor: colors.primary + '20' }]}>
        <Icon name="users" size={28} color={colors.primary} />
      </View>
      <Text style={styles.noInvitesText}>
        No pending invites yet — no worries!{'\n'}You can invite friends in the next step.
      </Text>
    </Animated.View>
  );
};

const PhoneNumberScreen = () => {
  const navigation = useNavigation<Nav>();
  const { currentUser, updatePlayer, findSMSInvitesByPhone, refreshConnectedPlayers } = useData();
  const { showToast } = useToast();
  const triggerHaptic = useHaptic();
  const [phone, setPhone] = useState('');
  const [screenState, setScreenState] = useState<ScreenState>('idle');
  const [invites, setInvites] = useState<SMSInvite[]>([]);
  const [accepting, setAccepting] = useState<string | null>(null);

  const phoneValid = isValidPhone(phone);

  const handleSubmit = useCallback(async () => {
    if (!currentUser?.id || !phoneValid) return;

    setScreenState('saving');
    try {
      const trimmedPhone = phone.trim();
      await updatePlayer(currentUser.id, { phoneNumber: trimmedPhone });

      const normalized = normalizePhone(trimmedPhone);
      const foundInvites = await findSMSInvitesByPhone(normalized);

      if (foundInvites.length > 0) {
        setInvites(foundInvites);
        setScreenState('showingInvites');
        triggerHaptic('success');
      } else {
        setScreenState('noInvites');
        triggerHaptic('success');
      }
    } catch (error) {
      console.error('Error saving phone number:', error);
      showToast('Failed to save phone number', 'error');
      setScreenState('idle');
    }
  }, [currentUser?.id, phoneValid, phone, updatePlayer, findSMSInvitesByPhone, triggerHaptic, showToast]);

  const handleAcceptInvite = useCallback(async (invite: SMSInvite) => {
    setAccepting(invite.id);
    try {
      const result = await callClaimSMSInvite(invite.id);
      if (result.claimed) {
        await refreshConnectedPlayers();
        triggerHaptic('success');
        showToast(`Connected with ${invite.inviterName}!`, 'success');
        setInvites(prev => {
          const remaining = prev.filter(i => i.id !== invite.id);
          if (remaining.length === 0) {
            setScreenState('noInvites');
          }
          return remaining;
        });
      }
    } catch (error) {
      console.error('Error accepting invite:', error);
      showToast('Failed to accept invite', 'error');
    }
    setAccepting(null);
  }, [refreshConnectedPlayers, triggerHaptic, showToast]);

  const goNext = () => navigation.navigate('InviteFriends');

  const getPeteMessage = () => {
    if (screenState === 'showingInvites') return "You've got friends waiting!";
    if (screenState === 'noInvites') return "You're all set!";
    return "Let's find your friends!";
  };

  const getPetePose = (): 'invite' | 'high-five' => {
    if (screenState === 'noInvites') return 'high-five';
    return 'invite';
  };

  const getCtaTitle = () => {
    if (screenState === 'idle') return 'Continue';
    if (screenState === 'saving') return 'Saving...';
    return 'Continue';
  };

  const getCtaOnPress = () => {
    if (screenState === 'idle') return handleSubmit;
    return goNext;
  };

  const isCtaDisabled = () => {
    if (screenState === 'idle') return !phoneValid;
    if (screenState === 'saving') return true;
    return false;
  };

  return (
    <OnboardingLayout
      step={3}
      petePose={getPetePose()}
      peteSize="md"
      peteMessage={getPeteMessage()}
      title="Your Phone Number"
      subtitle="So your friends can find you on PickleGo"
      ctaTitle={getCtaTitle()}
      ctaOnPress={getCtaOnPress()}
      ctaLoading={screenState === 'saving'}
      ctaDisabled={isCtaDisabled()}
      secondaryAction={
        screenState === 'idle'
          ? { title: 'Skip', onPress: goNext }
          : undefined
      }
    >
      <View style={styles.content}>
        {screenState === 'idle' && (
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <Icon name="phone" size={20} color={colors.gray400} />
              <TextInput
                style={styles.input}
                placeholder="(555) 123-4567"
                placeholderTextColor={colors.gray300}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={(text) => setPhone(formatPhoneInput(text))}

              />
            </View>
            <View style={styles.privacyNote}>
              <Icon name="info" size={14} color={colors.gray400} />
              <Text style={styles.privacyText}>
                Only used to connect you with friends — we'll never call or text you.
              </Text>
            </View>
            {phone.length > 0 && !phoneValid && (
              <Text style={styles.validationText}>Enter a valid phone number</Text>
            )}
          </View>
        )}

        {screenState === 'saving' && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Checking for invites...</Text>
          </View>
        )}

        {screenState === 'showingInvites' && (
          <FlatList
            data={invites}
            renderItem={({ item, index }) => (
              <InviteCard
                invite={item}
                index={index}
                onAccept={handleAcceptInvite}
                accepting={accepting}
              />
            )}
            keyExtractor={item => item.id}
            style={styles.inviteList}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.inviteListContent}
          />
        )}

        {screenState === 'noInvites' && <NoInvitesCard />}
      </View>
    </OnboardingLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    marginTop: spacing.sm,
  },
  inputContainer: {
    gap: spacing.sm,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    ...shadows.sm,
  },
  input: {
    flex: 1,
    ...typography.bodyLarge,
    color: colors.neutral,
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  privacyText: {
    ...typography.caption,
    color: colors.gray400,
    flex: 1,
  },
  validationText: {
    ...typography.caption,
    color: colors.error,
    marginLeft: spacing.sm,
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
  inviteList: {
    flex: 1,
  },
  inviteListContent: {
    gap: spacing.md,
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    gap: spacing.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  inviteAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: borderRadius.md,
    borderBottomLeftRadius: borderRadius.md,
  },
  inviteIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteContent: {
    flex: 1,
  },
  inviteName: {
    ...typography.bodyLarge,
    color: colors.neutral,
  },
  inviteSubtitle: {
    ...typography.caption,
    color: colors.gray400,
    marginTop: 2,
  },
  acceptButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.pill,
    minWidth: 80,
    alignItems: 'center',
  },
  acceptButtonDisabled: {
    opacity: 0.6,
  },
  acceptButtonText: {
    ...typography.button,
    color: colors.white,
  },
  noInvitesCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.xxl,
    gap: spacing.lg,
    ...shadows.sm,
  },
  noInvitesIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noInvitesText: {
    ...typography.bodyLarge,
    color: colors.gray500,
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default PhoneNumberScreen;
