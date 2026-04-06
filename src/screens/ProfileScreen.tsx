import React, { useState } from 'react';
import { isValidEmail } from '../utils/validation';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TextInput,
  Alert,
} from 'react-native';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Icon } from '../components/Icon';
import Layout from '../components/Layout';
import { useData } from '../context/DataContext';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, Player } from '../types';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { Section } from '../components/Section';
import { useToast } from '../context/ToastContext';
import { useProfilePicture } from '../hooks/useProfilePicture';
import Animated from 'react-native-reanimated';
import { useFadeIn } from '../hooks';

const ProfileSetupView = () => {
  const { addPlayer, setCurrentUser } = useData();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rating, setRating] = useState('3.5');

  const handleCreateProfile = async () => {
    // Validate fields
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }

    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }

    if (!isValidEmail(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (!password.trim()) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    const ratingNum = parseFloat(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      Alert.alert('Error', 'Rating must be between 1.0 and 5.0');
      return;
    }

    try {
      await addPlayer({
        name: name.trim(),
        email: email.trim(),
        password: password,
        rating: ratingNum,
        stats: {
          totalMatches: 0,
          wins: 0,
          losses: 0,
          winPercentage: 0,
          totalGames: 0,
          gameWins: 0,
          gameLosses: 0
        }
      });

      // Navigate back to home after creating profile
      Alert.alert(
        'Profile Created',
        'Your profile has been created successfully!',
        [
          {
            text: 'Continue',
            onPress: () => navigation.navigate('MainTabs', { screen: 'Home' })
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to create profile');
    }
  };

  return (
    <View style={styles.setupContainer}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.setupContent}>
          <Image
            source={require('../assets/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.setupTitle}>Create Your Account</Text>
          <Text style={styles.setupSubtitle}>
            Set up your profile to get started with PickleGo.
          </Text>

          <View style={styles.setupForm}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter your name"
                returnKeyType="next"
                autoFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Enter your email"
                returnKeyType="next"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Create a password"
                returnKeyType="next"
                secureTextEntry
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm your password"
                returnKeyType="next"
                secureTextEntry
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Your Skill Rating (1.0-5.0)</Text>
              <TextInput
                style={styles.input}
                value={rating}
                onChangeText={setRating}
                placeholder="3.5"
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>

            <AnimatedPressable
              style={styles.setupButton}
              onPress={handleCreateProfile}
            >
              <Text style={styles.setupButtonText}>Create Account</Text>
            </AnimatedPressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const ProfileScreen = () => {
  const fadeStyle = useFadeIn();
  const { currentUser, updatePlayer, isEmailAvailable } = useData();
  const { showToast } = useToast();
  const { pickAndUploadImage, uploading } = useProfilePicture({
    playerId: currentUser?.id,
    onUpdate: updatePlayer,
    onSuccess: () => showToast('Profile picture updated successfully', 'success'),
    onError: () => Alert.alert('Error', 'Failed to update profile picture'),
  });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentUser?.name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [phoneNumber, setPhoneNumber] = useState(currentUser?.phoneNumber || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rating, setRating] = useState(currentUser?.rating?.toString() || '3.5');
  const [showPasswordFields, setShowPasswordFields] = useState(false);

  // If no user exists, show the profile setup view
  if (!currentUser) {
    return <ProfileSetupView />;
  }

  // Start editing profile
  const handleEditProfile = () => {
    setName(currentUser?.name || '');
    setEmail(currentUser?.email || '');
    setPhoneNumber(currentUser?.phoneNumber || '');
    setPassword('');
    setConfirmPassword('');
    setRating(currentUser?.rating?.toString() || '3.5');
    setShowPasswordFields(false);
    setEditing(true);
  };

  // Validate phone number format
  const isValidPhoneNumber = (phone: string) => {
    // Allow empty phone number
    if (!phone) return true;

    // Basic validation for phone numbers
    const phoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
    return phoneRegex.test(phone);
  };

  // Save profile changes
  const handleSaveProfile = async () => {
    if (!currentUser) return;

    // Basic validation
    if (!name.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }

    if (email && email !== currentUser.email) {
      if (!isValidEmail(email)) {
        Alert.alert('Error', 'Please enter a valid email address');
        return;
      }

      const isAvailable = await isEmailAvailable(email);
      if (!isAvailable) {
        Alert.alert('Error', 'Email is already in use by another account');
        return;
      }
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      Alert.alert('Error', 'Please enter a valid phone number or leave it empty');
      return;
    }

    // Password validation
    if (showPasswordFields) {
      if (password.length < 6) {
        Alert.alert('Error', 'Password must be at least 6 characters');
        return;
      }

      if (password !== confirmPassword) {
        Alert.alert('Error', 'Passwords do not match');
        return;
      }
    }

    const ratingNum = parseFloat(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      Alert.alert('Error', 'Rating must be between 1.0 and 5.0');
      return;
    }

    try {
      const updates: Partial<Player> = {
        name: name.trim(),
        email: email.trim(),
        phoneNumber: phoneNumber.trim(),
        rating: ratingNum
      };

      if (showPasswordFields && password) {
        updates.password = password;
      }

      await updatePlayer(currentUser.id, updates);
      setEditing(false);
      showToast('Profile updated successfully', 'success');
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    }
  };

  const renderStats = () => {
    if (!currentUser?.stats) {
      return (
        <View style={styles.statsContainer}>
          <Text style={styles.noStatsText}>No stats available yet</Text>
        </View>
      );
    }

    const stats = currentUser.stats;
    const winPercentage = stats.totalMatches > 0
      ? ((stats.wins / stats.totalMatches) * 100).toFixed(1)
      : '0.0';

    return (
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Total Matches</Text>
          <Text style={styles.statValue}>{stats.totalMatches}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Wins</Text>
          <Text style={styles.statValue}>{stats.wins}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Losses</Text>
          <Text style={styles.statValue}>{stats.losses}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Win Rate</Text>
          <Text style={styles.statValue}>{winPercentage}%</Text>
        </View>
      </View>
    );
  };

  return (
    <Layout title="Profile">
      <Animated.View style={[{ flex: 1 }, fadeStyle]}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.profileSection}>
          {/* Profile Picture */}
          <AnimatedPressable style={[styles.profilePicContainer, uploading && { opacity: 0.6 }]} onPress={pickAndUploadImage} disabled={uploading}>
            {currentUser.profilePic ? (
              <Image
                source={{ uri: currentUser.profilePic }}
                style={styles.profilePic}
              />
            ) : (
              <View style={styles.profilePicPlaceholder}>
                <Icon name="user" size={60} color={colors.primary} />
              </View>
            )}
            <View style={styles.editPicButton}>
              <Icon name="camera" size={16} color={colors.white} />
            </View>
          </AnimatedPressable>

          {editing ? (
            // Edit mode
            <View style={styles.formContainer}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your name"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Your email address"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  placeholder="Your phone number"
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Player Rating</Text>
                <TextInput
                  style={styles.input}
                  value={rating}
                  onChangeText={setRating}
                  placeholder="Rating (1.0-5.0)"
                  keyboardType="decimal-pad"
                />
              </View>

              {!showPasswordFields ? (
                <AnimatedPressable
                  style={styles.passwordToggle}
                  onPress={() => setShowPasswordFields(true)}
                >
                  <Text style={styles.passwordToggleText}>Change Password</Text>
                </AnimatedPressable>
              ) : (
                <>
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>New Password</Text>
                    <TextInput
                      style={styles.input}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="Enter new password"
                      secureTextEntry
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Confirm Password</Text>
                    <TextInput
                      style={styles.input}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Confirm new password"
                      secureTextEntry
                    />
                  </View>

                  <AnimatedPressable
                    style={styles.passwordToggle}
                    onPress={() => setShowPasswordFields(false)}
                  >
                    <Text style={styles.passwordToggleText}>Cancel Password Change</Text>
                  </AnimatedPressable>
                </>
              )}

              <View style={styles.buttonRow}>
                <AnimatedPressable
                  style={[styles.button, styles.cancelButton]}
                  onPress={() => setEditing(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  style={[styles.button, styles.saveButton]}
                  onPress={handleSaveProfile}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </AnimatedPressable>
              </View>
            </View>
          ) : (
            // View mode
            <View style={styles.infoContainer}>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Name</Text>
                <Text style={styles.infoValue}>{currentUser.name}</Text>
              </View>

              {currentUser.email && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue}>{currentUser.email}</Text>
                </View>
              )}

              {currentUser.phoneNumber && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Phone</Text>
                  <Text style={styles.infoValue}>{currentUser.phoneNumber}</Text>
                </View>
              )}

              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Rating</Text>
                <View style={styles.ratingContainer}>
                  <Icon name="star" size={18} color={colors.action} />
                  <Text style={styles.ratingText}>
                    {currentUser.rating ? currentUser.rating.toFixed(1) : "3.5"}
                  </Text>
                </View>
              </View>

              <AnimatedPressable
                style={styles.editButton}
                onPress={handleEditProfile}
              >
                <Icon name="pencil" size={18} color={colors.white} />
                <Text style={styles.editButtonText}>Edit Profile</Text>
              </AnimatedPressable>
            </View>
          )}
        </View>

        <Section title="Player Statistics" card={false} style={styles.statsSection}>
          {renderStats()}
        </Section>
      </ScrollView>
      </Animated.View>
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
    alignItems: 'center',
  },
  profilePicContainer: {
    position: 'relative',
    marginBottom: spacing.xl,
  },
  profilePic: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  profilePicPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editPicButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.secondary,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.white,
  },
  formContainer: {
    padding: spacing.lg,
  },
  inputGroup: {
    marginBottom: spacing.xl,
  },
  inputLabel: {
    ...typography.label,
    color: colors.neutral,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    ...typography.bodyLarge,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.xs,
  },
  saveButton: {
    backgroundColor: colors.secondary,
  },
  saveButtonText: {
    ...typography.button,
    color: colors.white,
  },
  cancelButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  cancelButtonText: {
    ...typography.button,
    color: colors.neutral,
  },
  passwordToggle: {
    alignItems: 'center',
    padding: spacing.sm,
    marginBottom: spacing.lg,
  },
  passwordToggleText: {
    ...typography.bodyLarge,
    color: colors.secondary,
    fontWeight: '500',
  },
  infoContainer: {
    padding: spacing.lg,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  infoLabel: {
    ...typography.bodyLarge,
    color: colors.gray500,
  },
  infoValue: {
    ...typography.bodyLarge,
    fontWeight: '500',
    color: colors.neutral,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    ...typography.bodyLarge,
    fontWeight: '500',
    marginLeft: spacing.xs,
    color: colors.neutral,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  editButtonText: {
    ...typography.button,
    color: colors.white,
    marginLeft: spacing.sm,
  },
  statsSection: {
    backgroundColor: colors.white,
    margin: spacing.lg,
    padding: spacing.xl,
    borderRadius: borderRadius.md,
    ...shadows.md,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statItem: {
    width: '48%',
    backgroundColor: colors.gray100,
    padding: spacing.lg,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  statValue: {
    ...typography.stats,
    color: colors.secondary,
    marginBottom: spacing.sm,
  },
  statLabel: {
    ...typography.bodySmall,
    color: colors.gray500,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    ...typography.h3,
    fontSize: 18,
    color: colors.error,
    textAlign: 'center',
  },
  setupContainer: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    flexGrow: 1,
    paddingVertical: spacing.xxxxl,
    paddingHorizontal: spacing.xxl,
    justifyContent: 'center',
  },
  setupContent: {
    backgroundColor: colors.white,
    padding: spacing.xxl,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    ...shadows.lg,
  },
  logoImage: {
    width: 120,
    height: 120,
    marginBottom: spacing.lg,
  },
  setupTitle: {
    ...typography.h1,
    fontSize: 28,
    color: colors.primary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  setupSubtitle: {
    ...typography.bodyLarge,
    color: colors.gray500,
    textAlign: 'center',
    marginBottom: spacing.xxl,
    lineHeight: 22,
  },
  setupForm: {
    width: '100%',
    paddingHorizontal: spacing.sm,
  },
  setupButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xxl,
    marginBottom: spacing.lg,
  },
  setupButtonText: {
    ...typography.button,
    color: colors.white,
    fontSize: 18,
  },
  noStatsText: {
    ...typography.h3,
    fontSize: 18,
    color: colors.gray500,
    textAlign: 'center',
  },
});

export default ProfileScreen;
