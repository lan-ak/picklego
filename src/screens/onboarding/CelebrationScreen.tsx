import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { OnboardingStackParamList } from '../../types';
import PicklePete from '../../components/PicklePete';
import { PrimaryButton } from '../../components/Button';
import { useData } from '../../context/DataContext';
import { useFadeIn, useSlideIn, useHaptic } from '../../hooks';
import { usePlacement } from 'expo-superwall';
import { PLACEMENTS } from '../../services/superwallPlacements';
import { colors, typography, spacing, springConfig } from '../../theme';

type CelebrationRoute = RouteProp<OnboardingStackParamList, 'Celebration'>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CONFETTI_COUNT = 30;
const CONFETTI_COLORS = [colors.primary, colors.action, colors.secondary, '#FF6B6B', '#A78BFA'];

const ConfettiPiece = ({ index }: { index: number }) => {
  const translateY = useSharedValue(-20);
  const translateX = useSharedValue(Math.random() * SCREEN_WIDTH);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const delay = Math.random() * 1500;
    const duration = 2500 + Math.random() * 2000;

    translateY.value = withDelay(
      delay,
      withTiming(SCREEN_HEIGHT + 20, {
        duration,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
    );

    translateX.value = withDelay(
      delay,
      withTiming(translateX.value + (Math.random() - 0.5) * 120, {
        duration,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      })
    );

    rotate.value = withDelay(
      delay,
      withRepeat(
        withTiming(360, { duration: 1000 + Math.random() * 1000 }),
        -1,
        false
      )
    );

    opacity.value = withDelay(
      delay + duration - 500,
      withTiming(0, { duration: 500 })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  const size = 6 + Math.random() * 8;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const isCircle = index % 3 === 0;

  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        animatedStyle,
        {
          width: isCircle ? size : size * 0.6,
          height: isCircle ? size : size * 1.4,
          borderRadius: isCircle ? size / 2 : 2,
          backgroundColor: color,
        },
      ]}
    />
  );
};

const CelebrationScreen = () => {
  const route = useRoute<CelebrationRoute>();
  const { matchCreated } = route.params;
  const { completeOnboarding } = useData();
  const { registerPlacement } = usePlacement();
  const triggerHaptic = useHaptic();

  // Animations
  const peteScale = useSharedValue(0);
  const titleFade = useFadeIn(300);
  const subtitleFade = useFadeIn(500);
  const ctaSlide = useSlideIn(0, 'up', 30);

  useEffect(() => {
    triggerHaptic('success');
    peteScale.value = withDelay(100, withSpring(1, springConfig.bouncy));
  }, []);

  const peteAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: peteScale.value }],
  }));

  const handleComplete = async () => {
    registerPlacement({ placement: PLACEMENTS.ONBOARDING_COMPLETE });
    await completeOnboarding();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      {/* Confetti layer */}
      <View style={styles.confettiContainer} pointerEvents="none">
        {Array.from({ length: CONFETTI_COUNT }, (_, i) => (
          <ConfettiPiece key={i} index={i} />
        ))}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Animated.View style={peteAnimatedStyle}>
          <PicklePete pose="high-five" size="xl" message="You're all set!" />
        </Animated.View>

        <Animated.View style={titleFade}>
          <Text style={styles.title}>Welcome to PickleGo!</Text>
        </Animated.View>

        <Animated.View style={subtitleFade}>
          <Text style={styles.subtitle}>
            {matchCreated
              ? "Your first match is on the books!"
              : "Schedule a match anytime from the home screen!"}
          </Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.footer, ctaSlide]}>
        <PrimaryButton
          title="Let's Play!"
          onPress={handleComplete}
          icon="arrow-right"
          style={styles.ctaButton}
        />
      </Animated.View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  confettiContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  confettiPiece: {
    position: 'absolute',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  title: {
    ...typography.h1,
    color: colors.primary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  subtitle: {
    ...typography.bodyLarge,
    fontSize: 18,
    color: colors.neutral,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 26,
  },
  footer: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  ctaButton: {
    width: '100%',
  },
});

export default CelebrationScreen;
