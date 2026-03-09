import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../types';
import OnboardingLayout from '../../components/OnboardingLayout';
import { Icon } from '../../components/Icon';
import { useSlideIn } from '../../hooks';
import { colors, typography, spacing, borderRadius, shadows, springConfig, duration } from '../../theme';

type Nav = NativeStackNavigationProp<OnboardingStackParamList, 'ScheduleMatch'>;

const ShimmerText = ({ text }: { text: string }) => {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800 }),
        withTiming(0.3, { duration: 800 })
      ),
      -1,
      true
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.Text style={[styles.shimmerText, animStyle]}>{text}</Animated.Text>
  );
};

const MockMatchCard = () => {
  const cardSlide = useSlideIn(3, 'up', 30);
  const badgeScale = useSharedValue(0);

  useEffect(() => {
    badgeScale.value = withDelay(
      4 * duration.stagger,
      withSpring(1, springConfig.bouncy)
    );
  }, []);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));

  return (
    <Animated.View style={[styles.mockCard, cardSlide]}>
      <Animated.View style={[styles.scheduledBadge, badgeStyle]}>
        <Icon name="calendar" size={12} color={colors.white} />
        <Text style={styles.badgeText}>Scheduled</Text>
      </Animated.View>

      <View style={styles.matchupRow}>
        <View style={styles.playerSide}>
          <View style={[styles.avatar, { backgroundColor: colors.primaryOverlay }]}>
            <Icon name="user" size={20} color={colors.primary} />
          </View>
          <Text style={styles.playerName}>You</Text>
        </View>

        <Text style={styles.vsText}>vs</Text>

        <View style={styles.playerSide}>
          <View style={[styles.avatar, { backgroundColor: colors.secondaryOverlay }]}>
            <Icon name="help-circle" size={20} color={colors.secondary} />
          </View>
          <ShimmerText text="???" />
        </View>
      </View>

      <View style={styles.matchDetails}>
        <View style={styles.detailRow}>
          <Icon name="clock" size={14} color={colors.gray400} />
          <Text style={styles.detailText}>Today</Text>
        </View>
        <View style={styles.detailRow}>
          <Icon name="map-pin" size={14} color={colors.gray400} />
          <ShimmerText text="Pick a court" />
        </View>
      </View>
    </Animated.View>
  );
};

const ScheduleMatchScreen = () => {
  const navigation = useNavigation<Nav>();

  return (
    <OnboardingLayout
      step={4}
      petePose="stopwatch"
      peteSize="lg"
      peteMessage="Let's get on the court!"
      title="Your First Match"
      subtitle="Schedule a game and start tracking"
      ctaTitle="Schedule a Match"
      ctaOnPress={() => navigation.navigate('OnboardingAddMatch', { onboardingMode: true })}
      secondaryAction={{
        title: "I'll do this later",
        onPress: () => navigation.navigate('Celebration', { matchCreated: false }),
      }}
    >
      <View style={styles.content}>
        <MockMatchCard />
      </View>
    </OnboardingLayout>
  );
};

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  mockCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.xxl,
    ...shadows.md,
  },
  scheduledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.pill,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  badgeText: {
    ...typography.caption,
    color: colors.white,
    fontWeight: '600',
  },
  matchupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxl,
    marginBottom: spacing.xl,
  },
  playerSide: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerName: {
    ...typography.bodyLarge,
    color: colors.neutral,
  },
  vsText: {
    ...typography.h3,
    color: colors.gray400,
  },
  shimmerText: {
    ...typography.bodyLarge,
    color: colors.secondary,
    fontWeight: '600',
  },
  matchDetails: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xxl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  detailText: {
    ...typography.bodySmall,
    color: colors.gray500,
  },
});

export default ScheduleMatchScreen;
