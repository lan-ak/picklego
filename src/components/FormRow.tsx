import React from 'react';
import { Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Icon, IconName } from './Icon';
import { AnimatedPressable } from './AnimatedPressable';
import { colors, typography, spacing, borderRadius } from '../theme';

interface FormRowProps {
  icon?: IconName;
  iconColor?: string;
  text: string;
  placeholder?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export const FormRow = ({
  icon,
  iconColor = colors.primary,
  text,
  placeholder = false,
  onPress,
  style,
  accessibilityLabel,
  accessibilityHint,
}: FormRowProps) => (
  <AnimatedPressable
    style={[styles.row, style]}
    onPress={onPress}
    accessibilityLabel={accessibilityLabel || text}
    accessibilityHint={accessibilityHint}
    accessibilityRole="button"
  >
    {icon && <Icon name={icon} size={18} color={iconColor} />}
    <Text
      style={[styles.text, placeholder && styles.placeholder]}
      numberOfLines={1}
    >
      {text}
    </Text>
    <Icon name="chevron-right" size={18} color={colors.gray400} />
  </AnimatedPressable>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    gap: spacing.sm,
  },
  text: {
    ...typography.bodySmall,
    color: colors.neutral,
    flex: 1,
  },
  placeholder: {
    color: colors.gray400,
  },
});
