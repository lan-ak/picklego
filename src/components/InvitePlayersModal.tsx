import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Linking,
} from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { DismissableModal } from './DismissableModal';
import { Icon } from './Icon';
import { useData } from '../context/DataContext';
import { getPlayerDocument } from '../config/firebase';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, borderRadius } from '../theme';
import type { ContactInfo, Player } from '../types';
import { normalizePhone, formatPhoneDisplay, formatPhoneInput, isValidPhone } from '../utils/phone';
import { sendSMSInviteToContacts } from '../utils/smsInvite';
import { useContacts } from '../hooks/useContacts';
import { CountryPickerModal } from './CountryPickerModal';
import { DEFAULT_COUNTRY, type Country } from '../utils/countries';

type InviteContext = 'settings' | 'addMatch';

interface InvitePlayersModalProps {
  visible: boolean;
  onClose: () => void;
  context?: InviteContext;
  /** Modal title override for addMatch context (e.g. "Select Player for Team 2") */
  teamLabel?: string;
  /** Player IDs already on teams — excluded from "My Players" list */
  excludePlayerIds?: string[];
  /** Called when a contact already on PickleGo is selected (addMatch context) */
  onSelectExistingPlayer?: (player: Player) => void;
  /** Called when a placeholder is created for a contact (addMatch context) */
  onPlaceholderCreated?: (player: Player) => void;
  /** When true, renders content directly without RN Modal wrapper (for navigation-based usage) */
  renderAsScreen?: boolean;
}

type TabKey = 'players' | 'invite';

export const InvitePlayersModal: React.FC<InvitePlayersModalProps> = ({
  visible,
  onClose,
  context = 'settings',
  teamLabel,
  excludePlayerIds = [],
  onSelectExistingPlayer,
  onPlaceholderCreated,
  renderAsScreen = false,
}) => {
  const {
    currentUser,
    authLoading,
    addPlayer,
    invitePlayer,
    invitePlayersBySMS,
    sendPlayerInvite,
    players,
  } = useData();

  const insets = useSafeAreaInsets();
  const isAddMatch = context === 'addMatch';

  // Tab state — only used in addMatch context
  const [activeTab, setActiveTab] = useState<TabKey>(isAddMatch ? 'players' : 'invite');

  const showingInvite = isAddMatch ? activeTab === 'invite' : true;

  // Shared contacts hook
  const contacts = useContacts({ enabled: visible && showingInvite });

  // Reset tab when modal opens
  useEffect(() => {
    if (visible) {
      setActiveTab(isAddMatch ? 'players' : 'invite');
      setPlayerSearchQuery('');
      setInviteName('');
      setInviteEmail('');
      setShowManualForm(false);
      setInvitePhone('');
      contacts.resetAll();
    }
  }, [visible]);

  // --- My Players tab state ---
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');

  // --- Invite tab: manual form state ---
  const [inviteName, setInviteName] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country>(DEFAULT_COUNTRY);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);
  const [sending, setSending] = useState(false);

  // --- My Players tab: get filtered connected players ---
  const getFilteredPlayers = (): Player[] => {
    const excludeSet = new Set(excludePlayerIds);
    const filtered = players.filter(
      player =>
        player.name.toLowerCase().includes(playerSearchQuery.toLowerCase()) &&
        !excludeSet.has(player.id),
    );

    // Deduplicate by email: prefer real accounts over placeholders
    const emailMap = new Map<string, Player>();
    const noEmailPlayers: Player[] = [];

    for (const player of filtered) {
      if (player.email) {
        const key = player.email.trim().toLowerCase();
        const existing = emailMap.get(key);
        if (!existing || (existing.pendingClaim && !player.pendingClaim)) {
          emailMap.set(key, player);
        }
      } else {
        noEmailPlayers.push(player);
      }
    }

    // Also deduplicate by phone: if a real (non-placeholder) player exists with
    // the same phone number, filter out the stale placeholder from noEmailPlayers
    const allDeduped = [...emailMap.values()];
    const realPhones = new Set<string>();
    for (const p of [...allDeduped, ...noEmailPlayers]) {
      if (p.phoneNumber && !p.pendingClaim) {
        realPhones.add(normalizePhone(p.phoneNumber));
      }
    }
    const dedupedNoEmail = noEmailPlayers.filter(p => {
      if (!p.pendingClaim || !p.phoneNumber) return true;
      return !realPhones.has(normalizePhone(p.phoneNumber));
    });

    return [...allDeduped, ...dedupedNoEmail];
  };

  // --- Send contact invites ---
  const handleSendInvites = async () => {
    if (contacts.selectedContacts.size === 0 || authLoading) return;
    setSending(true);

    try {
      const selected = contacts.contactsList.filter(c => contacts.selectedContacts.has(c.phone));
      const onPickleGo = selected.filter(c => c.isOnPickleGo && c.pickleGoPlayerId);
      const notOnPickleGo = selected.filter(c => !c.isOnPickleGo);

      for (const contact of onPickleGo) {
        try {
          if (isAddMatch && onSelectExistingPlayer) {
            let existingPlayer = players.find(p => p.id === contact.pickleGoPlayerId);
            // Player found on PickleGo but not in local state — fetch from Firestore
            if (!existingPlayer && contact.pickleGoPlayerId) {
              const fetched = await getPlayerDocument(contact.pickleGoPlayerId);
              if (fetched) {
                existingPlayer = fetched;
              }
            }
            if (existingPlayer) {
              onSelectExistingPlayer(existingPlayer);
              // Also send a player_invite if not already connected
              await sendPlayerInvite(contact.pickleGoPlayerId!);
              continue;
            }
          }
          await sendPlayerInvite(contact.pickleGoPlayerId!);
        } catch (error) {
          console.error(`Error sending invite to ${contact.name}:`, error);
        }
      }

      if (notOnPickleGo.length > 0) {
        // Create placeholders via unified invitePlayer
        for (const contact of notOnPickleGo) {
          try {
            const result = await invitePlayer(contact.name, { phone: contact.phone });
            if (isAddMatch && result.player && onPlaceholderCreated) {
              onPlaceholderCreated(result.player);
            }
          } catch {
            // Placeholder creation is best-effort
          }
        }

        await sendSMSInviteToContacts(
          notOnPickleGo.map(c => ({ phone: c.phone, name: c.name })),
          invitePlayersBySMS,
        );
      }

      if (!isAddMatch) {
        Alert.alert(
          'Invites Sent',
          `${onPickleGo.length > 0 ? `${onPickleGo.length} in-app invite(s) sent. ` : ''}${notOnPickleGo.length > 0 ? `${notOnPickleGo.length} SMS invite(s) queued.` : ''}`,
        );
      }

      contacts.resetSelection();
      onClose();
    } catch (error) {
      console.error('Error sending invites:', error);
      Alert.alert('Error', 'Failed to send some invites. Please try again.');
    }

    setSending(false);
  };

  // --- Manual form handler (name + optional email) ---
  const handleManualAdd = async () => {
    if (!inviteName.trim()) {
      Alert.alert('Error', 'Please enter a player name.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const hasEmail = inviteEmail.trim().length > 0;
    const hasPhone = invitePhone.trim().length > 0;
    const normalizedPhone = hasPhone ? normalizePhone(invitePhone.trim(), selectedCountry.dialCode) : '';

    if (hasEmail && !emailRegex.test(inviteEmail)) {
      Alert.alert('Error', 'Please enter a valid email address.');
      return;
    }

    if (hasPhone && !isValidPhone(invitePhone.trim(), selectedCountry.dialCode)) {
      Alert.alert('Error', 'Please enter a valid phone number.');
      return;
    }

    const clearAndClose = () => {
      setInviteName('');
      setInvitePhone('');
      setInviteEmail('');
      setShowManualForm(false);
      onClose();
    };

    // No email and no phone (addMatch context allows name-only) — create a local placeholder
    if (!hasEmail && !hasPhone) {
      if (!isAddMatch) {
        Alert.alert('Error', 'Please enter a phone number or email address.');
        return;
      }
      try {
        const placeholder = await addPlayer({
          name: inviteName.trim(),
          pendingClaim: true,
          invitedBy: currentUser?.id,
          isInvited: true,
        } as any);
        if (onPlaceholderCreated) {
          onPlaceholderCreated(placeholder);
        }
        clearAndClose();
      } catch {
        Alert.alert('Error', 'Failed to add player. Please try again.');
      }
      return;
    }

    // Unified invite — handles email, phone, or both
    try {
      const result = await invitePlayer(inviteName.trim(), {
        email: hasEmail ? inviteEmail.trim() : undefined,
        phone: hasPhone ? normalizedPhone : undefined,
      });

      // If phone was provided and a new placeholder was created, send SMS
      if (hasPhone && result.type === 'invited') {
        await sendSMSInviteToContacts(
          [{ phone: normalizedPhone, name: inviteName.trim() }],
          invitePlayersBySMS,
        );
      }

      switch (result.type) {
        case 'invited':
          if (isAddMatch && result.player && onPlaceholderCreated) {
            onPlaceholderCreated(result.player);
          }
          Alert.alert(
            'Success',
            hasPhone
              ? `SMS invite sent to ${inviteName.trim()}.`
              : `${inviteName} has been invited. They can join the app using this email address.`,
            [{ text: 'OK', onPress: clearAndClose }],
          );
          break;
        case 'invite_sent':
        case 'existing_player':
          if (isAddMatch && result.player && onSelectExistingPlayer) {
            onSelectExistingPlayer(result.player);
          }
          Alert.alert(
            'Player Invite Sent',
            `${result.player?.name || inviteName} is already on PickleGo! A player invite has been sent.`,
            [{ text: 'OK', onPress: clearAndClose }],
          );
          break;
        case 'already_connected':
          if (isAddMatch && result.player && onSelectExistingPlayer) {
            onSelectExistingPlayer(result.player);
            clearAndClose();
          } else {
            Alert.alert('Already Connected', `You're already connected with ${result.player?.name || inviteName}.`);
          }
          break;
        case 'request_pending':
          Alert.alert('Invite Pending', `A player invite to ${result.player?.name || inviteName} is already pending.`);
          break;
        default:
          Alert.alert('Error', 'There was an error sending the invitation. Please try again.');
          break;
      }
    } catch {
      Alert.alert('Error', 'Failed to send invite. Please try again.');
    }
  };

  const handleClose = () => {
    contacts.resetSelection();
    contacts.setSearchQuery('');
    setPlayerSearchQuery('');
    onClose();
  };

  // ==================== RENDER: My Players Tab ====================

  const renderPlayersTab = () => {
    const filteredPlayers = getFilteredPlayers();

    return (
      <View style={styles.playersContainer}>
        <View style={styles.searchContainer}>
          <Icon name="search" size={18} color={colors.gray400} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search players..."
            value={playerSearchQuery}
            onChangeText={setPlayerSearchQuery}
            autoCapitalize="none"
            autoFocus
          />
        </View>

        <FlatList
          data={filteredPlayers}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: spacing.lg }}
          renderItem={({ item }) => (
            <AnimatedPressable
              style={styles.playerItem}
              onPress={() => {
                if (onSelectExistingPlayer) {
                  onSelectExistingPlayer(item);
                }
                handleClose();
              }}

            >
              <View style={styles.playerRow}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {item.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                  </Text>
                </View>
                <Text style={styles.playerName} numberOfLines={1}>{item.name}</Text>
              </View>
              <Icon name="plus-circle" size={24} color={colors.primary} />
            </AnimatedPressable>
          )}
          style={styles.playerList}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {playerSearchQuery
                  ? 'No players match your search'
                  : 'No available players'}
              </Text>
              <AnimatedPressable onPress={() => setActiveTab('invite')}>
                <Text style={styles.emptyStateLink}>Invite someone new</Text>
              </AnimatedPressable>
            </View>
          }
        />
      </View>
    );
  };

  // ==================== RENDER: Invite Tab (contacts + manual form) ====================

  const renderContactItem = ({ item }: { item: ContactInfo }) => {
    const isSelected = contacts.selectedContacts.has(item.phone);
    const initials = item.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    return (
      <AnimatedPressable
        style={[styles.contactItem, isSelected && styles.contactItemSelected]}
        onPress={() => contacts.toggleContact(item.phone)}
      >
        <View style={[styles.avatar, item.isOnPickleGo && styles.avatarOnPickleGo]}>
          <Text style={styles.avatarText}>{initials || '?'}</Text>
        </View>

        <View style={styles.contactInfo}>
          <View style={styles.contactNameRow}>
            <Text style={styles.contactName} numberOfLines={1}>
              {item.isOnPickleGo ? item.pickleGoPlayerName || item.name : item.name}
            </Text>
            {item.isOnPickleGo && (
              <View style={styles.pickleGoBadge}>
                <Text style={styles.pickleGoBadgeText}>On PickleGo</Text>
              </View>
            )}
          </View>
          <Text style={styles.contactPhone}>
            {formatPhoneDisplay(item.phone)}
          </Text>
        </View>

        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Icon name="check" size={14} color={colors.white} />}
        </View>
      </AnimatedPressable>
    );
  };

  const renderContactsSection = () => {
    if (!contacts.hasRequestedContacts && !contacts.permissionDenied && contacts.contactsList.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Icon name="users" size={40} color={colors.primary} />
          <Text style={styles.emptyStateTitle}>Find friends on PickleGo</Text>
          <Text style={styles.emptyStateText}>
            Access your contacts to find friends already on PickleGo and invite others to play.
          </Text>
          <AnimatedPressable style={styles.allowContactsButton} onPress={contacts.handleAllowContacts}>
            <Icon name="book-user" size={16} color={colors.white} />
            <Text style={styles.allowContactsButtonText}>Allow Contact Access</Text>
          </AnimatedPressable>
        </View>
      );
    }

    if (contacts.permissionDenied) {
      return (
        <View style={styles.emptyState}>
          <Icon name="book-user" size={40} color={colors.gray400} />
          <Text style={styles.emptyStateTitle}>Contacts Access Required</Text>
          <Text style={styles.emptyStateText}>
            {contacts.canAskAgain
              ? 'Allow PickleGo to access your contacts to invite friends.'
              : 'Allow PickleGo to access your contacts to invite friends. You can enable this in Settings.'}
          </Text>
          <AnimatedPressable
            style={styles.retryButton}
            onPress={contacts.canAskAgain ? contacts.loadContacts : () => Linking.openSettings()}
          >
            <Text style={styles.retryButtonText}>
              {contacts.canAskAgain ? 'Try Again' : 'Open Settings'}
            </Text>
          </AnimatedPressable>
        </View>
      );
    }

    if (contacts.loadingContacts) {
      return (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading contacts...</Text>
        </View>
      );
    }

    return (
      <>
        <View style={styles.searchContainer}>
          <Icon name="search" size={18} color={colors.gray400} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search contacts..."
            value={contacts.searchQuery}
            onChangeText={contacts.setSearchQuery}
            autoCapitalize="none"
          />
        </View>

        {contacts.isLimitedAccess && (
          <AnimatedPressable style={styles.limitedAccessBanner} onPress={contacts.handleExpandAccess}>
            <View style={styles.limitedAccessContent}>
              <Icon name="info" size={16} color={colors.primary} />
              <Text style={styles.limitedAccessText}>Not seeing all your contacts?</Text>
            </View>
            <Text style={styles.limitedAccessAction}>Grant More Access</Text>
          </AnimatedPressable>
        )}

        <FlatList
          data={contacts.filteredContacts}
          keyExtractor={item => item.phone}
          renderItem={renderContactItem}
          style={styles.contactList}
          contentContainerStyle={{ paddingBottom: spacing.lg }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {contacts.searchQuery ? 'No contacts match your search' : 'No contacts with phone numbers found'}
              </Text>
            </View>
          }
        />

        {contacts.selectedContacts.size > 0 && (
          <AnimatedPressable
            style={[styles.sendButton, sending && styles.sendButtonDisabled]}
            onPress={handleSendInvites}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Icon name="send" size={18} color={colors.white} />
                <Text style={styles.sendButtonText}>
                  {`Send ${contacts.selectedContacts.size} Invite${contacts.selectedContacts.size > 1 ? 's' : ''}`}
                </Text>
              </>
            )}
          </AnimatedPressable>
        )}
      </>
    );
  };

  const renderManualForm = () => (
    <View style={styles.manualFormContainer}>
      <AnimatedPressable
        style={styles.manualFormToggle}
        onPress={() => setShowManualForm(!showManualForm)}
      >
        <View style={styles.manualFormToggleRow}>
          <Icon name="user-plus" size={16} color={colors.primary} />
          <Text style={styles.manualFormToggleText}>
            {isAddMatch ? 'Add by name / phone / email' : 'Add by phone / email'}
          </Text>
        </View>
        <Icon
          name={showManualForm ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.gray400}
        />
      </AnimatedPressable>

      {showManualForm && (
        <View style={styles.manualFormFields}>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Player Name</Text>
            <TextInput
              style={styles.input}
              value={inviteName}
              onChangeText={setInviteName}
              placeholder="Enter player's name"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Phone Number{inviteEmail.trim() ? ' (optional)' : ''}</Text>
            <View style={styles.phoneInputRow}>
              <AnimatedPressable
                style={styles.countrySelector}
                onPress={() => setCountryPickerVisible(true)}
                hapticStyle="light"
              >
                <Text style={styles.countrySelectorText}>
                  {selectedCountry.flag} +{selectedCountry.dialCode}
                </Text>
                <Icon name="chevron-down" size={14} color={colors.gray400} />
              </AnimatedPressable>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={invitePhone}
                onChangeText={(text) => setInvitePhone(formatPhoneInput(text, selectedCountry.dialCode))}
                placeholder={selectedCountry.dialCode === '1' ? '(555) 123-4567' : 'Phone number'}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>
              {isAddMatch ? 'Email Address (optional)' : `Email Address${invitePhone.trim() ? ' (optional)' : ''}`}
            </Text>
            <TextInput
              style={styles.input}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="Enter player's email"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <AnimatedPressable style={styles.sendButton} onPress={handleManualAdd}>
            <Icon name={isAddMatch ? 'user-plus' : 'mail'} size={18} color={colors.white} />
            <Text style={styles.sendButtonText}>
              {isAddMatch ? 'Add Player' : 'Send Invitation'}
            </Text>
          </AnimatedPressable>
        </View>
      )}
    </View>
  );

  const renderInviteTab = () => (
    <View style={styles.inviteContainer}>
      {renderManualForm()}
      {renderContactsSection()}
    </View>
  );

  // ==================== RENDER: Modal ====================

  const title = isAddMatch
    ? (teamLabel || 'Add Player')
    : 'Invite Players';

  const content = (
    <KeyboardAvoidingView
      style={[
        renderAsScreen ? styles.screenContent : styles.modalContent,
        { paddingBottom: Math.max(insets.bottom, spacing.lg) },
      ]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <AnimatedPressable style={styles.closeButton} onPress={handleClose}>
          <Icon name="x" size={24} color={colors.gray500} />
        </AnimatedPressable>
      </View>

      {/* Tabs — only in addMatch context */}
      {isAddMatch && (
        <View style={styles.tabBar}>
          <View style={styles.tabWrapper}>
            <AnimatedPressable
              style={[styles.tab, activeTab === 'players' && styles.tabActive]}
              onPress={() => setActiveTab('players')}
            >
              <Text style={[styles.tabText, activeTab === 'players' && styles.tabTextActive]}>
                My Players
              </Text>
            </AnimatedPressable>
          </View>

          <View style={styles.tabWrapper}>
            <AnimatedPressable
              style={[styles.tab, activeTab === 'invite' && styles.tabActive]}
              onPress={() => setActiveTab('invite')}
            >
              <Text style={[styles.tabText, activeTab === 'invite' && styles.tabTextActive]}>
                Invite New
              </Text>
            </AnimatedPressable>
          </View>
        </View>
      )}

      {/* Tab content */}
      {isAddMatch && activeTab === 'players'
        ? renderPlayersTab()
        : renderInviteTab()}
    </KeyboardAvoidingView>
  );

  // When used as a navigation screen, skip the Modal wrapper
  if (renderAsScreen) {
    return content;
  }

  return (
    <>
      <DismissableModal
        visible={visible}
        onClose={handleClose}
        overlayStyle={styles.modalOverlay}
      >
        {content}
      </DismissableModal>
      <CountryPickerModal
        visible={countryPickerVisible}
        onClose={() => setCountryPickerVisible(false)}
        onSelect={(country) => {
          setSelectedCountry(country);
          setInvitePhone('');
        }}
        selectedCode={selectedCountry.code}
      />
    </>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.backdrop,
    justifyContent: 'flex-end',
  },
  modalContent: {
    flex: 1,
    marginTop: 60,
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
  },
  screenContent: {
    flex: 1,
    backgroundColor: colors.white,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: colors.neutral,
  },
  closeButton: {
    padding: spacing.xs,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    overflow: 'hidden',
  },
  tabWrapper: {
    flex: 1,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    ...typography.button,
    color: colors.primary,
  },
  tabTextActive: {
    color: colors.white,
  },

  // My Players tab
  playersContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  playerList: {
    flex: 1,
  },
  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
  },
  playerName: {
    ...typography.bodyLarge,
    color: colors.neutral,
    flex: 1,
  },

  // Invite tab
  inviteContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },

  // Shared search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  searchInput: {
    ...typography.bodySmall,
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    color: colors.neutral,
  },

  // Contact items
  contactList: {
    flex: 1,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    gap: spacing.md,
  },
  contactItemSelected: {
    backgroundColor: colors.primaryOverlay,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOnPickleGo: {
    backgroundColor: colors.primaryOverlay,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  avatarText: {
    ...typography.label,
    color: colors.gray500,
  },
  contactInfo: {
    flex: 1,
  },
  contactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  contactName: {
    ...typography.bodyLarge,
    color: colors.neutral,
    flexShrink: 1,
  },
  pickleGoBadge: {
    backgroundColor: colors.primaryOverlay,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  pickleGoBadgeText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  contactPhone: {
    ...typography.caption,
    color: colors.gray400,
    marginTop: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },

  // Manual form
  manualFormContainer: {
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
  },
  manualFormToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  manualFormToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  manualFormToggleText: {
    ...typography.label,
    color: colors.primary,
  },
  manualFormFields: {
    paddingTop: spacing.sm,
  },

  // Limited access banner
  limitedAccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primaryOverlay,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  limitedAccessContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  limitedAccessText: {
    ...typography.caption,
    color: colors.neutral,
  },
  limitedAccessAction: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },

  // Send button
  sendButton: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    ...typography.button,
    color: colors.white,
  },

  // Form inputs
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countrySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
  },
  countrySelectorText: {
    ...typography.bodySmall,
    color: colors.neutral,
  },
  inputContainer: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    ...typography.label,
    color: colors.neutral,
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.bodySmall,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    color: colors.neutral,
  },

  // Empty / loading states
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  emptyStateTitle: {
    ...typography.bodyLarge,
    color: colors.neutral,
    fontWeight: '600',
  },
  emptyStateText: {
    ...typography.bodySmall,
    color: colors.gray400,
    textAlign: 'center',
  },
  emptyStateLink: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
  loadingState: {
    alignItems: 'center',
    paddingVertical: spacing.xxxxl,
    gap: spacing.md,
  },
  loadingText: {
    ...typography.bodySmall,
    color: colors.gray400,
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  retryButtonText: {
    ...typography.button,
    color: colors.white,
  },
  allowContactsButton: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    alignItems: 'center',
    gap: spacing.sm,
  },
  allowContactsButtonText: {
    ...typography.button,
    color: colors.white,
  },
});
