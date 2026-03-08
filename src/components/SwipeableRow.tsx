import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { Icon } from './Icon';
import { useSwipeAction } from '../hooks';
import { colors, spacing, borderRadius } from '../theme';

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
}

export const SwipeableRow: React.FC<SwipeableRowProps> = ({
  children,
  onDelete,
  deleteLabel = 'Delete',
}) => {
  const { panGesture, rowStyle, deleteActionStyle } = useSwipeAction(onDelete);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.deleteAction, deleteActionStyle]}>
        <Icon name="trash" size={20} color={colors.white} />
        <Text style={styles.deleteText}>{deleteLabel}</Text>
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={rowStyle}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  deleteAction: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: spacing.xl,
    borderRadius: borderRadius.md,
  },
  deleteText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 14,
    marginTop: spacing.xs,
  },
});
