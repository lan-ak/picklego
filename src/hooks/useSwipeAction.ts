import {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { springConfig, duration, easingConfig, gestureThresholds } from '../theme';

export function useSwipeAction(onDelete: () => void) {
  const translateX = useSharedValue(0);
  const hasTriggeredHaptic = useSharedValue(false);

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-5, 5])
    .onUpdate((event) => {
      // Only allow left swipe
      if (event.translationX < 0) {
        translateX.value = event.translationX;

        if (
          event.translationX < gestureThresholds.swipeDeleteThreshold &&
          !hasTriggeredHaptic.value
        ) {
          hasTriggeredHaptic.value = true;
          runOnJS(triggerHaptic)();
        }
      }
    })
    .onEnd((event) => {
      hasTriggeredHaptic.value = false;

      if (event.translationX < gestureThresholds.swipeDeleteThreshold) {
        translateX.value = withTiming(
          -400,
          { duration: duration.normal, easing: easingConfig.easeIn },
          () => {
            runOnJS(onDelete)();
          }
        );
      } else {
        translateX.value = withSpring(0, springConfig.snappy);
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const deleteActionStyle = useAnimatedStyle(() => ({
    opacity: Math.min(
      1,
      Math.abs(translateX.value) / Math.abs(gestureThresholds.swipeDeleteThreshold)
    ),
  }));

  return { panGesture, rowStyle, deleteActionStyle };
}
