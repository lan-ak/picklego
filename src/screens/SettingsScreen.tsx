import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TextInput,
  Alert,
  Platform,
  FlatList,
  Linking,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useFadeIn, staggeredEntrance } from '../hooks';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { DismissableModal } from '../components/DismissableModal';
import { Icon, IconName } from '../components/Icon';
import Layout from '../components/Layout';
import { useData } from '../context/DataContext';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, Player } from '../types';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { useToast } from '../context/ToastContext';
import { useProfilePicture } from '../hooks/useProfilePicture';
import { InvitePlayersModal } from '../components/InvitePlayersModal';
import { usePlacement } from 'expo-superwall';
import { PLACEMENTS } from '../services/superwallPlacements';

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
  const { currentUser, updatePlayer, getInvitedPlayers, players, removePlayer, signOutUser, deleteAccount } = useData();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showInvitedPlayers, setShowInvitedPlayers] = useState(false);
  const [showManagePlayers, setShowManagePlayers] = useState(false);
  const navigation = useNavigation<SettingsScreenNavigationProp>();
  const { showToast } = useToast();
  const fadeStyle = useFadeIn();
  const { pickAndUploadImage, uploading } = useProfilePicture({
    playerId: currentUser?.id,
    onUpdate: updatePlayer,
    onSuccess: () => showToast('Profile picture updated successfully', 'success'),
    onError: () => Alert.alert('Error', 'Failed to update profile picture'),
  });
  const { registerPlacement } = usePlacement();

  useEffect(() => {
    registerPlacement({ placement: PLACEMENTS.SETTINGS_OPEN });
  }, []);

  const handleEditProfile = () => {
    navigation.navigate('EditProfile');
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
          onPress: () => navigation.navigate('NotificationPreferences'),
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
        },
        {
          icon: 'trash',
          label: 'Delete Account',
          onPress: () => {
            Alert.alert(
              'Delete Account',
              'This will permanently delete your account, profile, and any unclaimed players you created. Your match history will be preserved but your name will no longer be associated with it.\n\nThis action cannot be undone.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Continue',
                  style: 'destructive',
                  onPress: () => {
                    Alert.alert(
                      'Are you absolutely sure?',
                      'Your account will be permanently deleted. This cannot be reversed.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete My Account',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await deleteAccount();
                            } catch (error) {
                              Alert.alert('Error', 'Failed to delete account. Please try again.');
                            }
                          },
                        },
                      ],
                    );
                  },
                },
              ],
            );
          },
          danger: true,
        },
      ]
    }
  ];

  // Invited Players Modal
  const renderInvitedPlayersModal = () => (
    <DismissableModal
      visible={showInvitedPlayers}
      onClose={() => setShowInvitedPlayers(false)}
      overlayStyle={styles.modalOverlay}
    >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Invited Players</Text>
            <AnimatedPressable
              style={styles.closeButton}
              onPress={() => setShowInvitedPlayers(false)}
            >
              <Icon name="x" size={24} color={colors.primary} />
            </AnimatedPressable>
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
    </DismissableModal>
  );

  // Render the manage players modal
  const renderManagePlayersModal = () => {
    // Filter out the current user from the list
    const otherPlayers = players.filter(player => !currentUser || player.id !== currentUser.id);

    return (
      <DismissableModal
        visible={showManagePlayers}
        onClose={() => setShowManagePlayers(false)}
        overlayStyle={styles.modalOverlay}
      >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Manage Players</Text>
              <AnimatedPressable
                style={styles.closeButton}
                onPress={() => setShowManagePlayers(false)}
              >
                <Icon name="x" size={24} color={colors.primary} />
              </AnimatedPressable>
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
                    <AnimatedPressable
                      style={styles.removePlayerButton}
                      onPress={() => handleRemovePlayer(item)}
                    >
                      <Icon name="trash" size={20} color={colors.error} />
                    </AnimatedPressable>
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
      </DismissableModal>
    );
  };

  return (
    <Layout title="Settings" isInTabNavigator={true}>
      <ScrollView style={styles.container}>
        <Animated.View style={fadeStyle}>
        {/* Profile Section */}
        <Animated.View entering={staggeredEntrance(0)}>
        <View style={styles.profileSection}>
          <AnimatedPressable
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
          </AnimatedPressable>

          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{currentUser?.name || 'Player'}</Text>
            <View style={styles.ratingContainer}>
              <Icon name="star" size={18} color={colors.action} />
              <Text style={styles.ratingText}>{currentUser?.rating?.toFixed(1) || '3.5'}</Text>
            </View>

            <AnimatedPressable
              style={styles.editProfileButton}
              onPress={handleEditProfile}
              accessibilityLabel="Edit profile"
              accessibilityRole="button"
            >
              <Text style={styles.editProfileButtonText}>Edit Profile</Text>
            </AnimatedPressable>
          </View>
        </View>
        </Animated.View>

        {/* Settings Options */}
        {settingSections.map((section, index) => (
          <Animated.View key={index} entering={staggeredEntrance(index + 1)}>
          <View style={styles.settingSection}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((item, itemIndex) => (
              <AnimatedPressable
                key={itemIndex}
                style={styles.settingItem}
                onPress={item.onPress ?? (() => {})}
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
              </AnimatedPressable>
            ))}
          </View>
          </Animated.View>
        ))}

        {/* Render modals */}
        <InvitePlayersModal
          visible={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          context="settings"
        />
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
        </Animated.View>
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
