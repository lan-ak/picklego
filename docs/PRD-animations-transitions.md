# PRD: Standardized Animations & Transitions

**Author:** Engineering
**Date:** 2026-03-08
**Status:** Draft
**Version:** 1.0

---

## 1. Overview

PickleGo currently has minimal animation: a single fade-in on HomeScreen, a spring/timing toast entrance/exit, and `activeOpacity={0.7}` on all touchable elements. Modals use React Native's built-in `Modal` with `animationType="slide"`, which produces non-native-feeling transitions. There is no haptic feedback, no pull-to-refresh, no swipe gestures, and no skeleton loading screens.

This PRD defines a utilities-first animation system built on `react-native-reanimated` and `react-native-gesture-handler`. The system establishes shared animation constants, reusable hooks, and animated wrapper components. Once the foundation is built, it is applied screen-by-screen to produce an iOS-native feel across all 11 screens. Modals are migrated from RN `Modal` to React Navigation modal presentation (iOS card-style). Haptic feedback, pull-to-refresh, swipe-to-delete on list items, and skeleton loading screens are added as part of the rollout.

---

## 2. Goals

| Goal | Metric |
|------|--------|
| iOS-native feel | Spring-based transitions, swipe-back navigation, swipe-to-dismiss modals on every screen |
| Consistency | 100% of animations reference shared constants from `src/theme/animation.ts` — zero ad-hoc durations or spring configs |
| Performance | 100% of animations run on the UI thread via Reanimated worklets — zero JS thread animations |
| Tactile feedback | Haptic feedback on every button press, destructive action, tab switch, and success/error state |
| Progressive loading | Skeleton screens replace `ActivityIndicator` spinners for every data-fetching state |
| Gesture interactions | Pull-to-refresh on 4 scrollable screens, swipe-to-delete on notification cards, swipe-back on all stack screens |
| Accessibility | All animations respect `Reduce Motion` system setting; degrade to instant transitions |

---

## 3. Non-Goals

- Lottie or After Effects-based animations (mascot PicklePete animations, celebratory confetti).
- Shared element transitions between screens (e.g., MatchCard morphing into MatchDetailsScreen).
- Custom tab bar animation redesign (FAB bounce, tab switching animations) — future enhancement.
- Android-specific Material Design motion system — this pass targets iOS-native feel; Android gets the same spring physics.
- `@gorhom/bottom-sheet` library — modals use React Navigation's modal presentation instead.

---

## 4. User Stories

### 4.1 Smooth Screen Transitions
As a user, when I navigate between screens, I want transitions that feel native to iOS (push from right, pop with swipe-back gesture, modals slide up as cards) so the app feels polished and familiar.

### 4.2 Tactile Button Feedback
As a user, when I tap a button, I want to feel a subtle scale-down animation and haptic tap so interactions feel responsive and confirmed.

### 4.3 List Item Swipe Actions
As a user, I want to swipe left on a notification card to reveal a delete action, matching the gesture patterns I know from iOS apps.

### 4.4 Pull-to-Refresh
As a user on the Matches, Notifications, or Home screen, I want to pull down to refresh data so I can check for updates without navigating away.

### 4.5 Skeleton Loading States
As a user waiting for data to load, I want to see skeleton placeholders that match the layout of the incoming content (not a spinner), so I understand what is loading and the screen does not jump when data arrives.

### 4.6 Smooth Modal Interactions
As a user, when a modal appears (InvitePlayersModal, date picker, confirmation dialogs), I want it to slide up as a card that I can swipe down to dismiss, matching iOS system behavior.

### 4.7 Accessibility
As a user with Reduce Motion enabled, I want all transitions to be instant (no spring animations, no slide-ins) so the app does not cause discomfort.

### 4.8 Content Entrance Animations
As a user, when I land on a screen, I want list items and cards to fade in with a subtle staggered entrance so the content feels alive without being distracting.

---

## 5. Technical Design

### 5.1 Dependencies & Setup

**New dependencies:**

```json
{
  "react-native-reanimated": "~3.16.0",
  "react-native-gesture-handler": "~2.20.0",
  "expo-haptics": "~14.0.0"
}
```

**`babel.config.js` update:**

```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'], // Must be last
  };
};
```

**`App.tsx` wrapping:**

```typescript
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Wrap the entire app
<GestureHandlerRootView style={{ flex: 1 }}>
  {/* existing SafeAreaProvider + NavigationContainer + providers */}
</GestureHandlerRootView>
```

### 5.2 Animation Constants / Tokens

**New file: `src/theme/animation.ts`**

All animation parameters live here. No component should define its own duration or spring config.

```typescript
import { Easing } from 'react-native-reanimated';

// Durations (ms)
export const duration = {
  instant: 0,       // For reduceMotion fallback
  fast: 150,        // Micro-interactions: button press scale, checkbox toggle
  normal: 250,      // Standard transitions: fade in/out, slide in
  slow: 350,        // Screen transitions, modal present/dismiss
  stagger: 50,      // Delay between staggered list items
} as const;

// Spring configs (Reanimated withSpring options)
export const spring = {
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
export const easing = {
  easeOut: Easing.out(Easing.cubic),
  easeIn: Easing.in(Easing.cubic),
  easeInOut: Easing.inOut(Easing.cubic),
} as const;

// Gesture thresholds (px)
export const gesture = {
  swipeDeleteThreshold: -80,
  swipeDismissThreshold: 100,
  pullToRefreshThreshold: 80,
} as const;

// Haptic patterns
export const haptic = {
  light: 'light',       // Button taps, tab switches
  medium: 'medium',     // Confirm actions, FAB press
  heavy: 'heavy',       // Destructive actions (delete, cancel match)
  success: 'success',   // Match completed, invite accepted
  warning: 'warning',   // Approaching destructive action
  error: 'error',       // Validation error, failed action
} as const;
```

Export from `src/theme/index.ts`:

```typescript
export { duration, spring, easing, gesture, haptic } from './animation';
```

### 5.3 Shared Hooks

All hooks live in `src/hooks/` with a barrel export at `src/hooks/index.ts`.

#### `useAnimatedPress`

Replaces `TouchableOpacity` with `activeOpacity={0.7}`. Provides scale-down + haptic on press.

```typescript
import { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { spring } from '../theme';
import { useReducedMotion } from './useReducedMotion';

export function useAnimatedPress(onPress: () => void, options?: {
  scaleDown?: number;        // default 0.96
  hapticStyle?: 'light' | 'medium' | 'heavy';
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();
  const scaleTarget = options?.scaleDown ?? 0.96;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = () => {
    if (options?.disabled) return;
    if (!reducedMotion) {
      scale.value = withSpring(scaleTarget, spring.snappy);
    }
    // Trigger haptic
    Haptics.impactAsync(/* mapped from options.hapticStyle */);
  };

  const onPressOut = () => {
    scale.value = withSpring(1, spring.snappy);
  };

  return { animatedStyle, onPressIn, onPressOut, onPress };
}
```

#### `useFadeIn`

Replaces the manual `Animated.timing(fadeAnim, ...)` pattern in HomeScreen.

```typescript
import { useSharedValue, useAnimatedStyle, withTiming, withDelay } from 'react-native-reanimated';
import { duration, easing } from '../theme';
import { useReducedMotion } from './useReducedMotion';

export function useFadeIn(delay: number = 0) {
  const opacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withTiming(1, {
        duration: reducedMotion ? duration.instant : duration.normal,
        easing: easing.easeOut,
      })
    );
  }, []);

  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}
```

#### `useSlideIn`

For staggered list entrance animations. Each item receives its index for staggered delay.

```typescript
import { useSharedValue, useAnimatedStyle, withDelay, withSpring } from 'react-native-reanimated';
import { spring, duration } from '../theme';

export function useSlideIn(index: number = 0, direction: 'up' | 'down' | 'left' | 'right' = 'up', offsetPx: number = 20) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(index * duration.stagger, withSpring(1, spring.gentle));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * offsetPx }], // direction-dependent
  }));

  return animatedStyle;
}
```

#### `useSwipeAction`

For swipe-to-delete on notification cards. Uses Gesture Handler's `Pan` gesture.

```typescript
import { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';
import { spring, duration, easing, gesture as gestureConfig } from '../theme';
import * as Haptics from 'expo-haptics';

export function useSwipeAction(onDelete: () => void) {
  const translateX = useSharedValue(0);
  const hasTriggeredHaptic = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-5, 5])
    .onUpdate((event) => {
      if (event.translationX < 0) {
        translateX.value = event.translationX;
        // Trigger haptic when crossing threshold
        if (event.translationX < gestureConfig.swipeDeleteThreshold && !hasTriggeredHaptic.value) {
          hasTriggeredHaptic.value = true;
          runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
        }
      }
    })
    .onEnd((event) => {
      hasTriggeredHaptic.value = false;
      if (event.translationX < gestureConfig.swipeDeleteThreshold) {
        translateX.value = withTiming(-400, { duration: duration.normal, easing: easing.easeIn }, () => {
          runOnJS(onDelete)();
        });
      } else {
        translateX.value = withSpring(0, spring.snappy);
      }
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const deleteActionStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.abs(translateX.value) / Math.abs(gestureConfig.swipeDeleteThreshold)),
  }));

  return { panGesture, rowStyle, deleteActionStyle };
}
```

#### `useReducedMotion`

Wraps Reanimated's built-in reduced motion detection.

```typescript
import { useReducedMotion as useReanimatedReducedMotion } from 'react-native-reanimated';

export function useReducedMotion(): boolean {
  return useReanimatedReducedMotion();
}
```

#### `useHaptic`

Convenience wrapper around `expo-haptics`.

```typescript
import * as Haptics from 'expo-haptics';

export function useHaptic() {
  const trigger = useCallback((style: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'light') => {
    switch (style) {
      case 'light': return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      case 'medium': return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      case 'heavy': return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      case 'success': return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      case 'warning': return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      case 'error': return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, []);
  return trigger;
}
```

### 5.4 Animated Components

#### `AnimatedPressable` (`src/components/AnimatedPressable.tsx`)

Drop-in replacement for `TouchableOpacity` throughout the app. Uses `useAnimatedPress` internally.

```typescript
import Animated from 'react-native-reanimated';
import { Pressable } from 'react-native';
import { useAnimatedPress } from '../hooks';

interface AnimatedPressableProps {
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  hapticStyle?: 'light' | 'medium' | 'heavy';
  scaleDown?: number;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'tab' | 'link';
}

export const AnimatedPressable: React.FC<AnimatedPressableProps> = ({
  onPress, children, style, disabled, hapticStyle = 'light', scaleDown = 0.96, ...a11yProps
}) => {
  const { animatedStyle, onPressIn, onPressOut, onPress: handlePress } =
    useAnimatedPress(onPress, { scaleDown, hapticStyle, disabled });

  return (
    <Pressable onPress={handlePress} onPressIn={onPressIn} onPressOut={onPressOut} disabled={disabled} {...a11yProps}>
      <Animated.View style={[style, animatedStyle, disabled && { opacity: 0.5 }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};
```

#### `SkeletonLoader` (`src/components/SkeletonLoader.tsx`)

Shimmer-based skeleton for loading states. Includes pre-built variants matching existing card layouts.

```typescript
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, interpolate } from 'react-native-reanimated';

// Base bone component with shimmer animation
const SkeletonBone: React.FC<{ width: number | string; height: number; borderRadius?: number }> = ({ ... }) => {
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1200 }), -1, true);
  }, []);
  // Animates opacity between 0.3 and 0.7; falls back to static 0.3 with Reduce Motion
};

// Pre-built variants
export const MatchCardSkeleton = () => ( /* matches MatchCard layout */ );
export const NotificationCardSkeleton = () => ( /* matches NotificationCard layout */ );
export const StatsCardSkeleton = () => ( /* matches stats row layout */ );

// Repeater for lists
export const SkeletonList: React.FC<{ count: number; skeleton: React.ComponentType }> = ({ count, skeleton: Skeleton }) => (
  <View>{Array.from({ length: count }).map((_, i) => <Skeleton key={i} />)}</View>
);
```

#### `SwipeableRow` (`src/components/SwipeableRow.tsx`)

Wraps any list item to add swipe-to-delete behavior.

```typescript
import { GestureDetector } from 'react-native-gesture-handler';
import { useSwipeAction } from '../hooks';

export const SwipeableRow: React.FC<{ children: React.ReactNode; onDelete: () => void }> = ({ children, onDelete }) => {
  const { panGesture, rowStyle, deleteActionStyle } = useSwipeAction(onDelete);

  return (
    <View style={{ overflow: 'hidden' }}>
      {/* Background: red delete action with trash icon */}
      <Animated.View style={[styles.deleteAction, deleteActionStyle]}>
        <Icon name="trash-2" size={20} color={colors.white} />
        <Text>Delete</Text>
      </Animated.View>

      {/* Foreground: swipeable content */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
};
```

#### `KeyboardAwareContainer` (`src/components/KeyboardAwareContainer.tsx`)

Replaces `KeyboardAvoidingView` with Reanimated's smooth keyboard animation.

```typescript
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';

export const KeyboardAwareContainer: React.FC<{ children: React.ReactNode; offset?: number }> = ({
  children, offset = 0,
}) => {
  const keyboard = useAnimatedKeyboard();
  const animatedStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboard.height.value + offset,
  }));

  return <Animated.View style={[{ flex: 1 }, animatedStyle]}>{children}</Animated.View>;
};
```

### 5.5 Navigation Transition Configs

**Update: `src/navigation/index.tsx`**

```typescript
// Default screen options for the root stack
const screenOptions = {
  headerShown: false,
  animation: 'default',              // iOS push/pop with swipe-back
  gestureEnabled: true,               // Enable swipe-back gesture
  gestureDirection: 'horizontal',
  fullScreenGestureEnabled: true,     // Full-screen swipe-back (iOS 15+)
};

// Modal presentation for specific screens
const modalScreenOptions = {
  headerShown: false,
  presentation: 'modal',             // iOS card modal
  animation: 'slide_from_bottom',
  gestureEnabled: true,               // Swipe down to dismiss
  gestureDirection: 'vertical',
};
```

**Screen assignment:**

| Screen | Presentation | Gesture |
|--------|-------------|---------|
| MatchDetails | Push (slide from right) | Swipe-back from left edge |
| PlayerStats | Push | Swipe-back |
| Settings | Push | Swipe-back |
| EditProfile | Push | Swipe-back |
| CourtsDiscovery | Push | Swipe-back |
| Notifications | Push | Swipe-back |
| AddMatch | **Modal** (slide from bottom) | Swipe-down to dismiss |
| CompleteMatch | **Modal** (slide from bottom) | Swipe-down to dismiss |
| InvitePlayers | **Modal** (slide from bottom) | Swipe-down to dismiss |

### 5.6 Modal Migration

#### InvitePlayersModal → React Navigation Modal Screen

Current: `InvitePlayersModal` uses RN `Modal` with `animationType="slide"` and manual bottom-sheet positioning (`maxHeight: '85%'`, `justifyContent: 'flex-end'`).

Migration:
1. Register `InvitePlayers` as a screen in the root stack with `presentation: 'modal'`
2. Pass `context`, `onSelectExistingPlayer`, `onPlaceholderCreated` via route params or a callback ref
3. Remove RN `Modal` wrapper and `modalOverlay`/`modalContent` styles
4. The component becomes a full screen — React Navigation handles the card animation + swipe-to-dismiss

#### AuthScreen Name Prompt Modal

Keep as an inline RN `Modal` since it is a simple dialog within the auth flow (not a navigable destination). Replace `animationType="fade"` with Reanimated-driven fade+scale entrance animation.

#### Confirmation Alerts

Keep `Alert.alert()` calls as native alerts — they already feel native.

### 5.7 Keyboard-Respecting Patterns

Replace `KeyboardAvoidingView` with `KeyboardAwareContainer` (section 5.4) on:
- **AuthScreen** — email/password form
- **CompleteMatchScreen** — score entry inputs
- **AddMatchScreen** — form fields inside modal
- **InvitePlayers screen** — email tab input

The `KeyboardAwareContainer` uses Reanimated's `useAnimatedKeyboard` which provides smooth, frame-accurate keyboard tracking instead of the choppy `KeyboardAvoidingView` behavior.

### 5.8 Haptic Feedback Map

| Interaction | Haptic Type | Location |
|---|---|---|
| Button tap (Primary, Secondary) | `light` | AnimatedPressable wrapping buttons |
| Tab switch (Matches filter, InviteModal tabs) | `light` | Tab press handlers |
| Destructive action (Delete match, Cancel match) | `heavy` | DangerButton, confirmation handler |
| Swipe past delete threshold | `medium` | useSwipeAction hook |
| Match completed / Invite accepted | `success` | Success toast handler |
| Validation error | `error` | Error toast handler |
| Pull-to-refresh activation | `light` | RefreshControl onRefresh |
| FAB button press | `medium` | AddMatch tab button |
| Sign out | `heavy` | SettingsScreen sign out handler |

### 5.9 Pull-to-Refresh Pattern

Uses React Native's built-in `RefreshControl` (already native-feeling on iOS) with haptic on activation:

```typescript
const [refreshing, setRefreshing] = useState(false);
const triggerHaptic = useHaptic();

const onRefresh = useCallback(async () => {
  triggerHaptic('light');
  setRefreshing(true);
  await refreshMatches(); // or refreshNotifications, etc.
  setRefreshing(false);
}, []);

<ScrollView
  refreshControl={
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
  }
>
```

**Screens receiving pull-to-refresh:**
- HomeScreen — refresh matches + stats
- MatchesScreen — refresh matches
- NotificationsScreen — refresh notifications
- PlayerStatsScreen — refresh player stats

### 5.10 iOS Gesture Expectations

| Gesture | Behavior | Implementation |
|---|---|---|
| Swipe from left edge | Pop screen (go back) | `gestureEnabled: true` + `fullScreenGestureEnabled: true` on native-stack |
| Swipe down on modal | Dismiss modal | `presentation: 'modal'` + `gestureDirection: 'vertical'` |
| Swipe left on list item | Reveal delete action | `SwipeableRow` component with `useSwipeAction` |
| Pull down on scrollable | Refresh data | `RefreshControl` on ScrollView/FlatList |
| Press and release | Scale-down + haptic | `AnimatedPressable` replacing all `TouchableOpacity` |

---

## 6. Screen-by-Screen Application Plan

### HomeScreen (`src/screens/HomeScreen.tsx`)
- Replace RN `Animated` fade-in with `useFadeIn()` hook
- Add staggered `useSlideIn` for each section (Next Match, Quick Stats, Recent Matches)
- Add pull-to-refresh on ScrollView
- Replace all `TouchableOpacity` with `AnimatedPressable`
- Add `StatsCardSkeleton` and `MatchCardSkeleton` for loading states

### MatchesScreen (`src/screens/MatchesScreen.tsx`)
- Add pull-to-refresh on ScrollView
- Replace tab `TouchableOpacity` with `AnimatedPressable` (haptic on tab switch)
- Add `SkeletonList count={3} skeleton={MatchCardSkeleton}` for loading state
- Add staggered `useSlideIn` for match cards

### AddMatchScreen (`src/screens/AddMatchScreen.tsx`)
- Present as modal via React Navigation `presentation: 'modal'`
- Add `KeyboardAwareContainer` for form inputs
- Replace button `TouchableOpacity` with `AnimatedPressable`
- Add haptic on team selection, date picker open, location selection

### PlayerStatsScreen (`src/screens/PlayerStatsScreen.tsx`)
- Add pull-to-refresh
- Add `useFadeIn` for stats sections
- Replace `TouchableOpacity` with `AnimatedPressable`
- Add skeleton for stats loading state

### SettingsScreen (`src/screens/SettingsScreen.tsx`)
- Replace all menu item `TouchableOpacity` with `AnimatedPressable`
- Migrate InvitePlayersModal calls to `navigation.navigate('InvitePlayers')`
- Add haptic on destructive actions (sign out, delete account)

### AuthScreen (`src/screens/AuthScreen.tsx`)
- Replace name prompt `Modal` animation with Reanimated fade+scale
- Replace `KeyboardAvoidingView` with `KeyboardAwareContainer`
- Add `AnimatedPressable` for all buttons
- Add fade-in animation for logo/mascot area

### MatchDetailsScreen (`src/screens/MatchDetailsScreen.tsx`)
- Add `useFadeIn` for content
- Replace `TouchableOpacity` with `AnimatedPressable`
- Add haptic on destructive actions (delete match, cancel match)

### CompleteMatchScreen (`src/screens/CompleteMatchScreen.tsx`)
- Present as modal via React Navigation `presentation: 'modal'`
- Add `KeyboardAwareContainer` for score inputs
- Add haptic (`success`) on match completion

### EditProfileScreen (`src/screens/EditProfileScreen.tsx`)
- Add `KeyboardAwareContainer`
- Replace `TouchableOpacity` with `AnimatedPressable`
- Add `useFadeIn` for form fields

### CourtsDiscoveryScreen (`src/screens/CourtsDiscoveryScreen.tsx`)
- Add `useFadeIn` for map and list views
- Replace `TouchableOpacity` with `AnimatedPressable` for court cards

### NotificationsScreen (`src/screens/NotificationsScreen.tsx`)
- Wrap `NotificationCard` items in `SwipeableRow` for swipe-to-delete
- Add pull-to-refresh on FlatList
- Add staggered `useSlideIn` for notification cards
- Add `SkeletonList count={4} skeleton={NotificationCardSkeleton}` for loading

### Component Migrations

| Component | Changes |
|---|---|
| `Button.tsx` | Replace `TouchableOpacity` with `AnimatedPressable` in all variants; remove `activeOpacity` |
| `MatchCard.tsx` | Replace outer `TouchableOpacity` with `AnimatedPressable` |
| `NotificationCard.tsx` | Replace `TouchableOpacity` with `AnimatedPressable`; accept/decline get appropriate haptic styles |
| `Chip.tsx` | Replace `TouchableOpacity` with `AnimatedPressable` when `onPress` is provided |
| `Toast.tsx` | Migrate from RN `Animated` to Reanimated; add haptic on display; add swipe-up-to-dismiss gesture |

---

## 7. Implementation Phases

### Phase 1: Foundation (Week 1)

Install dependencies and establish the animation system. No visual changes yet.

- Install `react-native-reanimated`, `react-native-gesture-handler`, `expo-haptics`
- Configure babel plugin, `GestureHandlerRootView` wrapper in App.tsx
- Create `src/theme/animation.ts` with all constants
- Create all hooks: `useAnimatedPress`, `useFadeIn`, `useSlideIn`, `useSwipeAction`, `useReducedMotion`, `useHaptic`
- Create `src/hooks/index.ts` barrel export
- Create `AnimatedPressable` component
- Create `SkeletonLoader` component with card-specific variants
- Create `SwipeableRow` component
- Create `KeyboardAwareContainer` component
- **Verify:** All existing functionality still works, no regressions

### Phase 2: Navigation & Modals (Week 2)

Native-feeling screen transitions and modal presentations.

- Update `src/navigation/index.tsx` with screen options (gesture enabled, full-screen swipe-back)
- Configure `AddMatch` and `CompleteMatch` as modal presentations
- Register `InvitePlayers` as a modal screen in the stack
- Migrate `InvitePlayersModal` from RN `Modal` to React Navigation modal screen
- Update `SettingsScreen` and `AddMatchScreen` to navigate to `InvitePlayers` screen
- Migrate `Toast` from RN `Animated` to Reanimated (spring in, timing out, swipe-up dismiss)
- **Verify:** All navigation works, swipe-back on push screens, swipe-down dismisses modals

### Phase 3: Core Components (Week 3)

Animated buttons, haptic feedback, and loading skeletons everywhere.

- Migrate `Button.tsx` to use `AnimatedPressable`
- Migrate `MatchCard.tsx` to use `AnimatedPressable`
- Migrate `NotificationCard.tsx` to use `AnimatedPressable`
- Migrate `Chip.tsx` to use `AnimatedPressable`
- Add haptic to `Toast` display (map toast type to haptic type)
- Replace `KeyboardAvoidingView` with `KeyboardAwareContainer` in AuthScreen and CompleteMatchScreen
- **Verify:** All buttons scale on press, haptic fires, keyboard handling works

### Phase 4: Screen Animations (Week 4)

Per-screen entrance animations, staggered lists, pull-to-refresh, swipe-to-delete.

- HomeScreen: Replace RN Animated fade with `useFadeIn`, staggered sections, pull-to-refresh, skeletons
- MatchesScreen: Pull-to-refresh, staggered entrance, skeletons, tab haptics
- NotificationsScreen: `SwipeableRow` wrapping, pull-to-refresh, staggered entrance, skeletons
- SettingsScreen: `useFadeIn`, `AnimatedPressable` for menu items
- PlayerStatsScreen: Pull-to-refresh, fade-in, skeletons
- AuthScreen: Reanimated name modal, fade-in logo area
- Remaining screens (MatchDetails, EditProfile, CourtsDiscovery): `useFadeIn`, `AnimatedPressable`
- Replace all remaining standalone `TouchableOpacity` instances
- **Verify:** Full app walkthrough, every screen has entrance animation, all interactions have haptic

### Phase 5: Polish & Accessibility (Week 5)

Reduce motion support, performance profiling, edge case fixes.

- Audit all animations for `useReducedMotion` compliance
- Performance profiling with Reanimated performance monitor (ensure UI thread animations)
- Test with VoiceOver enabled — ensure animated elements are accessible
- Test with Reduce Motion enabled — verify instant transitions
- Fix any jank or frame drops
- Add `accessibilityHint` to swipeable rows ("Swipe left to delete")
- Edge case testing (see section 9)

---

## 8. Testing Strategy

### Unit Tests
- `animation.ts` constants — verify all spring configs have required fields (damping, stiffness, mass)
- `useReducedMotion` — mock accessibility info and verify correct value
- `useHaptic` — mock `expo-haptics` and verify correct haptic type for each style

### Component Tests
- `AnimatedPressable` — renders children, fires onPress, respects `disabled`
- `SkeletonLoader` variants — render correct number of bones
- `SwipeableRow` — renders children and delete action

### Integration Tests (Manual / Maestro)
- Navigate forward and back on every stack screen — smooth push/pop
- Swipe back from edge on every push screen
- Present each modal, swipe down to dismiss
- Pull-to-refresh on Home, Matches, Notifications, PlayerStats
- Swipe-to-delete a notification
- Toggle Reduce Motion in iOS Settings — all animations become instant
- Enable VoiceOver — navigate full app flow
- Open keyboard on Auth, CompleteMatch, AddMatch — content shifts up
- Rapid-tap buttons — no double-navigation or double-submission

### Performance Tests
- Run React Native performance monitor during scrolling on MatchesScreen with 50+ matches
- Verify 60fps during screen transitions (no JS thread spikes)
- Verify skeleton shimmer runs on UI thread (no jank when JS is busy)

---

## 9. Edge Cases

| Scenario | Handling |
|---|---|
| Reduce Motion enabled | All `withSpring`/`withTiming` calls check `useReducedMotion()` and use `duration.instant` or skip animation |
| Rapid button taps | `AnimatedPressable` debounces via `disabled` during press; navigation uses `navigation.isFocused()` guard |
| Swipe-back during screen transition | `react-native-screens` handles natively with `gestureEnabled: true` |
| Modal dismiss during async operation | Track modal visibility; cancel/ignore async result if dismissed |
| Keyboard overlapping modal content | `KeyboardAwareContainer` inside modal screens; Reanimated keyboard height animation |
| Long lists (100+ items) | Stagger animation limited to first 10 visible items; rest render without entrance animation |
| App backgrounded during animation | Reanimated UI thread animations complete naturally; no cleanup needed |
| Low-end devices | Spring configs use moderate stiffness/damping; no particle effects or complex compositions |
| Skeleton displayed but data loads instantly | Show skeleton for minimum 300ms to avoid flash; `Promise.all([dataFetch, delay(300)])` |
| Swipe-to-delete on notification with pending action | Disable swipe gesture on cards with pending accept/decline status |
| Pull-to-refresh while already refreshing | `refreshing` state gate prevents concurrent refresh calls |
| Navigation during modal presentation | Dismiss modal before pushing new screen; or use `navigation.navigate` which handles stack |

---

## 10. Success Criteria

| Criteria | Verification |
|---|---|
| Zero JS thread animations | Every animation on UI thread via Reanimated worklets; verified via performance monitor |
| Consistent timing | No hardcoded durations or spring configs; all reference `src/theme/animation.ts`; verified via code search |
| Full gesture coverage | Swipe-back on all 8 push screens, swipe-down on all 3 modal screens, swipe-to-delete on notifications |
| Haptic on every interaction | Every button, tab, destructive action, success/error triggers haptic; verified on device |
| Reduce Motion compliance | With Reduce Motion on, all transitions instant, no spring/bounce, no skeleton shimmer |
| No loading spinners | `ActivityIndicator` replaced with skeleton screens on all data-loading states |
| Pull-to-refresh on all lists | Home, Matches, Notifications, PlayerStats support pull-to-refresh |
| 60fps transitions | Screen transitions and scrolling maintain 60fps; verified via performance monitor on device |

---

## 11. Files Summary

### New Files (12)

| File | Purpose |
|---|---|
| `src/theme/animation.ts` | Animation constants: durations, springs, easings, gesture thresholds, haptic types |
| `src/hooks/useAnimatedPress.ts` | Scale-down + haptic press animation |
| `src/hooks/useFadeIn.ts` | Opacity fade-in with delay |
| `src/hooks/useSlideIn.ts` | Staggered slide-in for list items |
| `src/hooks/useSwipeAction.ts` | Swipe-to-delete gesture |
| `src/hooks/useReducedMotion.ts` | Accessibility reduce motion wrapper |
| `src/hooks/useHaptic.ts` | Haptic feedback convenience hook |
| `src/hooks/index.ts` | Barrel export |
| `src/components/AnimatedPressable.tsx` | Drop-in `TouchableOpacity` replacement |
| `src/components/SkeletonLoader.tsx` | Shimmer skeleton with card variants |
| `src/components/SwipeableRow.tsx` | Swipe-to-delete list item wrapper |
| `src/components/KeyboardAwareContainer.tsx` | Reanimated keyboard-aware wrapper |

### Modified Files (24)

| File | Changes |
|---|---|
| `package.json` | Add reanimated, gesture-handler, expo-haptics |
| `babel.config.js` | Add `react-native-reanimated/plugin` |
| `App.tsx` | Wrap with `GestureHandlerRootView` |
| `src/theme/index.ts` | Export animation constants |
| `src/navigation/index.tsx` | Screen options, gesture configs, modal presentations, InvitePlayers screen |
| `src/components/Button.tsx` | `TouchableOpacity` → `AnimatedPressable` |
| `src/components/Toast.tsx` | RN Animated → Reanimated, haptic, swipe dismiss |
| `src/components/MatchCard.tsx` | `TouchableOpacity` → `AnimatedPressable` |
| `src/components/NotificationCard.tsx` | `TouchableOpacity` → `AnimatedPressable` |
| `src/components/Chip.tsx` | `TouchableOpacity` → `AnimatedPressable` |
| `src/components/InvitePlayersModal.tsx` | RN Modal → React Navigation modal screen |
| `src/screens/HomeScreen.tsx` | Reanimated fade-in, staggered sections, pull-to-refresh, skeletons |
| `src/screens/MatchesScreen.tsx` | Pull-to-refresh, staggered entrance, skeletons |
| `src/screens/AddMatchScreen.tsx` | Modal presentation, KeyboardAwareContainer, haptic |
| `src/screens/CompleteMatchScreen.tsx` | Modal presentation, KeyboardAwareContainer, haptic |
| `src/screens/NotificationsScreen.tsx` | SwipeableRow, pull-to-refresh, staggered entrance, skeletons |
| `src/screens/AuthScreen.tsx` | KeyboardAwareContainer, Reanimated modal, AnimatedPressable |
| `src/screens/SettingsScreen.tsx` | AnimatedPressable, navigate to InvitePlayers |
| `src/screens/MatchDetailsScreen.tsx` | useFadeIn, AnimatedPressable |
| `src/screens/EditProfileScreen.tsx` | KeyboardAwareContainer, AnimatedPressable |
| `src/screens/CourtsDiscoveryScreen.tsx` | useFadeIn, AnimatedPressable |
| `src/screens/PlayerStatsScreen.tsx` | Pull-to-refresh, useFadeIn, skeletons |

---

## 12. Open Questions

1. Should the stagger limit (first 10 items) be configurable per screen, or is a global constant sufficient?
2. Should the minimum skeleton display time (300ms) apply to all screens equally, or should some screens (e.g., HomeScreen with cached data) skip it?
3. Should we add a `gestureResponseDistance` config for swipe-back to control how far from the edge the gesture activates?
