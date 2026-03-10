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
} from 'react-native';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import * as Crypto from 'expo-crypto';
import { AnimatedPressable } from './AnimatedPressable';
import { DismissableModal } from './DismissableModal';
import { Icon } from './Icon';
import { useData } from '../context/DataContext';
import { colors, typography, spacing, borderRadius } from '../theme';
import type { ContactInfo, Player } from '../types';

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

/**
 * Normalize a phone number to digits-only with country code.
 * Strips formatting chars; assumes US (+1) if 10 digits.
 */
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

function formatPhoneDisplay(phone: string): string {
  if (phone.length === 11 && phone.startsWith('1')) {
    return `+1 (${phone.slice(1, 4)}) ${phone.slice(4, 7)}-${phone.slice(7)}`;
  }
  return phone;
}

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
    lookupContactsOnPickleGo,
    sendPlayerInvite,
    players,
  } = useData();

  const isAddMatch = context === 'addMatch';

  // Tab state — only used in addMatch context
  const [activeTab, setActiveTab] = useState<TabKey>(isAddMatch ? 'players' : 'invite');

  // Reset tab when modal opens
  useEffect(() => {
    if (visible) {
      setActiveTab(isAddMatch ? 'players' : 'invite');
      setPlayerSearchQuery('');
      setSearchQuery('');
      setSelectedContacts(new Set());
      setInviteName('');
      setInviteEmail('');
      setShowManualForm(false);
      setHasRequestedContacts(false);
    }
  }, [visible]);

  // --- My Players tab state ---
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');

  // --- Invite tab: contacts state ---
  const [contactsList, setContactsList] = useState<ContactInfo[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<ContactInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [smsAvailable, setSmsAvailable] = useState(true);
  const [sending, setSending] = useState(false);
  const [hasRequestedContacts, setHasRequestedContacts] = useState(false);

  // --- Invite tab: manual form state ---
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [showManualForm, setShowManualForm] = useState(false);

  // Check SMS availability
  useEffect(() => {
    SMS.isAvailableAsync().then(setSmsAvailable);
  }, []);

  const handleAllowContacts = () => {
    setHasRequestedContacts(true);
    loadContacts();
  };

  // Filter contacts on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredContacts(contactsList);
      return;
    }
    const q = searchQuery.toLowerCase();
    setFilteredContacts(
      contactsList.filter(
        c => c.name.toLowerCase().includes(q) || c.phone.includes(q),
      ),
    );
  }, [searchQuery, contactsList]);

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

    return [...emailMap.values(), ...noEmailPlayers];
  };

  // --- Contacts loading ---
  const loadContacts = async () => {
    setLoadingContacts(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setLoadingContacts(false);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Name,
          Contacts.Fields.Image,
        ],
      });

      const contacts: ContactInfo[] = [];
      const seenPhones = new Set<string>();

      for (const contact of data) {
        if (!contact.phoneNumbers) continue;
        const name = contact.name || contact.firstName || contact.lastName || '';
        for (const pn of contact.phoneNumbers) {
          if (!pn.number) continue;
          const normalized = normalizePhone(pn.number);
          if (normalized.length < 10 || seenPhones.has(normalized)) continue;
          seenPhones.add(normalized);
          contacts.push({
            name: name || pn.number,
            phone: normalized,
            contactId: contact.id,
            imageUri: contact.image?.uri,
          });
        }
      }

      contacts.sort((a, b) => a.name.localeCompare(b.name));

      if (contacts.length > 0) {
        try {
          const hashes = await Promise.all(
            contacts.map(c => hashPhone(c.phone)),
          );
          const hashToContact = new Map<string, number>();
          hashes.forEach((h, i) => hashToContact.set(h, i));

          const matches = await lookupContactsOnPickleGo(hashes);
          for (const [hash, info] of matches) {
            const idx = hashToContact.get(hash);
            if (idx !== undefined) {
              contacts[idx].isOnPickleGo = true;
              contacts[idx].pickleGoPlayerId = info.playerId;
              contacts[idx].pickleGoPlayerName = info.playerName;
            }
          }
        } catch (error) {
          console.error('Error looking up phone numbers:', error);
        }
      }

      contacts.sort((a, b) => {
        if (a.isOnPickleGo && !b.isOnPickleGo) return -1;
        if (!a.isOnPickleGo && b.isOnPickleGo) return 1;
        return a.name.localeCompare(b.name);
      });

      setContactsList(contacts);
      setFilteredContacts(contacts);
    } catch (error) {
      console.error('Error loading contacts:', error);
      Alert.alert('Error', 'Failed to load contacts.');
    }
    setLoadingContacts(false);
  };

  const toggleContact = (phone: string) => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  };

  // --- Send contact invites ---
  const handleSendInvites = async () => {
    if (selectedContacts.size === 0 || authLoading) return;
    setSending(true);

    try {
      const selected = contactsList.filter(c => selectedContacts.has(c.phone));
      const onPickleGo = selected.filter(c => c.isOnPickleGo && c.pickleGoPlayerId);
      const notOnPickleGo = selected.filter(c => !c.isOnPickleGo);

      for (const contact of onPickleGo) {
        try {
          if (isAddMatch && onSelectExistingPlayer) {
            const existingPlayer = players.find(p => p.id === contact.pickleGoPlayerId);
            if (existingPlayer) {
              onSelectExistingPlayer(existingPlayer);
              continue;
            }
          }
          await sendPlayerInvite(contact.pickleGoPlayerId!);
        } catch (error) {
          console.error(`Error sending invite to ${contact.name}:`, error);
        }
      }

      if (notOnPickleGo.length > 0) {
        if (isAddMatch && currentUser) {
          for (const contact of notOnPickleGo) {
            try {
              const placeholder = await addPlayer({
                name: contact.name,
                pendingClaim: true,
                invitedBy: currentUser.id,
                isInvited: true,
              } as any);
              if (onPlaceholderCreated) {
                onPlaceholderCreated(placeholder);
              }
            } catch {
              // Placeholder creation is best-effort in addMatch context
            }
          }
        }

        const { inviteId } = await invitePlayersBySMS(
          notOnPickleGo.map(c => ({ phone: c.phone, name: c.name })),
        );

        const deepLink = `picklego://invite/${inviteId}`;
        const message = `Hey! I'm using PickleGo to track our pickleball matches. Join me and let's play! ${deepLink}`;

        const phones = notOnPickleGo.map(c => {
          const p = c.phone;
          if (p.length === 11 && p.startsWith('1')) return `+${p}`;
          return p;
        });

        const canSend = await SMS.isAvailableAsync();
        if (canSend) {
          await SMS.sendSMSAsync(phones, message);
        } else {
          Alert.alert('SMS Not Available', 'SMS is not available on this device.');
        }
      }

      if (!isAddMatch) {
        Alert.alert(
          'Invites Sent',
          `${onPickleGo.length > 0 ? `${onPickleGo.length} in-app invite(s) sent. ` : ''}${notOnPickleGo.length > 0 ? `${notOnPickleGo.length} SMS invite(s) queued.` : ''}`,
        );
      }

      setSelectedContacts(new Set());
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

    if (hasEmail && !emailRegex.test(inviteEmail)) {
      Alert.alert('Error', 'Please enter a valid email address.');
      return;
    }

    const clearAndClose = () => {
      setInviteName('');
      setInviteEmail('');
      setShowManualForm(false);
      onClose();
    };

    // If no email (addMatch context allows this) — create a local placeholder
    if (!hasEmail) {
      if (!isAddMatch) {
        Alert.alert('Error', 'Please enter an email address.');
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

    // Has email — use the invite flow
    const result = await invitePlayer(inviteName.trim(), inviteEmail.trim());

    switch (result.type) {
      case 'invited':
        if (isAddMatch && result.player && onPlaceholderCreated) {
          onPlaceholderCreated(result.player);
        }
        Alert.alert(
          'Success',
          `${inviteName} has been invited. They can join the app using this email address.`,
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
  };

  const handleClose = () => {
    setSelectedContacts(new Set());
    setSearchQuery('');
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
    const isSelected = selectedContacts.has(item.phone);
    const initials = item.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    return (
      <AnimatedPressable
        style={[styles.contactItem, isSelected && styles.contactItemSelected]}
        onPress={() => toggleContact(item.phone)}
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
    if (!hasRequestedContacts && !permissionDenied && contactsList.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Icon name="users" size={40} color={colors.primary} />
          <Text style={styles.emptyStateTitle}>Find friends on PickleGo</Text>
          <Text style={styles.emptyStateText}>
            Access your contacts to find friends already on PickleGo and invite others to play.
          </Text>
          <AnimatedPressable style={styles.allowContactsButton} onPress={handleAllowContacts}>
            <Icon name="book-user" size={16} color={colors.white} />
            <Text style={styles.allowContactsButtonText}>Allow Contact Access</Text>
          </AnimatedPressable>
        </View>
      );
    }

    if (permissionDenied) {
      return (
        <View style={styles.emptyState}>
          <Icon name="book-user" size={40} color={colors.gray400} />
          <Text style={styles.emptyStateTitle}>Contacts Access Required</Text>
          <Text style={styles.emptyStateText}>
            Allow PickleGo to access your contacts to invite friends. You can enable this in Settings.
          </Text>
          <AnimatedPressable style={styles.retryButton} onPress={loadContacts}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </AnimatedPressable>
        </View>
      );
    }

    if (loadingContacts) {
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
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
          />
        </View>

        <FlatList
          data={filteredContacts}
          keyExtractor={item => item.phone}
          renderItem={renderContactItem}
          style={styles.contactList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {searchQuery ? 'No contacts match your search' : 'No contacts with phone numbers found'}
              </Text>
            </View>
          }
        />

        {selectedContacts.size > 0 && (
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
                  {`Send ${selectedContacts.size} Invite${selectedContacts.size > 1 ? 's' : ''}`}
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
            {isAddMatch ? 'Add by name / email' : 'Add by email'}
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
            <Text style={styles.inputLabel}>
              {isAddMatch ? 'Email Address (optional)' : 'Email Address'}
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
      {renderContactsSection()}
      {renderManualForm()}
    </View>
  );

  // ==================== RENDER: Modal ====================

  const title = isAddMatch
    ? (teamLabel || 'Add Player')
    : 'Invite Players';

  const content = (
    <View style={renderAsScreen ? styles.screenContent : styles.modalContent}>
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
    </View>
  );

  // When used as a navigation screen, skip the Modal wrapper
  if (renderAsScreen) {
    return content;
  }

  return (
    <DismissableModal
      visible={visible}
      onClose={handleClose}
      overlayStyle={styles.modalOverlay}
    >
      {content}
    </DismissableModal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.backdrop,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.lg,
  },
  screenContent: {
    flex: 1,
    backgroundColor: colors.white,
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.lg,
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
    paddingHorizontal: spacing.lg,
  },
  playerList: {
    maxHeight: 400,
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
    paddingHorizontal: spacing.lg,
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
    flexGrow: 1,
    maxHeight: 300,
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
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
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
