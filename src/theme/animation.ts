import { Easing } from 'react-native-reanimated';

// Durations (ms)
export const duration = {
  instant: 0,
  fast: 150,
  normal: 250,
  slow: 350,
  stagger: 50,
} as const;

// Spring configs (Reanimated withSpring options)
export const springConfig = {
  /** Snappy — button press, toggle, small UI element */
  snappy: { damping: 15, stiffness: 400, mass: 0.8 },
  /** Gentle — list items entering, card animations */
  gentle: { damping: 20, stiffness: 200, mass: 1 },
  /** Bouncy — FAB press, success states, playful moments */
  bouncy: { damping: 12, stiffness: 300, mass: 0.8 },
  /** Modal — modal present/dismiss, sheet-like behavior */
  modal: { damping: 25, stiffness: 300, mass: 1 },
} as const;

// Easing curves (for withTiming)
export const easingConfig = {
  easeOut: Easing.out(Easing.cubic),
  easeIn: Easing.in(Easing.cubic),
  easeInOut: Easing.inOut(Easing.cubic),
} as const;

// Gesture thresholds (px)
export const gestureThresholds = {
  swipeDeleteThreshold: -80,
  swipeDismissThreshold: 100,
  pullToRefreshThreshold: 80,
} as const;

// Haptic patterns
export const hapticStyle = {
  light: 'light',
  medium: 'medium',
  heavy: 'heavy',
  success: 'success',
  warning: 'warning',
  error: 'error',
} as const;

export type HapticStyle = keyof typeof hapticStyle;
