import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Animated from 'react-native-reanimated';
import { AnimatedPressable } from './AnimatedPressable';
import { Icon } from './Icon';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { staggeredEntrance } from '../hooks';
import { getInitials } from '../utils/getInitials';

interface PlayerSlot {
  id: string;
  name: string;
  profilePic?: string;
}

interface PlayerSlotsProps {
  players: PlayerSlot[];
  maxSlots: number;
  currentUserId?: string;
  onAddPlayer?: () => void;
  onRemovePlayer?: (playerId: string) => void;
}

export const PlayerSlots = ({ players, maxSlots, currentUserId, onAddPlayer, onRemovePlayer }: PlayerSlotsProps) => {
  const emptySlotCount = maxSlots - players.length;
  const showAddButton = onAddPlayer && emptySlotCount > 0;

  return (
    <View style={styles.container}>
      {players.map((player, index) => {
        const canRemove = onRemovePlayer && player.id !== currentUserId;
        return (
          <Animated.View key={player.id} entering={staggeredEntrance(index)} style={styles.slot}>
            <View>
              <View style={styles.filledCircle}>
                {player.profilePic ? (
                  <Image source={{ uri: player.profilePic }} style={styles.avatar} />
                ) : (
                  <Text style={styles.initials}>{getInitials(player.name)}</Text>
                )}
              </View>
              {canRemove && (
                <AnimatedPressable
                  onPress={() => onRemovePlayer(player.id)}
                  style={styles.removeBadge}
                  accessibilityLabel={`Remove ${player.name}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  scaleDown={0.85}
                >
                  <Icon name="x" size={12} color={colors.white} />
                </AnimatedPressable>
              )}
            </View>
            <Text style={styles.slotName} numberOfLines={1}>
              {player.id === currentUserId ? 'You' : player.name.split(' ')[0]}
            </Text>
          </Animated.View>
        );
      })}
      {showAddButton && (
        <Animated.View entering={staggeredEntrance(players.length)} style={styles.slot}>
          <AnimatedPressable
            onPress={onAddPlayer}
            style={styles.addCircle}
            accessibilityLabel="Add player"
            accessibilityRole="button"
          >
            <Icon name="plus" size={24} color={colors.primary} />
          </AnimatedPressable>
          <Text style={styles.slotLabel}>Add</Text>
        </Animated.View>
      )}
      {Array.from({ length: showAddButton ? emptySlotCount - 1 : emptySlotCount }).map((_, i) => (
        <Animated.View
          key={`empty-${i}`}
          entering={staggeredEntrance(players.length + (showAddButton ? 1 : 0) + i)}
          style={styles.slot}
        >
          <View style={styles.emptyCircle}>
            <Icon name="user" size={24} color={colors.gray300} />
          </View>
          <Text style={styles.slotLabel}>Open</Text>
        </Animated.View>
      ))}
    </View>
  );
};

const SLOT_SIZE = 64;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  slot: {
    alignItems: 'center',
    width: SLOT_SIZE + spacing.md,
  },
  filledCircle: {
    width: SLOT_SIZE,
    height: SLOT_SIZE,
    borderRadius: SLOT_SIZE / 2,
    backgroundColor: colors.primaryOverlay,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadows.sm,
  },
  avatar: {
    width: SLOT_SIZE,
    height: SLOT_SIZE,
    borderRadius: SLOT_SIZE / 2,
  },
  initials: {
    ...typography.bodyLarge,
    fontFamily: 'Fredoka_600SemiBold',
    color: colors.primary,
  },
  emptyCircle: {
    width: SLOT_SIZE,
    height: SLOT_SIZE,
    borderRadius: SLOT_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.gray300,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray100,
  },
  addCircle: {
    width: SLOT_SIZE,
    height: SLOT_SIZE,
    borderRadius: SLOT_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryOverlay,
  },
  removeBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  slotName: {
    ...typography.caption,
    color: colors.neutral,
    marginTop: spacing.xs,
    textAlign: 'center',
    fontFamily: 'Fredoka_500Medium',
  },
  slotLabel: {
    ...typography.caption,
    color: colors.gray400,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
