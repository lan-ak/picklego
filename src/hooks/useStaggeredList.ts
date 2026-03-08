import { FadeIn, FadeInUp, FadeInDown } from 'react-native-reanimated';
import { duration, springConfig } from '../theme';
import { AccessibilityInfo } from 'react-native';

const MAX_STAGGER_INDEX = 10;

/**
 * Returns a Reanimated entering animation with stagger delay based on index.
 * Use as: <Animated.View entering={staggeredEntrance(index)}>
 */
export function staggeredEntrance(
  index: number,
  direction: 'up' | 'down' = 'up'
) {
  const clampedIndex = Math.min(index, MAX_STAGGER_INDEX);
  const delay = clampedIndex * duration.stagger;

  const BaseAnimation = direction === 'up' ? FadeInUp : FadeInDown;

  return BaseAnimation
    .delay(delay)
    .springify()
    .damping(springConfig.gentle.damping)
    .stiffness(springConfig.gentle.stiffness);
}
