import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { springConfig, duration } from '../theme';
import { useReducedMotion } from './useReducedMotion';

type Direction = 'up' | 'down' | 'left' | 'right';

export function useSlideIn(
  index: number = 0,
  direction: Direction = 'up',
  offsetPx: number = 20
) {
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 1;
    } else {
      progress.value = withDelay(
        index * duration.stagger,
        withSpring(1, springConfig.gentle)
      );
    }
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const offset = (1 - progress.value) * offsetPx;

    const transform =
      direction === 'up' ? [{ translateY: offset }] :
      direction === 'down' ? [{ translateY: -offset }] :
      direction === 'left' ? [{ translateX: offset }] :
      [{ translateX: -offset }];

    return {
      opacity: progress.value,
      transform,
    };
  });

  return animatedStyle;
}
