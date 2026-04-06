import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Icon, IconName } from './Icon';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';

interface SectionProps {
  title?: string;
  icon?: IconName;
  children: React.ReactNode;
  /** Render a card wrapper (white bg, shadow, rounded). Default: true */
  card?: boolean;
  /** Show a bottom border on the header row */
  headerBorder?: boolean;
  /** Content to render on the right side of the header */
  headerRight?: React.ReactNode;
  /** Style override for the outer container */
  style?: StyleProp<ViewStyle>;
  /** Style variant */
  variant?: 'default' | 'settings';
}

export const Section = ({
  title,
  icon,
  children,
  card = true,
  headerBorder = false,
  headerRight,
  style,
  variant = 'default',
}: SectionProps) => {
  const isSettings = variant === 'settings';

  return (
    <View style={[card && styles.card, style]}>
      {title != null && (
        isSettings ? (
          <Text style={styles.settingsTitle}>{title}</Text>
        ) : (
          <View style={[styles.header, headerBorder && styles.headerBorder]}>
            {icon && <Icon name={icon} size={24} color={colors.primary} />}
            <Text style={[styles.title, headerRight ? styles.titleFlex : null]}>
              {title}
            </Text>
            {headerRight}
          </View>
        )
      )}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  headerBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: colors.primary,
    marginLeft: spacing.sm,
  },
  titleFlex: {
    flex: 1,
  },
  settingsTitle: {
    ...typography.label,
    color: colors.gray500,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
});
