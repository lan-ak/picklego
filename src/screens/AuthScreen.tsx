import React, { useEffect, useState } from 'react';
import { isValidEmail } from '../utils/validation';
import { getErrorMessage } from '../utils/errorHandler';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { GoogleIcon } from '../components/GoogleIcon';
import { useData } from '../context/DataContext';
import { sendPasswordReset } from '../config/firebase';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { useToast } from '../context/ToastContext';
import PicklePete from '../components/PicklePete';
import * as AppleAuthentication from 'expo-apple-authentication';
import Animated from 'react-native-reanimated';
import { useFadeIn, useContentTransition, useSlideIn, useHaptic, staggeredEntrance } from '../hooks';

const AuthScreen = () => {
  const fadeStyle = useFadeIn();
  const logoSlide = useSlideIn(0, 'down', 20);
  const formSlide = useSlideIn(1, 'up', 30);
  const triggerHaptic = useHaptic();
  const { addPlayer, setCurrentUser, signIn, signInWithSocial, completeSocialSignUp, signOutUser } = useData();
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
  const [socialLoadingProvider, setSocialLoadingProvider] = useState<'google' | 'apple' | null>(null);
  const [isAppleAuthAvailable, setIsAppleAuthAvailable] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const contentStyle = useContentTransition(isLogin ? 'login' : 'signup');

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setIsAppleAuthAvailable);
  }, []);

  const handleToggleMode = () => {
    triggerHaptic('light');
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

    if (!isValidEmail(email)) {
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
    } catch (error: any) {
      Alert.alert('Error', getErrorMessage(error));
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
      await signIn(email.trim(), password);
    } catch (error: any) {
      Alert.alert('Error', getErrorMessage(error));
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
      triggerHaptic('success');
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
    triggerHaptic('light');
    setSocialLoadingProvider(provider);
    try {
      const result = await signInWithSocial(provider);
      if (result.needsName) {
        setSocialProvider(provider);
        setShowNameModal(true);
      }
    } catch (error: any) {
      if (error.cancelled) return;
      Alert.alert('Error', getErrorMessage(error));
    } finally {
      setSocialLoadingProvider(null);
    }
  };

  const handleNameSubmit = async () => {
    if (!socialName.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    setSocialLoadingProvider(socialProvider);
    try {
      await completeSocialSignUp(socialName.trim(), socialProvider);
      triggerHaptic('success');
      setShowNameModal(false);
      setSocialName('');
    } catch (error: any) {
      Alert.alert('Error', getErrorMessage(error));
    } finally {
      setSocialLoadingProvider(null);
    }
  };

  const handleNameModalCancel = async () => {
    setShowNameModal(false);
    setSocialName('');
    await signOutUser();
  };

  return (
    <>
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <Animated.View style={[{ flex: 1 }, fadeStyle]}>
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Animated.View style={[styles.logoContainer, logoSlide]}>
          <PicklePete pose="welcome" size="xl" />
          <Text style={styles.appName}>PickleGo</Text>
          <Text style={styles.tagline}>Track your pickleball matches and stats</Text>
        </Animated.View>

        <Animated.View style={[styles.formContainer, formSlide]}>
          <View style={styles.tabContainer}>
            <AnimatedPressable
              style={[styles.tabButton, isLogin ? styles.activeTab : styles.inactiveTab]}
              onPress={() => setIsLogin(true)}
              hapticStyle="light"
              accessibilityRole="tab"
              accessibilityLabel="Login"
              accessibilityState={{ selected: isLogin }}
            >
              <Text style={[styles.tabText, isLogin ? styles.activeTabText : styles.inactiveTabText]}>
                Login
              </Text>
            </AnimatedPressable>

            <AnimatedPressable
              style={[styles.tabButton, isLogin ? styles.inactiveTab : styles.activeTab]}
              onPress={() => setIsLogin(false)}
              hapticStyle="light"
              accessibilityRole="tab"
              accessibilityLabel="Sign Up"
              accessibilityState={{ selected: !isLogin }}
            >
              <Text style={[styles.tabText, isLogin ? styles.inactiveTabText : styles.activeTabText]}>
                Sign Up
              </Text>
            </AnimatedPressable>
          </View>

          <Animated.View style={contentStyle}>
          {/* Social Sign-In Buttons */}
          <View style={styles.socialContainer}>
            {isAppleAuthAvailable && (
              <Animated.View entering={staggeredEntrance(0)}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={isLogin ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN : AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={borderRadius.sm}
                  style={styles.appleButton}
                  onPress={() => handleSocialSignIn('apple')}
                />
              </Animated.View>
            )}

            <Animated.View entering={staggeredEntrance(1)}>
            <AnimatedPressable
              style={styles.googleButton}
              onPress={() => handleSocialSignIn('google')}
              disabled={socialLoadingProvider !== null}
              accessibilityLabel={isLogin ? "Sign in with Google" : "Sign up with Google"}
              accessibilityRole="button"
            >
              {socialLoadingProvider === 'google' ? (
                <ActivityIndicator color="#1F1F1F" />
              ) : (
                <>
                  <GoogleIcon size={20} />
                  <Text style={styles.googleButtonText}>{isLogin ? 'Sign in with Google' : 'Sign up with Google'}</Text>
                </>
              )}
            </AnimatedPressable>
            </Animated.View>
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
                  <AnimatedPressable
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
                  </AnimatedPressable>
                </View>
              </View>

              {isLogin && !showForgotPassword && (
                <AnimatedPressable
                  style={styles.forgotPasswordButton}
                  onPress={() => setShowForgotPassword(true)}
                  accessibilityLabel="Forgot password"
                  accessibilityRole="button"
                  accessibilityHint="Opens password reset form"
                >
                  <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                </AnimatedPressable>
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
                  <AnimatedPressable
                    style={styles.resetButton}
                    onPress={handleForgotPassword}
                    hapticStyle="medium"
                    accessibilityLabel="Send reset link"
                    accessibilityRole="button"
                  >
                    <Text style={styles.resetButtonText}>Send Reset Link</Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={styles.cancelButton}
                    onPress={() => {
                      setShowForgotPassword(false);
                      setResetEmail('');
                    }}
                    accessibilityLabel="Cancel password reset"
                    accessibilityRole="button"
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </AnimatedPressable>
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

              <AnimatedPressable
                style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                onPress={isLogin ? handleLogin : handleSignUp}
                hapticStyle="medium"
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
              </AnimatedPressable>
            </>
          ) : (
            <AnimatedPressable
              style={styles.emailButton}
              onPress={() => setShowEmailForm(true)}
              hapticStyle="light"
              accessibilityLabel="Continue with email"
              accessibilityRole="button"
            >
              <Icon name="mail" size={20} color="#1F1F1F" />
              <Text style={styles.emailButtonText}>Continue with Email</Text>
            </AnimatedPressable>
          )}

          </Animated.View>

          <AnimatedPressable
            style={styles.toggleButton}
            onPress={handleToggleMode}
            accessibilityLabel={isLogin ? 'Need an account? Sign up' : 'Already have an account? Login'}
            accessibilityRole="button"
          >
            <Text style={styles.toggleButtonText}>
              {isLogin ? 'Need an account? Sign up' : 'Already have an account? Login'}
            </Text>
          </AnimatedPressable>
        </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      </Animated.View>
    </SafeAreaView>

    {/* Name Prompt Modal (Apple Sign-In with hidden name) */}
    <Modal
      visible={showNameModal}
      transparent
      animationType="fade"
      onRequestClose={handleNameModalCancel}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
          <AnimatedPressable
            style={[styles.submitButton, socialLoadingProvider !== null && styles.submitButtonDisabled]}
            onPress={handleNameSubmit}
            disabled={socialLoadingProvider !== null}
            accessibilityLabel="Continue"
            accessibilityRole="button"
          >
            {socialLoadingProvider !== null ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.submitButtonText}>Continue</Text>
            )}
          </AnimatedPressable>
          <AnimatedPressable
            onPress={handleNameModalCancel}
            accessibilityLabel="Cancel"
            accessibilityRole="button"
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </AnimatedPressable>
        </View>
      </View>
      </KeyboardAvoidingView>
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
  cancelButtonText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
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
