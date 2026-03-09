import React from 'react';
import {
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Icon, IconName } from './Icon';
import { AnimatedPressable } from './AnimatedPressable';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  hapticStyle?: 'light' | 'heavy';
};

export const PrimaryButton = ({ title, onPress, icon, disabled, loading, style, accessibilityHint, hapticStyle = 'light' }: ButtonProps) => (
  <AnimatedPressable
    style={[styles.primary, style]}
    onPress={onPress}
    disabled={disabled || loading}
    hapticStyle={hapticStyle}
    accessibilityRole="button"
    accessibilityLabel={title}
    accessibilityHint={accessibilityHint}
  >
    {loading ? (
      <ActivityIndicator color={colors.white} />
    ) : (
      <>
        {icon && <Icon name={icon} size={20} color={colors.white} style={styles.iconLeft} />}
        <Text style={styles.primaryText}>{title}</Text>
      </>
    )}
  </AnimatedPressable>
);

export const SecondaryButton = ({ title, onPress, icon, disabled, loading, style, accessibilityHint, hapticStyle = 'light' }: ButtonProps) => (
  <AnimatedPressable
    style={[styles.secondary, style]}
    onPress={onPress}
    disabled={disabled || loading}
    hapticStyle={hapticStyle}
    accessibilityRole="button"
    accessibilityLabel={title}
    accessibilityHint={accessibilityHint}
  >
    {loading ? (
      <ActivityIndicator color={colors.gray500} />
    ) : (
      <>
        {icon && <Icon name={icon} size={20} color={colors.gray500} style={styles.iconLeft} />}
        <Text style={styles.secondaryText}>{title}</Text>
      </>
    )}
  </AnimatedPressable>
);

export const DangerButton = ({ title, onPress, icon, disabled, loading, style, accessibilityHint, hapticStyle = 'heavy' }: ButtonProps) => (
  <AnimatedPressable
    style={[styles.danger, style]}
    onPress={onPress}
    disabled={disabled || loading}
    hapticStyle={hapticStyle}
    accessibilityRole="button"
    accessibilityLabel={title}
    accessibilityHint={accessibilityHint}
  >
    {loading ? (
      <ActivityIndicator color={colors.white} />
    ) : (
      <>
        {icon && <Icon name={icon} size={20} color={colors.white} style={styles.iconLeft} />}
        <Text style={styles.dangerText}>{title}</Text>
      </>
    )}
  </AnimatedPressable>
);

const styles = StyleSheet.create({
  primary: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    paddingHorizontal: 24,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    ...shadows.sm,
  },
  primaryText: {
    ...typography.button,
    color: colors.white,
  },
  secondary: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.lg,
    paddingHorizontal: 24,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  secondaryText: {
    ...typography.button,
    color: colors.gray500,
  },
  danger: {
    backgroundColor: colors.error,
    paddingVertical: spacing.lg,
    paddingHorizontal: 24,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    ...shadows.sm,
  },
  dangerText: {
    ...typography.button,
    color: colors.white,
  },
  iconLeft: {
    marginRight: 8,
  },
});
