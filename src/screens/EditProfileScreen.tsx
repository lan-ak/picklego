import React, { useState, useEffect } from 'react';
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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, Player } from '../types';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { useToast } from '../context/ToastContext';
import { useProfilePicture } from '../hooks/useProfilePicture';
import Animated from 'react-native-reanimated';
import { useFadeIn } from '../hooks';

type EditProfileScreenRouteProp = RouteProp<RootStackParamList, 'EditProfile'>;
type EditProfileScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const EditProfileScreen: React.FC = () => {
  const fadeStyle = useFadeIn();
  const { currentUser, updatePlayer } = useData();
  const navigation = useNavigation<EditProfileScreenNavigationProp>();
  const route = useRoute<EditProfileScreenRouteProp>();
  const { showToast } = useToast();
  const { pickAndUploadImage, uploading } = useProfilePicture({
    playerId: currentUser?.id,
    onUpdate: updatePlayer,
    onSuccess: () => showToast('Profile picture updated successfully', 'success'),
    onError: () => Alert.alert('Error', 'Failed to update profile picture'),
  });

  const [tempName, setTempName] = useState('');
  const [tempRating, setTempRating] = useState('');
  const [tempEmail, setTempEmail] = useState('');
  const [tempPhone, setTempPhone] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [tempConfirmPassword, setTempConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Initialize form with current user data
    if (currentUser) {
      setTempName(currentUser.name || '');
      setTempRating(currentUser.rating?.toString() || '3.5');
      setTempEmail(currentUser.email || '');
      setTempPhone(currentUser.phoneNumber || '');
    }
  }, [currentUser]);

  const handleSaveProfile = async () => {
    if (!currentUser) return;

    if (!tempName.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }

    const rating = parseFloat(tempRating);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      Alert.alert('Error', 'Rating must be between 1.0 and 5.0');
      return;
    }

    // Email validation
    if (tempEmail && tempEmail.trim()) {
      if (!isValidEmail(tempEmail)) {
        Alert.alert('Error', 'Please enter a valid email address');
        return;
      }
    }

    // Phone validation
    if (tempPhone && tempPhone.trim()) {
      const phoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
      if (!phoneRegex.test(tempPhone.trim())) {
        Alert.alert('Error', 'Please enter a valid phone number');
        return;
      }
    }

    // Password validation
    if (tempPassword) {
      if (tempPassword.length < 6) {
        Alert.alert('Error', 'Password must be at least 6 characters');
        return;
      }

      if (tempPassword !== tempConfirmPassword) {
        Alert.alert('Error', 'Passwords do not match');
        return;
      }
    }

    try {
      const updates: Partial<Player> = {
        name: tempName,
        rating: rating
      };

      if (tempEmail) updates.email = tempEmail;
      if (tempPhone) updates.phoneNumber = tempPhone;
      if (tempPassword) updates.password = tempPassword;

      await updatePlayer(currentUser.id, updates);
      showToast('Profile updated successfully', 'success');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    }
  };

  return (
    <Layout title="Edit Profile">
      <Animated.View style={[{ flex: 1 }, fadeStyle]}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.profilePicEditContainer}>
          {currentUser?.profilePic ? (
            <Image
              source={{ uri: currentUser.profilePic }}
              style={styles.profilePicLarge}
            />
          ) : (
            <View style={styles.profilePicPlaceholderLarge}>
              <Icon name="user" size={50} color={colors.gray500} />
            </View>
          )}
          <AnimatedPressable
            style={[styles.changePhotoButton, uploading && { opacity: 0.6 }]}
            onPress={pickAndUploadImage}
            disabled={uploading}
            accessibilityLabel="Change profile photo"
            accessibilityRole="button"
            accessibilityHint="Opens the photo library to select a new profile picture"
          >
            <Icon name="camera" size={18} color={colors.white} />
            <Text style={styles.changePhotoText}>{uploading ? 'Uploading...' : 'Change Photo'}</Text>
          </AnimatedPressable>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>Personal Information</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={tempName}
                onChangeText={setTempName}
                placeholder="Your name"
                accessibilityLabel="Name"
                accessibilityHint="Enter your display name"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={tempEmail}
                onChangeText={setTempEmail}
                placeholder="Your email address"
                keyboardType="email-address"
                autoCapitalize="none"
                accessibilityLabel="Email address"
                accessibilityHint="Enter your email address"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput
                style={styles.input}
                value={tempPhone}
                onChangeText={setTempPhone}
                placeholder="Your phone number"
                keyboardType="phone-pad"
                accessibilityLabel="Phone number"
                accessibilityHint="Enter your phone number"
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Rating (1.0 - 5.0)</Text>
              <TextInput
                style={styles.input}
                value={tempRating}
                onChangeText={setTempRating}
                placeholder="Your rating"
                keyboardType="decimal-pad"
                accessibilityLabel="Player rating"
                accessibilityHint="Enter your skill rating between 1.0 and 5.0"
              />
            </View>
          </View>

          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>Change Password</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>New Password</Text>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={tempPassword}
                  onChangeText={setTempPassword}
                  placeholder="Enter new password"
                  secureTextEntry={!showPassword}
                  accessibilityLabel="New password"
                  accessibilityHint="Enter a new password, minimum 6 characters"
                />
                <AnimatedPressable
                  style={styles.passwordVisibilityButton}
                  onPress={() => setShowPassword(!showPassword)}
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  accessibilityRole="button"
                >
                  <Icon
                    name={showPassword ? "eye-off" : "eye"}
                    size={24}
                    color={colors.gray500}
                  />
                </AnimatedPressable>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                value={tempConfirmPassword}
                onChangeText={setTempConfirmPassword}
                placeholder="Confirm new password"
                secureTextEntry={!showPassword}
                accessibilityLabel="Confirm new password"
                accessibilityHint="Re-enter your new password to confirm"
              />
            </View>

            <Text style={styles.passwordHint}>
              Leave password fields empty if you don't want to change it
            </Text>
          </View>
        </View>

        <AnimatedPressable
          style={styles.saveButton}
          onPress={handleSaveProfile}
          accessibilityLabel="Save profile changes"
          accessibilityRole="button"
          accessibilityHint="Saves all profile changes and returns to the previous screen"
        >
          <Text style={styles.saveButtonText}>Save Changes</Text>
        </AnimatedPressable>
      </ScrollView>
      </Animated.View>
    </Layout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  profilePicEditContainer: {
    alignItems: 'center',
    marginVertical: spacing.xxl,
  },
  profilePicLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: spacing.lg,
  },
  profilePicPlaceholderLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  changePhotoButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.xl,
  },
  changePhotoText: {
    ...typography.button,
    color: colors.white,
    fontSize: 14,
    marginLeft: spacing.sm,
  },
  formContainer: {
    paddingHorizontal: spacing.lg,
  },
  formSection: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  inputContainer: {
    marginBottom: spacing.lg,
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
    padding: spacing.md,
    ...typography.bodyLarge,
    backgroundColor: colors.white,
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.white,
  },
  passwordInput: {
    flex: 1,
    padding: spacing.md,
    ...typography.bodyLarge,
  },
  passwordVisibilityButton: {
    padding: spacing.md,
  },
  passwordHint: {
    ...typography.bodySmall,
    color: colors.gray500,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    margin: spacing.lg,
    marginTop: spacing.sm,
  },
  saveButtonText: {
    ...typography.button,
    color: colors.white,
  },
});

export default EditProfileScreen;
