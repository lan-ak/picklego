import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { DismissableModal } from './DismissableModal';
import { AnimatedPressable } from './AnimatedPressable';
import { Icon } from './Icon';
import { PrimaryButton, SecondaryButton } from './Button';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { getInitials } from '../utils/getInitials';

interface PlayerInfo {
  id: string;
  name: string;
  profilePic?: string;
}

interface TeamAssignModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (team1: string[], team2: string[]) => void;
  initialTeam1: string[];
  initialTeam2: string[];
  players: PlayerInfo[];
  currentUserId?: string;
}

export const TeamAssignModal: React.FC<TeamAssignModalProps> = ({
  visible,
  onClose,
  onConfirm,
  initialTeam1,
  initialTeam2,
  players,
  currentUserId,
}) => {
  const [team1, setTeam1] = useState<string[]>(initialTeam1);
  const [team2, setTeam2] = useState<string[]>(initialTeam2);

  useEffect(() => {
    if (visible) {
      setTeam1(initialTeam1);
      setTeam2(initialTeam2);
    }
  }, [visible]);

  const halfSize = Math.floor((initialTeam1.length + initialTeam2.length) / 2);

  const swapPlayer = (playerId: string) => {
    if (team1.includes(playerId)) {
      setTeam1(prev => prev.filter(id => id !== playerId));
      setTeam2(prev => [...prev, playerId]);
    } else {
      setTeam2(prev => prev.filter(id => id !== playerId));
      setTeam1(prev => [...prev, playerId]);
    }
  };

  const getPlayer = (id: string): PlayerInfo => {
    return players.find(p => p.id === id) || { id, name: 'Player' };
  };

  const renderPlayerRow = (playerId: string, teamNumber: 1 | 2) => {
    const player = getPlayer(playerId);
    const isMe = playerId === currentUserId;
    const displayName = isMe ? 'You' : player.name.split(' ')[0];

    return (
      <AnimatedPressable
        key={playerId}
        style={styles.playerRow}
        onPress={() => swapPlayer(playerId)}
        accessibilityLabel={`Move ${player.name} to Team ${teamNumber === 1 ? 2 : 1}`}
        accessibilityRole="button"
      >
        <View style={styles.playerAvatar}>
          {player.profilePic ? (
            <Image source={{ uri: player.profilePic }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarInitials}>{getInitials(player.name)}</Text>
          )}
        </View>
        <Text style={styles.playerName}>{displayName}</Text>
        <Icon name="repeat" size={14} color={colors.gray400} />
      </AnimatedPressable>
    );
  };

  const isValid = team1.length === halfSize && team2.length === halfSize;

  return (
    <DismissableModal visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <View style={styles.modal}>
          <Text style={styles.title}>Assign Teams</Text>
          <Text style={styles.subtitle}>Tap a player to swap them to the other team</Text>

          <View style={styles.teamsRow}>
            <View style={styles.teamColumn}>
              <Text style={styles.teamLabel}>Team 1</Text>
              {team1.map(id => renderPlayerRow(id, 1))}
            </View>

            <View style={styles.divider} />

            <View style={styles.teamColumn}>
              <Text style={styles.teamLabel}>Team 2</Text>
              {team2.map(id => renderPlayerRow(id, 2))}
            </View>
          </View>

          <View style={styles.actions}>
            <SecondaryButton
              title="Cancel"
              onPress={onClose}
              style={styles.actionButton}
            />
            <PrimaryButton
              title="Confirm"
              onPress={() => onConfirm(team1, team2)}
              disabled={!isValid}
              style={styles.actionButton}
            />
          </View>
        </View>
      </View>
    </DismissableModal>
  );
};

const AVATAR_SIZE = 40;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modal: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 400,
    ...shadows.md,
  },
  title: {
    ...typography.h3,
    color: colors.neutral,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodySmall,
    color: colors.gray500,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  teamsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  teamColumn: {
    flex: 1,
  },
  teamLabel: {
    ...typography.bodyLarge,
    fontFamily: 'Fredoka_600SemiBold',
    color: colors.neutral,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: colors.gray200,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
  },
  playerAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.primaryOverlay,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
  },
  avatarInitials: {
    ...typography.caption,
    fontFamily: 'Fredoka_600SemiBold',
    color: colors.primary,
  },
  playerName: {
    ...typography.bodySmall,
    color: colors.neutral,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  actionButton: {
    flex: 1,
  },
});
