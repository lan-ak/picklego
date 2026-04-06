import React from 'react';
import { View, Text, Switch, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Icon, IconName } from './Icon';
import { colors, typography, spacing, borderRadius } from '../theme';

interface ToggleRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  icon?: IconName;
  /** Active color for the switch track and optional icon/label tint */
  tintColor?: string;
  /** Show a tinted background with border (for inline accent rows) */
  tinted?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export const ToggleRow = ({
  label,
  description,
  value,
  onValueChange,
  icon,
  tintColor = colors.primary,
  tinted = false,
  style,
  accessibilityLabel,
  accessibilityHint,
}: ToggleRowProps) => (
  <View
    style={[
      styles.row,
      tinted && {
        backgroundColor: `${tintColor}15`,
        borderWidth: 1,
        borderColor: tintColor,
        borderRadius: borderRadius.sm,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
      },
      style,
    ]}
  >
    <View style={styles.labelContainer}>
      {icon && <Icon name={icon} size={18} color={tinted ? tintColor : colors.primary} />}
      <View style={description ? styles.textContainer : undefined}>
        <Text style={[styles.label, tinted && { color: tintColor, fontWeight: '600' }]}>
          {label}
        </Text>
        {description && <Text style={styles.description}>{description}</Text>}
      </View>
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: colors.gray300, true: tintColor }}
      thumbColor={colors.white}
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint}
    />
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.md,
    gap: spacing.sm,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    ...typography.bodyLarge,
    color: colors.neutral,
  },
  description: {
    ...typography.bodySmall,
    color: colors.gray400,
    marginTop: 2,
  },
});
