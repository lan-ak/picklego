import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Icon, IconName } from './Icon';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';

type FooterButtonProps = {
  onPress: () => void;
  icon?: IconName;
  label: string;
};

export const FooterButton: React.FC<FooterButtonProps> = ({
  onPress,
  icon = 'plus',
  label
}) => {
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {icon && <Icon name={icon} size={24} color={colors.white} />}
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: colors.secondary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    ...shadows.lg,
    marginHorizontal: spacing.xs,
  },
  text: {
    ...typography.button,
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: spacing.md,
  },
});
