import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Icon, IconName } from './Icon';
import { AnimatedPressable } from './AnimatedPressable';
import { colors, typography, spacing, borderRadius } from '../theme';

const VARIANT_STYLES = {
  default: {
    bg: colors.surface,
    text: colors.neutral,
    border: undefined,
  },
  primary: {
    bg: colors.primaryOverlay,
    text: colors.primary,
    border: colors.primary,
  },
  success: {
    bg: colors.winOverlay,
    text: '#388E3C',
    border: '#81C784',
  },
  info: {
    bg: colors.secondaryOverlay,
    text: colors.secondary,
    border: '#90CAF9',
  },
  warning: {
    bg: colors.actionOverlay,
    text: '#E65100',
    border: '#FFB74D',
  },
} as const;

type ChipVariant = keyof typeof VARIANT_STYLES;

interface ChipProps {
  label: string;
  variant?: ChipVariant;
  selected?: boolean;
  icon?: IconName;
  onRemove?: () => void;
  onPress?: () => void;
  maxWidth?: number;
  accessibilityLabel?: string;
}

export const Chip = ({
  label,
  variant = 'default',
  selected = false,
  icon,
  onRemove,
  onPress,
  maxWidth,
  accessibilityLabel,
}: ChipProps) => {
  const v = VARIANT_STYLES[variant];
  const isSelected = selected && variant === 'primary';

  const containerStyle = [
    styles.container,
    {
      backgroundColor: isSelected ? colors.primary : v.bg,
      borderColor: v.border,
      borderWidth: v.border ? 1 : 0,
    },
  ];

  const textColor = isSelected ? colors.white : v.text;
  const iconColor = isSelected ? colors.white : v.text;

  const content = (
    <>
      {icon && <Icon name={icon} size={14} color={iconColor} />}
      <Text
        style={[styles.label, { color: textColor }, maxWidth ? { maxWidth } : null]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {onRemove && (
        <AnimatedPressable
          onPress={onRemove}
          style={styles.removeButton}
          accessibilityLabel={`Remove ${label}`}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          scaleDown={0.85}
        >
          <Icon name="x-circle" size={18} color={iconColor} />
        </AnimatedPressable>
      )}
    </>
  );

  if (onPress) {
    return (
      <AnimatedPressable
        style={containerStyle}
        onPress={onPress}
        accessibilityLabel={accessibilityLabel || label}
        accessibilityRole="button"
      >
        {content}
      </AnimatedPressable>
    );
  }

  return (
    <View
      style={containerStyle}
      accessibilityLabel={accessibilityLabel || label}
    >
      {content}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 40,
    borderRadius: borderRadius.xl,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  label: {
    ...typography.bodySmall,
  },
  removeButton: {
    padding: 6,
  },
});
