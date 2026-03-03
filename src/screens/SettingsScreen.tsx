import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  Modal,
  Platform,
  FlatList,
  Linking,
} from 'react-native';
import { Icon, IconName } from '../components/Icon';
import Layout from '../components/Layout';
import { useData } from '../context/DataContext';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, Player } from '../types';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { useToast } from '../context/ToastContext';
import { useProfilePicture } from '../hooks/useProfilePicture';
import PicklePete from '../components/PicklePete';

type SettingItem = {
  icon: IconName;
  label: string;
  onPress?: () => void;
  danger?: boolean;
};

type SettingSection = {
  title: string;
  items: SettingItem[];
};

type SettingsScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const SettingsScreen: React.FC = () => {
  const { currentUser, updatePlayer, invitePlayer, getInvitedPlayers, players, removePlayer, signOutUser } = useData();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [showInvitedPlayers, setShowInvitedPlayers] = useState(false);
  const [showManagePlayers, setShowManagePlayers] = useState(false);
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const { showToast } = useToast();
  const { pickAndUploadImage, uploading } = useProfilePicture({
    playerId: currentUser?.id,
    onUpdate: updatePlayer,
    onSuccess: () => showToast('Profile picture updated successfully', 'success'),
    onError: () => Alert.alert('Error', 'Failed to update profile picture'),
  });

  const handleEditProfile = () => {
    navigation.navigate('EditProfile');
  };

  // Handle player invitation
  const handleInvitePlayer = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) {
      Alert.alert('Error', 'Please enter both name and email for the player.');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
      Alert.alert('Error', 'Please enter a valid email address.');
      return;
    }

    const result = await invitePlayer(inviteName.trim(), inviteEmail.trim());

    const clearAndClose = () => {
      setInviteName('');
      setInviteEmail('');
      setShowInviteModal(false);
    };

    switch (result.type) {
      case 'invited':
        Alert.alert(
          'Success',
          `${inviteName} has been invited. They can now join the app using this email address.`,
          [{ text: 'OK', onPress: clearAndClose }]
        );
        break;
      case 'invite_sent':
        Alert.alert(
          'Player Invite Sent',
          `${result.player?.name || inviteName} is already on PickleGo! A player invite has been sent.`,
          [{ text: 'OK', onPress: clearAndClose }]
        );
        break;
      case 'already_connected':
        Alert.alert(
          'Already Connected',
          `You're already connected with ${result.player?.name || inviteName}.`,
          [{ text: 'OK' }]
        );
        break;
      case 'request_pending':
        Alert.alert(
          'Invite Pending',
          `A player invite to ${result.player?.name || inviteName} is already pending.`,
          [{ text: 'OK' }]
        );
        break;
      default:
        Alert.alert('Error', 'There was an error sending the invitation. Please try again.');
        break;
    }
  };

  // Get invited players
  const invitedPlayers = getInvitedPlayers();

  // Handle player removal
  const handleRemovePlayer = (player: Player) => {
    Alert.alert(
      'Remove Player',
      `Are you sure you want to remove ${player.name} from your contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const success = await removePlayer(player.id);
            if (success) {
              showToast(`${player.name} has been removed from your contacts.`, 'success');
            } else {
              Alert.alert('Error', 'Failed to remove player. You cannot remove yourself.');
            }
          }
        }
      ]
    );
  };

  const settingSections: SettingSection[] = [
    {
      title: 'Account',
      items: [
        {
          icon: 'circle-user',
          label: 'Edit Profile',
          onPress: handleEditProfile,
        },
        {
          icon: 'mail',
          label: 'Invite Players',
          onPress: () => setShowInviteModal(true),
        },
        {
          icon: 'users',
          label: 'Manage Players',
          onPress: () => setShowManagePlayers(true),
        },
        {
          icon: 'user-plus',
          label: 'View Invited Players',
          onPress: () => setShowInvitedPlayers(true),
        },
      ],
    },
    {
      title: 'Preferences',
      items: [
        {
          icon: 'bell',
          label: 'Notifications',
          onPress: () => navigation.navigate('Notifications'),
        },
        {
          icon: 'palette',
          label: 'Appearance',
          onPress: () => Alert.alert('Coming Soon', 'Appearance settings will be available in a future update.')
        },
      ],
    },
    {
      title: 'Account Actions',
      items: [
        {
          icon: 'log-out',
          label: 'Sign Out',
          onPress: async () => {
            Alert.alert(
              'Sign Out',
              'Are you sure you want to sign out?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Sign Out',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await signOutUser();
                    } catch (error) {
                      Alert.alert('Error', 'Failed to sign out. Please try again.');
                    }
                  }
                }
              ]
            );
          },
          danger: true
        }
      ]
    }
  ];

  // Invite Player Modal
  const renderInvitePlayerModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={showInviteModal}
      onRequestClose={() => setShowInviteModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Invite Player</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowInviteModal(false)}
            >
              <Icon name="x" size={24} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <PicklePete pose="invite" size="sm" message="Invite someone to play!" />

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
            <Text style={styles.inputLabel}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="Enter player's email"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity
            style={{
              backgroundColor: colors.primary,
              borderRadius: borderRadius.sm,
              padding: 15,
              alignItems: 'center',
              marginTop: 10
            }}
            onPress={handleInvitePlayer}
          >
            <Text style={{ ...typography.button, color: colors.white }}>Send Invitation</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // Invited Players Modal
  const renderInvitedPlayersModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={showInvitedPlayers}
      onRequestClose={() => setShowInvitedPlayers(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Invited Players</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowInvitedPlayers(false)}
            >
              <Icon name="x" size={24} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {invitedPlayers.length > 0 ? (
            <FlatList
              data={invitedPlayers}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.invitedPlayerItem}>
                  <View style={styles.invitedPlayerInfo}>
                    <Text style={styles.invitedPlayerName}>{item.name}</Text>
                    <Text style={styles.invitedPlayerEmail}>{item.email}</Text>
                  </View>
                  <View style={styles.invitedPlayerStatus}>
                    <Text style={styles.pendingText}>
                      {item.pendingClaim ? 'Pending' : 'Claimed'}
                    </Text>
                  </View>
                </View>
              )}
            />
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                You haven't invited any players yet
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );

  // Render the manage players modal
  const renderManagePlayersModal = () => {
    // Filter out the current user from the list
    const otherPlayers = players.filter(player => !currentUser || player.id !== currentUser.id);

    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={showManagePlayers}
        onRequestClose={() => setShowManagePlayers(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage Players</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowManagePlayers(false)}
              >
                <Icon name="x" size={24} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {otherPlayers.length > 0 ? (
              <FlatList
                data={otherPlayers}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={styles.playerListItem}>
                    <View style={styles.playerInfo}>
                      {item.profilePic ? (
                        <Image source={{ uri: item.profilePic }} style={styles.playerAvatar} />
                      ) : (
                        <View style={styles.playerAvatarPlaceholder}>
                          <Text style={styles.playerAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <View>
                        <Text style={styles.playerName}>{item.name}</Text>
                        {item.email && <Text style={styles.playerEmail}>{item.email}</Text>}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.removePlayerButton}
                      onPress={() => handleRemovePlayer(item)}
                    >
                      <Icon name="trash" size={20} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                )}
                contentContainerStyle={styles.playerList}
              />
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No other players in your contacts</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <Layout title="Settings" isInTabNavigator={true}>
      <ScrollView style={styles.container}>
        {/* Profile Section */}
        <View style={styles.profileSection}>
          <TouchableOpacity
            style={[styles.profilePicContainer, uploading && { opacity: 0.6 }]}
            onPress={pickAndUploadImage}
            disabled={uploading}
            accessibilityLabel="Change profile picture"
            accessibilityRole="button"
          >
            {currentUser?.profilePic ? (
              <Image
                source={{ uri: currentUser.profilePic }}
                style={styles.profilePic}
              />
            ) : (
              <View style={styles.profilePicPlaceholder}>
                <Icon name="user" size={40} color={colors.gray500} />
              </View>
            )}
            <View style={styles.editProfilePicButton}>
              <Icon name="camera" size={16} color={colors.white} />
            </View>
          </TouchableOpacity>

          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{currentUser?.name || 'Player'}</Text>
            <View style={styles.ratingContainer}>
              <Icon name="star" size={18} color={colors.action} />
              <Text style={styles.ratingText}>{currentUser?.rating?.toFixed(1) || '3.5'}</Text>
            </View>

            <TouchableOpacity
              style={styles.editProfileButton}
              onPress={handleEditProfile}
              accessibilityLabel="Edit profile"
              accessibilityRole="button"
            >
              <Text style={styles.editProfileButtonText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Settings Options */}
        {settingSections.map((section, index) => (
          <View key={index} style={styles.settingSection}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item, itemIndex) => (
              <TouchableOpacity
                key={itemIndex}
                style={styles.settingItem}
                onPress={item.onPress}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <View style={styles.settingItemLeft}>
                  <Icon
                    name={item.icon}
                    size={24}
                    color={item.danger ? colors.error : colors.primary}
                  />
                  <Text
                    style={[
                      styles.settingItemText,
                      item.danger && styles.dangerText,
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>
                <Icon name="chevron-right" size={20} color={colors.gray300} />
              </TouchableOpacity>
            ))}
          </View>
        ))}

        {/* Render modals */}
        {renderInvitePlayerModal()}
        {renderInvitedPlayersModal()}
        {renderManagePlayersModal()}

        {/* Footer links */}
        <View style={styles.footerLinks}>
          <View style={styles.footerRow}>
            <Text
              style={styles.footerLink}
              onPress={() => Linking.openURL('https://playpicklego.com/privacy.html')}
            >
              Privacy Policy
            </Text>
            <Text style={styles.footerDot}>&middot;</Text>
            <Text
              style={styles.footerLink}
              onPress={() => Linking.openURL('https://playpicklego.com/terms.html')}
            >
              Terms of Service
            </Text>
          </View>
          <Text
            style={styles.footerLink}
            onPress={() => Linking.openURL('mailto:hi@playpicklego.com')}
          >
            hi@playpicklego.com
          </Text>
          <Text style={styles.footerVersion}>v1.0.0</Text>
        </View>
      </ScrollView>
    </Layout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  profileSection: {
    backgroundColor: colors.white,
    margin: spacing.lg,
    padding: spacing.xl,
    borderRadius: borderRadius.md,
    ...shadows.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  profilePicContainer: {
    position: 'relative',
  },
  profilePic: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  profilePicPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editProfilePicButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.primary,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  profileName: {
    ...typography.h3,
    color: colors.neutral,
    marginBottom: spacing.xs,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  ratingText: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.gray500,
    marginLeft: spacing.xs,
  },
  editProfileButton: {
    backgroundColor: colors.primaryOverlay,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.xl,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  editProfileButtonText: {
    ...typography.label,
    color: colors.primary,
    fontWeight: '600',
  },
  settingSection: {
    backgroundColor: colors.white,
    margin: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    ...shadows.md,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.gray500,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingItemText: {
    ...typography.bodyLarge,
    marginLeft: spacing.md,
    color: colors.neutral,
  },
  dangerText: {
    color: colors.error,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.backdrop,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxxxl,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    width: '85%',
    maxWidth: 360,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  closeButton: {
    padding: spacing.xs,
  },
  modalDescription: {
    ...typography.bodyLarge,
    color: colors.gray500,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  inviteButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  inviteButtonText: {
    ...typography.button,
    color: colors.white,
  },
  invitedPlayersList: {
    maxHeight: 300,
  },
  invitedPlayerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  invitedPlayerInfo: {
    flex: 1,
  },
  invitedPlayerName: {
    ...typography.bodyLarge,
    fontWeight: '500',
    color: colors.neutral,
  },
  invitedPlayerEmail: {
    ...typography.bodySmall,
    color: colors.gray500,
    marginTop: 2,
  },
  invitedPlayerStatus: {
    fontSize: 14,
    fontWeight: '500',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  pendingStatus: {
    backgroundColor: colors.actionOverlay,
    color: colors.warning,
  },
  claimedStatus: {
    backgroundColor: colors.primaryOverlay,
    color: colors.primary,
  },
  noInvitesText: {
    ...typography.bodyLarge,
    color: colors.gray500,
    textAlign: 'center',
    padding: spacing.xl,
  },
  playerList: {
    paddingBottom: spacing.xl,
  },
  playerListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  playerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: spacing.md,
  },
  playerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  playerAvatarText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  playerName: {
    ...typography.bodyLarge,
    fontWeight: '500',
    color: colors.neutral,
  },
  playerEmail: {
    ...typography.bodySmall,
    color: colors.gray500,
  },
  removePlayerButton: {
    padding: spacing.sm,
  },
  emptyState: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    ...typography.bodyLarge,
    color: colors.gray500,
    textAlign: 'center',
  },
  modalTitle: {
    ...typography.h3,
    color: colors.primary,
  },
  inputContainer: {
    marginBottom: spacing.sm,
  },
  inputLabel: {
    ...typography.label,
    color: colors.neutral,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    fontSize: 13,
  },
  pendingText: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.warning,
  },
  footerLinks: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingBottom: spacing.xxxxl,
    gap: spacing.sm,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  footerLink: {
    ...typography.bodySmall,
    color: colors.gray400,
  },
  footerDot: {
    ...typography.bodySmall,
    color: colors.gray400,
  },
  footerVersion: {
    ...typography.caption,
    color: colors.gray300,
    marginTop: spacing.xs,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveButtonText: {
    ...typography.button,
    color: colors.white,
  },
});

export default SettingsScreen;
