import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { colors, borderRadius, spacing } from '../theme';
import { useReducedMotion } from '../hooks';

interface SkeletonBoneProps {
  width: number | `${number}%`;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export const SkeletonBone: React.FC<SkeletonBoneProps> = ({
  width,
  height,
  radius = borderRadius.sm,
  style,
}) => {
  const shimmer = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!reducedMotion) {
      shimmer.value = withRepeat(
        withTiming(1, { duration: 1200 }),
        -1,
        true
      );
    }
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion
      ? 0.3
      : interpolate(shimmer.value, [0, 1], [0.3, 0.7]),
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius: radius,
          backgroundColor: colors.gray200,
        },
        animatedStyle,
        style,
      ]}
    />
  );
};

export const MatchCardSkeleton: React.FC = () => (
  <View style={styles.matchCard}>
    <View style={styles.row}>
      <SkeletonBone width={120} height={14} />
      <SkeletonBone width={60} height={22} radius={borderRadius.sm} />
    </View>
    <SkeletonBone width={180} height={12} style={{ marginTop: spacing.sm }} />
    <View style={styles.teamsBlock}>
      <SkeletonBone width={140} height={16} />
      <SkeletonBone width={20} height={12} style={{ marginVertical: spacing.xs }} />
      <SkeletonBone width={140} height={16} />
    </View>
    <SkeletonBone width={100} height={12} style={{ marginTop: spacing.sm }} />
  </View>
);

export const NotificationCardSkeleton: React.FC = () => (
  <View style={styles.notificationCard}>
    <View style={styles.row}>
      <SkeletonBone width={100} height={14} />
      <SkeletonBone width={40} height={12} />
    </View>
    <SkeletonBone width={'80%'} height={12} style={{ marginTop: spacing.sm }} />
    <SkeletonBone width={'60%'} height={12} style={{ marginTop: spacing.xs }} />
  </View>
);

export const StatsCardSkeleton: React.FC = () => (
  <View style={styles.statsCard}>
    {[1, 2, 3, 4].map((i) => (
      <View key={i} style={styles.statItem}>
        <SkeletonBone width={40} height={28} />
        <SkeletonBone width={50} height={12} style={{ marginTop: spacing.xs }} />
      </View>
    ))}
  </View>
);

export const SkeletonList: React.FC<{
  count: number;
  renderSkeleton: () => React.ReactElement;
}> = ({ count, renderSkeleton }) => (
  <View>
    {Array.from({ length: count }).map((_, i) => (
      <React.Fragment key={i}>{renderSkeleton()}</React.Fragment>
    ))}
  </View>
);

const styles = StyleSheet.create({
  matchCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  notificationCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamsBlock: {
    alignItems: 'center',
    marginVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
});
