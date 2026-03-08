import React from 'react';
import { Pressable, ViewStyle, StyleProp } from 'react-native';
import Animated from 'react-native-reanimated';
import { useAnimatedPress } from '../hooks';
import type { HapticStyle } from '../theme';

interface AnimatedPressableProps {
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  hapticStyle?: HapticStyle;
  scaleDown?: number;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'tab' | 'link';
  accessibilityHint?: string;
  accessibilityState?: { disabled?: boolean; selected?: boolean };
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
  testID?: string;
}

export const AnimatedPressable: React.FC<AnimatedPressableProps> = ({
  onPress,
  children,
  style,
  disabled,
  hapticStyle = 'light',
  scaleDown = 0.96,
  ...accessibilityProps
}) => {
  const { animatedStyle, onPressIn, onPressOut, onPress: handlePress } =
    useAnimatedPress(onPress, { scaleDown, hapticStyle, disabled });

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      {...accessibilityProps}
    >
      <Animated.View style={[style, animatedStyle, disabled && { opacity: 0.5 }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};
