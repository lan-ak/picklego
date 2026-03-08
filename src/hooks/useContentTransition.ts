import { useEffect, useRef } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { duration, easingConfig } from '../theme';
import { useReducedMotion } from './useReducedMotion';

/**
 * Pulses opacity when the dependency changes (fade out → fade in).
 * Skips the initial render to avoid double-animating with useFadeIn.
 */
export function useContentTransition(dependency: string | number) {
  const opacity = useSharedValue(1);
  const isFirstRender = useRef(true);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (reducedMotion) return;

    opacity.value = withSequence(
      withTiming(0, {
        duration: duration.fast,
        easing: easingConfig.easeIn,
      }),
      withTiming(1, {
        duration: duration.fast,
        easing: easingConfig.easeOut,
      })
    );
  }, [dependency]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return contentStyle;
}
