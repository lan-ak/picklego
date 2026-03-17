import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Image,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Icon } from '../components/Icon';
import { InvitePlayersModal } from '../components/InvitePlayersModal';
import Layout from '../components/Layout';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import type { Player } from '../types';

const PlayersScreen: React.FC = () => {
  const { currentUser, players, getInvitedPlayers, isOutgoingInvitePending, removePlayer, refreshConnectedPlayers } = useData();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [showInviteModal, setShowInviteModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshConnectedPlayers();
    }, [refreshConnectedPlayers])
  );

  const invitedPlayers = useMemo(
    () => getInvitedPlayers(players),
    [players, currentUser],
  );

  const connectedPlayers = useMemo(() => {
    const invitedIds = new Set(invitedPlayers.map(p => p.id));
    return players.filter(p =>
      (!currentUser || p.id !== currentUser.id) && !invitedIds.has(p.id),
    );
  }, [players, currentUser, invitedPlayers]);

  const handleRemovePlayer = useCallback((player: Player) => {
    Alert.alert(
      'Remove Player',
      `Are you sure you want to remove ${player.name} from your contacts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const success = await removePlayer(player.id);
            if (success) {
              showToast(`${player.name} has been removed from your contacts.`, 'success');
            } else {
              Alert.alert('Error', 'Failed to remove player. You cannot remove yourself.');
            }
          },
        },
      ],
    );
  }, [removePlayer, showToast]);

  const getInviteStatus = (player: Player): string => {
    if (player.pendingClaim) return 'Pending';
    if (isOutgoingInvitePending(player.id)) return 'Invite Sent';
    return 'Connected';
  };

  const sections = useMemo(() => {
    const result: { title: string; data: Player[]; type: 'connected' | 'invited' }[] = [];
    if (connectedPlayers.length > 0) {
      result.push({ title: 'Connected Players', data: connectedPlayers, type: 'connected' });
    }
    if (invitedPlayers.length > 0) {
      result.push({ title: 'Invited Players', data: invitedPlayers, type: 'invited' });
    }
    return result;
  }, [connectedPlayers, invitedPlayers]);

  const renderConnectedPlayer = (player: Player) => (
    <View style={styles.playerRow}>
      <View style={styles.playerInfo}>
        {player.profilePic ? (
          <Image source={{ uri: player.profilePic }} style={styles.playerAvatar} />
        ) : (
          <View style={styles.playerAvatarPlaceholder}>
            <Text style={styles.playerAvatarText}>{player.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.playerDetails}>
          <Text style={styles.playerName}>{player.name}</Text>
          {player.email && <Text style={styles.playerSubtext}>{player.email}</Text>}
        </View>
      </View>
      <AnimatedPressable
        style={styles.removeButton}
        onPress={() => handleRemovePlayer(player)}
      >
        <Icon name="trash" size={20} color={colors.error} />
      </AnimatedPressable>
    </View>
  );

  const renderInvitedPlayer = (player: Player) => {
    const status = getInviteStatus(player);
    return (
      <View style={styles.playerRow}>
        <View style={styles.playerInfo}>
          <View style={styles.playerAvatarPlaceholder}>
            <Text style={styles.playerAvatarText}>{player.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.playerDetails}>
            <Text style={styles.playerName}>{player.name}</Text>
            <Text style={styles.playerSubtext}>{player.email || player.phoneNumber || ''}</Text>
          </View>
        </View>
        <View style={styles.invitedActions}>
          <View style={[
            styles.statusBadge,
            status === 'Connected' && styles.statusConnected,
            status === 'Invite Sent' && styles.statusSent,
            status === 'Pending' && styles.statusPending,
          ]}>
            <Text style={[
              styles.statusText,
              status === 'Connected' && styles.statusTextConnected,
              status === 'Invite Sent' && styles.statusTextSent,
              status === 'Pending' && styles.statusTextPending,
            ]}>
              {status}
            </Text>
          </View>
          <AnimatedPressable
            style={styles.removeButton}
            onPress={() => handleRemovePlayer(player)}
          >
            <Icon name="trash" size={18} color={colors.error} />
          </AnimatedPressable>
        </View>
      </View>
    );
  };

  return (
    <Layout title="Players">
      <View style={styles.container}>
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionTitle}>{section.title}</Text>
          )}
          renderItem={({ item, section }) =>
            section.type === 'connected'
              ? renderConnectedPlayer(item)
              : renderInvitedPlayer(item)
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: 80 + Math.max(insets.bottom, spacing.lg) }]}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icon name="users" size={48} color={colors.gray300} />
              <Text style={styles.emptyText}>No players yet</Text>
              <Text style={styles.emptySubtext}>
                Invite friends to start tracking matches together
              </Text>
            </View>
          }
        />

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <AnimatedPressable
            style={styles.inviteButton}
            onPress={() => setShowInviteModal(true)}
          >
            <Icon name="user-plus" size={20} color={colors.white} />
            <Text style={styles.inviteButtonText}>Invite Players</Text>
          </AnimatedPressable>
        </View>

        <InvitePlayersModal
          visible={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          context="settings"
        />
      </View>
    </Layout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    ...typography.label,
    color: colors.gray500,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
    ...shadows.sm,
  },
  playerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: spacing.md,
  },
  playerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  playerAvatarText: {
    color: colors.white,
    fontSize: 18,
    fontWeight: 'bold',
  },
  playerDetails: {
    flex: 1,
  },
  playerName: {
    ...typography.bodyLarge,
    fontWeight: '500',
    color: colors.neutral,
  },
  playerSubtext: {
    ...typography.bodySmall,
    color: colors.gray500,
    marginTop: 2,
  },
  removeButton: {
    padding: spacing.sm,
  },
  invitedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.gray100,
  },
  statusConnected: {
    backgroundColor: colors.primaryOverlay,
  },
  statusSent: {
    backgroundColor: colors.actionOverlay,
  },
  statusPending: {
    backgroundColor: colors.gray100,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.gray500,
  },
  statusTextConnected: {
    color: colors.primary,
  },
  statusTextSent: {
    color: colors.warning,
  },
  statusTextPending: {
    color: colors.gray500,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
    ...shadows.sm,
  },
  inviteButtonText: {
    ...typography.button,
    color: colors.white,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxxxl,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.bodyLarge,
    color: colors.gray500,
    fontWeight: '600',
  },
  emptySubtext: {
    ...typography.bodySmall,
    color: colors.gray400,
    textAlign: 'center',
  },
});

export default PlayersScreen;
