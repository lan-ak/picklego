import { useCallback } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { springConfig } from '../theme';
import type { HapticStyle } from '../theme';
import { useReducedMotion } from './useReducedMotion';

const hapticMap = {
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  heavy: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  warning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
} as const;

interface AnimatedPressOptions {
  scaleDown?: number;
  hapticStyle?: HapticStyle;
  disabled?: boolean;
}

export function useAnimatedPress(
  onPress: () => void,
  options?: AnimatedPressOptions
) {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();
  const scaleTarget = options?.scaleDown ?? 0.96;
  const hapticType = options?.hapticStyle ?? 'light';

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = useCallback(() => {
    if (options?.disabled) return;
    if (!reducedMotion) {
      scale.value = withSpring(scaleTarget, springConfig.snappy);
    }
    hapticMap[hapticType]();
  }, [options?.disabled, reducedMotion, scaleTarget, hapticType]);

  const onPressOut = useCallback(() => {
    scale.value = withSpring(1, springConfig.snappy);
  }, []);

  const handlePress = useCallback(() => {
    if (!options?.disabled) {
      onPress();
    }
  }, [onPress, options?.disabled]);

  return { animatedStyle, onPressIn, onPressOut, onPress: handlePress };
}
