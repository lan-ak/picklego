import React from 'react';
import { Pressable, ViewStyle, StyleProp, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useAnimatedPress } from '../hooks';
import type { HapticStyle } from '../theme';

const LAYOUT_KEYS: (keyof ViewStyle)[] = [
  'flex', 'flexGrow', 'flexShrink', 'flexBasis',
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
  'alignSelf',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical',
  'position', 'top', 'bottom', 'left', 'right',
  'zIndex',
];

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

  const flatStyle = StyleSheet.flatten(style) as ViewStyle | undefined;
  const outerStyle = flatStyle
    ? LAYOUT_KEYS.reduce<Record<string, any>>((acc, key) => {
        if (flatStyle[key] !== undefined) acc[key] = flatStyle[key];
        return acc;
      }, {})
    : undefined;

  return (
    <Pressable
      style={outerStyle}
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
