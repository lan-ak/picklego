import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { duration, easingConfig } from '../theme';
import { useReducedMotion } from './useReducedMotion';

export function useFadeIn(delay: number = 0) {
  const opacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withTiming(1, {
        duration: reducedMotion ? duration.instant : duration.normal,
        easing: easingConfig.easeOut,
      })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return animatedStyle;
}
