import React from 'react';
import { ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
} from 'react-native-reanimated';

interface KeyboardAwareContainerProps {
  children: React.ReactNode;
  offset?: number;
  style?: StyleProp<ViewStyle>;
}

export const KeyboardAwareContainer: React.FC<KeyboardAwareContainerProps> = ({
  children,
  offset = 0,
  style,
}) => {
  const keyboard = useAnimatedKeyboard();

  const animatedStyle = useAnimatedStyle(() => ({
    paddingBottom: keyboard.height.value + offset,
  }));

  return (
    <Animated.View style={[{ flex: 1 }, animatedStyle, style]}>
      {children}
    </Animated.View>
  );
};
