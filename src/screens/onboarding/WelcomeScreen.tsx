import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../types';
import OnboardingLayout from '../../components/OnboardingLayout';
import { Icon } from '../../components/Icon';
import { useSlideIn } from '../../hooks';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'Welcome'>;

const VALUE_PROPS = [
  {
    icon: 'activity' as const,
    title: 'Track Your Game',
    subtitle: 'Wins, losses, streaks & stats',
    accentColor: colors.primary,
  },
  {
    icon: 'users' as const,
    title: 'Build Your Crew',
    subtitle: 'Challenge friends & find partners',
    accentColor: colors.secondary,
  },
  {
    icon: 'map-pin' as const,
    title: 'Find Courts',
    subtitle: 'Discover places to play nearby',
    accentColor: colors.action,
  },
];

const ValuePropCard = ({
  icon,
  title,
  subtitle,
  accentColor,
  index,
}: {
  icon: string;
  title: string;
  subtitle: string;
  accentColor: string;
  index: number;
}) => {
  const slideStyle = useSlideIn(index + 3, 'right', 30);

  return (
    <Animated.View style={[styles.valuePropCard, slideStyle]}>
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
      <View style={[styles.iconCircle, { backgroundColor: accentColor + '20' }]}>
        <Icon name={icon as any} size={24} color={accentColor} />
      </View>
      <View style={styles.valuePropText}>
        <Text style={styles.valuePropTitle}>{title}</Text>
        <Text style={styles.valuePropSubtitle}>{subtitle}</Text>
      </View>
    </Animated.View>
  );
};

const WelcomeScreen = () => {
  const navigation = useNavigation<Nav>();

  return (
    <OnboardingLayout
      step={1}
      petePose="welcome"
      peteSize="xl"
      peteMessage="Hey! I'm PicklePete!"
      heroColor={colors.primaryOverlay}
      title="Welcome to PickleGo!"
      subtitle="Your pickleball journey starts here"
      ctaTitle="Let's Go!"
      ctaOnPress={() => navigation.navigate('NotificationPerm')}
    >
      <View style={styles.valueProps}>
        {VALUE_PROPS.map((prop, index) => (
          <ValuePropCard key={prop.icon} {...prop} index={index} />
        ))}
      </View>
    </OnboardingLayout>
  );
};

const styles = StyleSheet.create({
  valueProps: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  valuePropCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    gap: spacing.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: borderRadius.md,
    borderBottomLeftRadius: borderRadius.md,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valuePropText: {
    flex: 1,
  },
  valuePropTitle: {
    ...typography.bodyLarge,
    color: colors.neutral,
    fontWeight: '600',
  },
  valuePropSubtitle: {
    ...typography.caption,
    color: colors.gray400,
    marginTop: 2,
  },
});

export default WelcomeScreen;
