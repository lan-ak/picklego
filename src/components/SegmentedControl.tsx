import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { AnimatedPressable } from './AnimatedPressable';
import { colors, typography, spacing, borderRadius } from '../theme';

interface SegmentedControlProps<T extends string> {
  options: { label: string; value: T }[];
  selected: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  size?: 'default' | 'small';
}

export function SegmentedControl<T extends string>({
  options,
  selected,
  onChange,
  accessibilityLabel,
  style,
  size = 'default',
}: SegmentedControlProps<T>) {
  const isSmall = size === 'small';

  return (
    <View
      style={[styles.container, style]}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const isSelected = option.value === selected;
        return (
          <AnimatedPressable
            key={option.value}
            style={[
              styles.button,
              isSmall && styles.buttonSmall,
              isSelected && styles.buttonSelected,
            ]}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: isSelected }}
          >
            <Text style={[
              styles.buttonText,
              isSmall && styles.buttonTextSmall,
              isSelected && styles.buttonTextSelected,
            ]}>
              {option.label}
            </Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    overflow: 'hidden',
  },
  button: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  buttonSmall: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    flex: 0,
  },
  buttonSelected: {
    backgroundColor: colors.primary,
  },
  buttonText: {
    ...typography.button,
    color: colors.primary,
  },
  buttonTextSmall: {
    fontSize: 14,
  },
  buttonTextSelected: {
    color: colors.white,
  },
});
