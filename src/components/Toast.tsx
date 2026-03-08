import React, { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { colors, typography, spacing, borderRadius, shadows, springConfig, duration, easingConfig } from '../theme';

type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  visible: boolean;
  message: string;
  type: ToastType;
  duration?: number;
  onDismiss: () => void;
}

const TOAST_COLORS: Record<ToastType, string> = {
  success: colors.success,
  error: colors.error,
  info: colors.info,
};

const HAPTIC_MAP: Record<ToastType, () => void> = {
  success: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  info: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
};

const Toast: React.FC<ToastProps> = ({ visible, message, type, duration: toastDuration = 3000, onDismiss }) => {
  const translateY = useSharedValue(-100);

  const dismiss = () => {
    translateY.value = withTiming(-100, {
      duration: duration.fast,
      easing: easingConfig.easeIn,
    }, () => {
      runOnJS(onDismiss)();
    });
  };

  useEffect(() => {
    if (visible) {
      // Trigger haptic on show
      HAPTIC_MAP[type]();

      // Animate in with spring
      translateY.value = withSpring(0, springConfig.bouncy);

      // Auto-dismiss after duration
      const timer = setTimeout(() => {
        dismiss();
      }, toastDuration);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  // Swipe up to dismiss gesture
  const swipeGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY < 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY < -30) {
        // Swiped up enough — dismiss
        translateY.value = withTiming(-100, {
          duration: duration.fast,
          easing: easingConfig.easeIn,
        }, () => {
          runOnJS(onDismiss)();
        });
      } else {
        // Snap back
        translateY.value = withSpring(0, springConfig.snappy);
      }
    });

  // Tap to dismiss gesture
  const tapGesture = Gesture.Tap().onEnd(() => {
    runOnJS(dismiss)();
  });

  const composedGesture = Gesture.Race(swipeGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        style={[
          styles.container,
          { backgroundColor: TOAST_COLORS[type] },
          animatedStyle,
        ]}
      >
        <Text style={styles.text}>{message}</Text>
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: spacing.lg,
    right: spacing.lg,
    borderRadius: borderRadius.md,
    zIndex: 9999,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadows.lg,
  },
  text: {
    ...typography.bodyLarge,
    color: colors.white,
    textAlign: 'center',
  },
});

export default Toast;
