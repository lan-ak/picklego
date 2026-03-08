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
import { colors, typography, borderRadius, shadows } from '../theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export const PrimaryButton = ({ title, onPress, icon, disabled, loading, style }: ButtonProps) => (
  <AnimatedPressable
    style={[styles.primary, style]}
    onPress={onPress}
    disabled={disabled || loading}
    hapticStyle="light"
    accessibilityRole="button"
    accessibilityLabel={title}
  >
    {loading ? (
      <ActivityIndicator color={colors.white} />
    ) : (
      <>
        <Text style={styles.primaryText}>{title}</Text>
        {icon && <Icon name={icon} size={20} color={colors.white} style={styles.icon} />}
      </>
    )}
  </AnimatedPressable>
);

export const SecondaryButton = ({ title, onPress, icon, disabled, loading, style }: ButtonProps) => (
  <AnimatedPressable
    style={[styles.secondary, style]}
    onPress={onPress}
    disabled={disabled || loading}
    hapticStyle="light"
    accessibilityRole="button"
    accessibilityLabel={title}
  >
    {loading ? (
      <ActivityIndicator color={colors.secondary} />
    ) : (
      <>
        <Text style={styles.secondaryText}>{title}</Text>
        {icon && <Icon name={icon} size={20} color={colors.secondary} style={styles.icon} />}
      </>
    )}
  </AnimatedPressable>
);

export const DangerButton = ({ title, onPress, icon, disabled, loading, style }: ButtonProps) => (
  <AnimatedPressable
    style={[styles.danger, style]}
    onPress={onPress}
    disabled={disabled || loading}
    hapticStyle="heavy"
    accessibilityRole="button"
    accessibilityLabel={title}
  >
    {loading ? (
      <ActivityIndicator color={colors.white} />
    ) : (
      <>
        <Text style={styles.dangerText}>{title}</Text>
        {icon && <Icon name={icon} size={20} color={colors.white} style={styles.icon} />}
      </>
    )}
  </AnimatedPressable>
);

const styles = StyleSheet.create({
  primary: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  primaryText: {
    ...typography.button,
    color: colors.white,
  },
  secondary: {
    backgroundColor: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    ...typography.button,
    color: colors.secondary,
  },
  danger: {
    backgroundColor: colors.error,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  dangerText: {
    ...typography.button,
    color: colors.white,
  },
  icon: {
    marginLeft: 8,
  },
});
