import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Icon, IconName } from './Icon';
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
  <TouchableOpacity
    style={[styles.primary, disabled && styles.disabled, style]}
    onPress={onPress}
    disabled={disabled || loading}
    activeOpacity={0.7}
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
  </TouchableOpacity>
);

export const SecondaryButton = ({ title, onPress, icon, disabled, loading, style }: ButtonProps) => (
  <TouchableOpacity
    style={[styles.secondary, disabled && styles.disabled, style]}
    onPress={onPress}
    disabled={disabled || loading}
    activeOpacity={0.7}
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
  </TouchableOpacity>
);

export const DangerButton = ({ title, onPress, icon, disabled, loading, style }: ButtonProps) => (
  <TouchableOpacity
    style={[styles.danger, disabled && styles.disabled, style]}
    onPress={onPress}
    disabled={disabled || loading}
    activeOpacity={0.7}
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
  </TouchableOpacity>
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
  disabled: {
    opacity: 0.5,
  },
  icon: {
    marginLeft: 8,
  },
});
