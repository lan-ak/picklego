import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
} from 'react-native-reanimated';
import { colors, spacing, springConfig } from '../theme';

interface OnboardingProgressBarProps {
  currentStep: number;
  totalSteps: number;
}

const Dot = ({ active }: { active: boolean }) => {
  const scale = useSharedValue(active ? 1 : 0.8);

  useEffect(() => {
    scale.value = withSpring(active ? 1 : 0.8, springConfig.snappy);
  }, [active]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: active ? colors.primary : colors.gray200,
  }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
};

const OnboardingProgressBar = ({ currentStep, totalSteps }: OnboardingProgressBarProps) => {
  return (
    <View style={styles.container}>
      {Array.from({ length: totalSteps }, (_, i) => (
        <Dot key={i} active={i < currentStep} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});

export default OnboardingProgressBar;
