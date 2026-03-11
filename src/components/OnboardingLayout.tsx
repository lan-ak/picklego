import React, { useEffect } from 'react';
import { View, Text, StyleSheet, BackHandler, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from 'react-native-reanimated';
import PicklePete from './PicklePete';
import OnboardingProgressBar from './OnboardingProgressBar';
import { PrimaryButton } from './Button';
import { AnimatedPressable } from './AnimatedPressable';
import { useFadeIn } from '../hooks';
import { colors, typography, spacing, borderRadius, springConfig } from '../theme';

type PetePose = 'high-five' | 'stopwatch' | 'welcome' | 'win' | 'loss' | 'invite' | 'error';

interface OnboardingLayoutProps {
  step: number;
  totalSteps?: number;
  petePose: PetePose;
  peteMessage?: string;
  peteSize?: 'sm' | 'md' | 'lg' | 'xl';
  title?: string;
  subtitle?: string;
  ctaTitle: string;
  ctaOnPress: () => void;
  ctaLoading?: boolean;
  ctaDisabled?: boolean;
  secondaryAction?: { title: string; onPress: () => void };
  showProgressBar?: boolean;
  heroColor?: string;
  children: React.ReactNode;
}

const OnboardingLayout = ({
  step,
  totalSteps = 6,
  petePose,
  peteMessage,
  peteSize = 'lg',
  title,
  subtitle,
  ctaTitle,
  ctaOnPress,
  ctaLoading,
  ctaDisabled,
  secondaryAction,
  showProgressBar = true,
  heroColor,
  children,
}: OnboardingLayoutProps) => {
  const fadeStyle = useFadeIn();
  const peteScale = useSharedValue(0);

  useEffect(() => {
    peteScale.value = withDelay(100, withSpring(1, springConfig.bouncy));
  }, []);

  const peteAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: peteScale.value }],
  }));

  // Block Android hardware back button
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => handler.remove();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <Animated.View style={[styles.content, fadeStyle]}>
        {showProgressBar && (
          <OnboardingProgressBar currentStep={step} totalSteps={totalSteps} />
        )}

        {heroColor ? (
          <View style={[styles.heroSection, { backgroundColor: heroColor }]}>
            <Animated.View style={peteAnimStyle}>
              <PicklePete pose={petePose} size={peteSize} message={peteMessage} />
            </Animated.View>
          </View>
        ) : (
          <Animated.View style={peteAnimStyle}>
            <PicklePete pose={petePose} size={peteSize} message={peteMessage} />
          </Animated.View>
        )}

        {title && <Text style={styles.title}>{title}</Text>}
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

        <View style={styles.body}>{children}</View>

        <View style={styles.footer}>
          <PrimaryButton
            title={ctaTitle}
            onPress={ctaOnPress}
            loading={ctaLoading}
            disabled={ctaDisabled}
            style={styles.ctaButton}
          />
          {secondaryAction && (
            <AnimatedPressable
              style={styles.secondaryAction}
              onPress={secondaryAction.onPress}
              hapticStyle="light"
            >
              <Text style={styles.secondaryText}>{secondaryAction.title}</Text>
            </AnimatedPressable>
          )}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
  },
  heroSection: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.bodyLarge,
    color: colors.gray500,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  body: {
    flex: 1,
  },
  footer: {
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  ctaButton: {
    width: '100%',
    borderRadius: borderRadius.pill,
  },
  secondaryAction: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  secondaryText: {
    ...typography.bodySmall,
    color: colors.gray500,
  },
});

export default OnboardingLayout;
