import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { Icon } from '../components/Icon';
import { GoogleIcon } from '../components/GoogleIcon';
import { useData } from '../context/DataContext';
import { sendPasswordReset } from '../config/firebase';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { useToast } from '../context/ToastContext';
import PicklePete from '../components/PicklePete';
import * as AppleAuthentication from 'expo-apple-authentication';

type AuthScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const AuthScreen = () => {
  const navigation = useNavigation<AuthScreenNavigationProp>();
  const { addPlayer, setCurrentUser, signIn, signInWithSocial, completeSocialSignUp } = useData();
  const { showToast } = useToast();

  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [socialName, setSocialName] = useState('');
  const [socialProvider, setSocialProvider] = useState<'google' | 'apple'>('google');
  const [isSocialLoading, setIsSocialLoading] = useState(false);
  const [isAppleAuthAvailable, setIsAppleAuthAvailable] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setIsAppleAuthAvailable);
  }, []);

  const handleToggleMode = () => {
    setIsLogin(!isLogin);
    // Clear form fields when switching modes
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowEmailForm(false);
  };

  const handleSignUp = async () => {
    // Validate fields
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }

    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (!password) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      // Create new player with Firebase authentication
      await addPlayer({
        name: name.trim(),
        email: email.trim(),
        password: password,
      });

      // Navigate to main app
      navigation.navigate('MainTabs', { screen: 'Home' });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create account');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    setIsLoading(true);
    try {
      // Sign in with Firebase
      await signIn(email.trim(), password);

      // Navigate to main app
      navigation.navigate('MainTabs', { screen: 'Home' });
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!resetEmail.trim()) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }
    try {
      await sendPasswordReset(resetEmail.trim());
      showToast('If an account exists with this email, a password reset link has been sent.', 'success');
      setShowForgotPassword(false);
      setResetEmail('');
    } catch (error) {
      showToast('If an account exists with this email, a password reset link has been sent.', 'success');
      setShowForgotPassword(false);
      setResetEmail('');
    }
  };

  const handleSocialSignIn = async (provider: 'google' | 'apple') => {
    setIsSocialLoading(true);
    try {
      const result = await signInWithSocial(provider);
      if (result.needsName) {
        setSocialProvider(provider);
        setShowNameModal(true);
      } else {
        navigation.navigate('MainTabs', { screen: 'Home' });
      }
    } catch (error: any) {
      if (error.cancelled) return;
      showToast(error.message || `${provider} sign-in failed`, 'error');
    } finally {
      setIsSocialLoading(false);
    }
  };

  const handleNameSubmit = async () => {
    if (!socialName.trim()) {
      showToast('Please enter your name', 'error');
      return;
    }
    setIsSocialLoading(true);
    try {
      await completeSocialSignUp(socialName.trim(), socialProvider);
      setShowNameModal(false);
      setSocialName('');
      navigation.navigate('MainTabs', { screen: 'Home' });
    } catch (error: any) {
      showToast(error.message || 'Failed to complete sign-up', 'error');
    } finally {
      setIsSocialLoading(false);
    }
  };

  return (
    <>
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.logoContainer}>
          <PicklePete pose="welcome" size="xl" />
          <Text style={styles.appName}>PickleGo</Text>
          <Text style={styles.tagline}>Track your pickleball matches and stats</Text>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabButton, isLogin ? styles.activeTab : styles.inactiveTab]}
              onPress={() => setIsLogin(true)}
              accessibilityRole="tab"
              accessibilityLabel="Login"
              accessibilityState={{ selected: isLogin }}
            >
              <Text style={[styles.tabText, isLogin ? styles.activeTabText : styles.inactiveTabText]}>
                Login
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabButton, isLogin ? styles.inactiveTab : styles.activeTab]}
              onPress={() => setIsLogin(false)}
              accessibilityRole="tab"
              accessibilityLabel="Sign Up"
              accessibilityState={{ selected: !isLogin }}
            >
              <Text style={[styles.tabText, isLogin ? styles.inactiveTabText : styles.activeTabText]}>
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>

          {/* Social Sign-In Buttons */}
          <View style={styles.socialContainer}>
            {isAppleAuthAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={borderRadius.sm}
                style={styles.appleButton}
                onPress={() => handleSocialSignIn('apple')}
              />
            )}

            <TouchableOpacity
              style={styles.googleButton}
              onPress={() => handleSocialSignIn('google')}
              disabled={isSocialLoading}
              accessibilityLabel="Sign in with Google"
              accessibilityRole="button"
            >
              {isSocialLoading ? (
                <ActivityIndicator color="#1F1F1F" />
              ) : (
                <>
                  <GoogleIcon size={20} />
                  <Text style={styles.googleButtonText}>Sign in with Google</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {showEmailForm ? (
            <>
              {!isLogin && (
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Name</Text>
                  <TextInput
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    placeholder="Your full name"
                    accessibilityLabel="Full name"
                    accessibilityHint="Enter your full name"
                  />
                </View>
              )}

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Your email address"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  accessibilityLabel="Email address"
                  accessibilityHint="Enter your email address"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Password</Text>
                <View style={styles.passwordContainer}>
                  <TextInput
                    style={[styles.input, styles.passwordInput]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    secureTextEntry={!showPassword}
                    accessibilityLabel="Password"
                    accessibilityHint="Enter your password"
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowPassword(!showPassword)}
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    accessibilityRole="button"
                  >
                    <Icon
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={24}
                      color={colors.gray500}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {isLogin && !showForgotPassword && (
                <TouchableOpacity
                  style={styles.forgotPasswordButton}
                  onPress={() => setShowForgotPassword(true)}
                  accessibilityLabel="Forgot password"
                  accessibilityRole="button"
                  accessibilityHint="Opens password reset form"
                >
                  <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                </TouchableOpacity>
              )}

              {showForgotPassword && (
                <View style={styles.forgotPasswordContainer}>
                  <Text style={styles.inputLabel}>Enter your email to reset password</Text>
                  <TextInput
                    style={styles.input}
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    placeholder="Your email address"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    accessibilityLabel="Password reset email address"
                    accessibilityHint="Enter the email address to send a password reset link to"
                  />
                  <TouchableOpacity
                    style={styles.resetButton}
                    onPress={handleForgotPassword}
                    accessibilityLabel="Send reset link"
                    accessibilityRole="button"
                  >
                    <Text style={styles.resetButtonText}>Send Reset Link</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setShowForgotPassword(false);
                      setResetEmail('');
                    }}
                    accessibilityLabel="Cancel password reset"
                    accessibilityRole="button"
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}

              {!isLogin && (
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Confirm Password</Text>
                  <View style={styles.passwordContainer}>
                    <TextInput
                      style={[styles.input, styles.passwordInput]}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="Confirm your password"
                      secureTextEntry={!showPassword}
                      accessibilityLabel="Confirm password"
                      accessibilityHint="Re-enter your password to confirm"
                    />
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                onPress={isLogin ? handleLogin : handleSignUp}
                disabled={isLoading}
                accessibilityLabel={isLogin ? 'Login' : 'Create Account'}
                accessibilityRole="button"
                accessibilityState={{ disabled: isLoading }}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.submitButtonText}>
                    {isLogin ? 'Login' : 'Create Account'}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.emailButton}
              onPress={() => setShowEmailForm(true)}
              accessibilityLabel="Continue with email"
              accessibilityRole="button"
            >
              <Icon name="mail" size={20} color="#1F1F1F" />
              <Text style={styles.emailButtonText}>Continue with Email</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.toggleButton}
            onPress={handleToggleMode}
            accessibilityLabel={isLogin ? 'Need an account? Sign up' : 'Already have an account? Login'}
            accessibilityRole="button"
          >
            <Text style={styles.toggleButtonText}>
              {isLogin ? 'Need an account? Sign up' : 'Already have an account? Login'}
            </Text>
          </TouchableOpacity>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>

    {/* Name Prompt Modal (Apple Sign-In with hidden name) */}
    <Modal
      visible={showNameModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowNameModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>What's your name?</Text>
          <Text style={styles.modalSubtitle}>
            We need your name to set up your player profile.
          </Text>
          <TextInput
            style={styles.input}
            value={socialName}
            onChangeText={setSocialName}
            placeholder="Your full name"
            autoFocus
            accessibilityLabel="Full name"
          />
          <TouchableOpacity
            style={[styles.submitButton, isSocialLoading && styles.submitButtonDisabled]}
            onPress={handleNameSubmit}
            disabled={isSocialLoading}
            accessibilityLabel="Continue"
            accessibilityRole="button"
          >
            {isSocialLoading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.submitButtonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.xl,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
  },
  appName: {
    ...typography.h1,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  tagline: {
    ...typography.bodyLarge,
    color: colors.gray500,
    marginTop: spacing.xs,
  },
  formContainer: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.xl,
    ...shadows.md,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: spacing.xl,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    padding: spacing.xs,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  activeTab: {
    backgroundColor: colors.primary,
  },
  inactiveTab: {
    backgroundColor: 'transparent',
  },
  tabText: {
    ...typography.button,
  },
  activeTabText: {
    color: colors.white,
  },
  inactiveTabText: {
    color: colors.gray500,
  },
  inputContainer: {
    marginBottom: spacing.lg,
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
    fontSize: 16,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: borderRadius.sm,
    paddingRight: spacing.md,
  },
  passwordInput: {
    flex: 1,
    borderWidth: 0,
  },
  eyeIcon: {
    padding: spacing.sm,
  },
  submitButton: {
    backgroundColor: colors.primary,
    padding: spacing.lg,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    ...typography.button,
    color: colors.white,
  },
  toggleButton: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  toggleButtonText: {
    ...typography.bodySmall,
    color: colors.primary,
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginBottom: spacing.sm,
  },
  forgotPasswordText: {
    ...typography.bodySmall,
    color: colors.primary,
  },
  forgotPasswordContainer: {
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  resetButton: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  resetButtonText: {
    ...typography.button,
    color: colors.white,
    fontSize: 14,
  },
  cancelButton: {
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  cancelButtonText: {
    ...typography.bodySmall,
    color: colors.gray500,
  },
  socialContainer: {
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  appleButton: {
    height: 48,
    width: '100%',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: '#747775',
    backgroundColor: colors.white,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F1F1F',
    marginLeft: spacing.sm,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.inputBorder,
  },
  dividerText: {
    ...typography.bodySmall,
    color: colors.gray500,
    marginHorizontal: spacing.md,
  },
  emailButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: '#747775',
    backgroundColor: colors.white,
  },
  emailButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F1F1F',
    marginLeft: spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.xxl,
    width: '100%',
    maxWidth: 400,
    ...shadows.lg,
  },
  modalTitle: {
    ...typography.h2,
    color: colors.neutral,
    marginBottom: spacing.sm,
  },
  modalSubtitle: {
    ...typography.bodySmall,
    color: colors.gray500,
    marginBottom: spacing.xl,
  },
});

export default AuthScreen;
