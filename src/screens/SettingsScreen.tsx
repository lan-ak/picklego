import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  Alert,
  Linking,
  ActivityIndicator,
  Modal,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { useFadeIn, staggeredEntrance } from '../hooks';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Icon, IconName } from '../components/Icon';
import Layout from '../components/Layout';
import { useData } from '../context/DataContext';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { useToast } from '../context/ToastContext';
import { useProfilePicture } from '../hooks/useProfilePicture';
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
  const { currentUser, updatePlayer, signOutUser, deleteAccount } = useData();
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
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

  const handleEditProfile = useCallback(() => {
    navigation.navigate('EditProfile');
  }, [navigation]);

  const handleSignOut = useCallback(() => {
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
  }, [signOutUser]);

  const handleDeleteAccount = useCallback(() => {
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
                    setIsDeletingAccount(true);
                    try {
                      await deleteAccount();
                    } catch (error) {
                      setIsDeletingAccount(false);
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
  }, [deleteAccount]);

  const settingSections = useMemo<SettingSection[]>(() => [
    {
      title: 'Account',
      items: [
        {
          icon: 'circle-user',
          label: 'Edit Profile',
          onPress: handleEditProfile,
        },
        {
          icon: 'users',
          label: 'Players',
          onPress: () => navigation.navigate('ManagePlayers'),
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
      ],
    },
    {
      title: 'Account Actions',
      items: [
        {
          icon: 'log-out',
          label: 'Sign Out',
          onPress: handleSignOut,
          danger: true
        },
        {
          icon: 'trash',
          label: 'Delete Account',
          onPress: handleDeleteAccount,
          danger: true,
        },
      ]
    }
  ], [handleEditProfile, handleSignOut, handleDeleteAccount, navigation]);

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

      {/* Deleting account overlay */}
      <Modal visible={isDeletingAccount} transparent animationType="fade">
        <View style={styles.deletingOverlay}>
          <View style={styles.deletingCard}>
            <ActivityIndicator size="large" color={colors.error} />
            <Text style={styles.deletingText}>Deleting account...</Text>
          </View>
        </View>
      </Modal>
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
  deletingOverlay: {
    flex: 1,
    backgroundColor: colors.backdrop,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deletingCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.xxxl,
    alignItems: 'center',
    ...shadows.md,
  },
  deletingText: {
    ...typography.bodyLarge,
    color: colors.neutral,
    marginTop: spacing.lg,
  },
});

export default SettingsScreen;
