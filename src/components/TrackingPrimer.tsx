import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import OnboardingLayout from './OnboardingLayout';
import { Icon } from './Icon';
import { isTrackingUndetermined, requestTrackingOnce } from '../services/tracking';
import { useSlideIn, useHaptic } from '../hooks';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';

/**
 * App Tracking Transparency priming screen.
 *
 * Shown as a full-screen overlay at cold start, before the first interactive
 * screen. It gates on the ATT status rather than on onboarding state, which means
 * existing users get asked on upgrade too — an onboarding step would only ever
 * reach new signups, and would fire after the install event had already flushed.
 */

const BENEFITS = [
  {
    icon: 'target' as const,
    title: 'Better Recommendations',
    subtitle: 'Courts, partners, and offers that actually fit how you play',
    accentColor: colors.primary,
  },
  {
    icon: 'bar-chart-2' as const,
    title: 'Smarter Growth',
    subtitle: 'See which of our ads bring real players to the court',
    accentColor: colors.secondary,
  },
  {
    icon: 'eye-off' as const,
    title: 'Never Sold',
    subtitle: 'Your data is never sold. Change this anytime in Settings.',
    accentColor: colors.action,
  },
];

const BenefitCard = ({
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
  const slideStyle = useSlideIn(index + 3, 'right', 40);

  return (
    <Animated.View style={[styles.card, slideStyle]}>
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <View style={[styles.iconWrap, { backgroundColor: accentColor + '20' }]}>
        <Icon name={icon as any} size={20} color={accentColor} />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </Animated.View>
  );
};

const TrackingPrimer = () => {
  const triggerHaptic = useHaptic();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (await isTrackingUndetermined()) {
        if (!cancelled) setVisible(true);
      } else {
        // Already answered, or a platform without ATT. Settle the gate so the
        // attribution SDKs stop waiting on it.
        await requestTrackingOnce();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  const handleContinue = async () => {
    setLoading(true);
    const granted = await requestTrackingOnce();
    triggerHaptic(granted ? 'success' : 'light');
    setLoading(false);
    setVisible(false);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <OnboardingLayout
        step={0}
        showProgressBar={false}
        petePose="welcome"
        peteSize="lg"
        peteMessage="Let's make PickleGo better for you"
        title="Help Us Improve PickleGo"
        subtitle="Here's what allowing tracking does"
        ctaTitle="Continue"
        ctaOnPress={handleContinue}
        ctaLoading={loading}
      >
        <View style={styles.benefits}>
          {BENEFITS.map((benefit, i) => (
            <BenefitCard key={benefit.icon} {...benefit} index={i} />
          ))}
        </View>
      </OnboardingLayout>
    </View>
  );
};

const styles = StyleSheet.create({
  benefits: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    gap: spacing.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: borderRadius.md,
    borderBottomLeftRadius: borderRadius.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  title: {
    ...typography.bodyLarge,
    color: colors.neutral,
  },
  subtitle: {
    ...typography.caption,
    color: colors.gray400,
    marginTop: 2,
  },
});

export default TrackingPrimer;
