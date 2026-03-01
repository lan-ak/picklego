// Avoid showing on data-heavy screens (match history lists, stats grids)

import React from 'react';
import { View, Text, Image, ImageSourcePropType, StyleSheet } from 'react-native';
import { typography, spacing } from '../theme';

type PetePose = 'high-five' | 'stopwatch' | 'welcome' | 'win' | 'loss' | 'invite' | 'error';

type PicklePeteProps = {
  pose: PetePose;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  message?: string;
};

const POSE_IMAGES: Record<PetePose, ImageSourcePropType> = {
  welcome: require('../../assets/mascot/pete-hello.png'),
  'high-five': require('../../assets/mascot/pete-happy.png'),
  win: require('../../assets/mascot/pete-happy.png'),
  stopwatch: require('../../assets/mascot/pete-dynamic.png'),
  loss: require('../../assets/mascot/pete-good-sport.png'),
  invite: require('../../assets/mascot/pete-coach.png'),
  error: require('../../assets/mascot/pete-confused.png'),
};

const SIZES = {
sm: { width: 120, height: 65 },
  md: { width: 180, height: 98 },
  lg: { width: 240, height: 131 },
  xl: { width: 320, height: 174 },
};

const PicklePete = ({ pose, size = 'md', message }: PicklePeteProps) => {
  const dimensions = SIZES[size];

  return (
    <View style={styles.wrapper}>
      <Image
        source={POSE_IMAGES[pose]}
        style={{ width: dimensions.width, height: dimensions.height }}
        resizeMode="contain"
      />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    padding: spacing.lg,
  },
  message: {
    ...typography.bodySmall,
    color: '#333333',
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});

export default PicklePete;
