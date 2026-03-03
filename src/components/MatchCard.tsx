import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Icon } from './Icon';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { Match, Game } from '../types';

type MatchCardProps = {
  match: Match;
  currentUserId: string;
  getPlayerName: (id: string) => string;
  onPress: () => void;
  formatPlayerNameWithInitial?: (name: string) => string;
};

const defaultFormatName = (fullName: string) => {
  const parts = fullName.trim().split(' ');
  if (parts.length < 2) return fullName;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
};

const MatchCard = ({
  match,
  currentUserId,
  getPlayerName,
  onPress,
  formatPlayerNameWithInitial = defaultFormatName,
}: MatchCardProps) => {
  const userTeam = match.team1PlayerIds.includes(currentUserId) ? 1
    : match.team2PlayerIds.includes(currentUserId) ? 2
    : null;
  const isCompleted = match.status === 'completed';
  const isWinner = isCompleted && match.winnerTeam === userTeam;
  const isLoser = isCompleted && userTeam !== null && match.winnerTeam !== userTeam;
  const isScheduled = match.status === 'scheduled';

  const getTeamLabel = (teamIds: string[]) =>
    teamIds
      .map((id) => (id === currentUserId ? 'Me' : formatPlayerNameWithInitial(getPlayerName(id))))
      .join(' & ');

  const team1Label = getTeamLabel(match.team1PlayerIds);
  const team2Label = getTeamLabel(match.team2PlayerIds);

  const scoreText = match.games.length > 0
    ? match.games.map((g: Game) => `${g.team1Score}-${g.team2Score}`).join(', ')
    : null;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isWinner && styles.winBorder,
        isLoser && styles.lossBorder,
        isScheduled && styles.scheduledBorder,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${team1Label} vs ${team2Label}${isWinner ? ', Won' : isLoser ? ', Lost' : ''}`}
      accessibilityHint="View match details"
    >
      {/* Top row: date + status badge */}
      <View style={styles.topRow}>
        <Text style={styles.date}>
          {new Date(match.scheduledDate).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </Text>
        {isWinner && (
          <View style={[styles.badge, styles.winBadge]}>
            <Icon name="trophy" size={14} color={colors.win} />
            <Text style={[styles.badgeText, { color: colors.win }]}>Won</Text>
          </View>
        )}
        {isLoser && (
          <View style={[styles.badge, styles.lossBadge]}>
            <Text style={[styles.badgeText, { color: colors.loss }]}>Lost</Text>
          </View>
        )}
        {isScheduled && (
          <View style={[styles.badge, styles.scheduledBadge]}>
            <Text style={[styles.badgeText, { color: colors.secondary }]}>Scheduled</Text>
          </View>
        )}
      </View>

      {/* Center: teams + "vs" with scores */}
      <View style={styles.teamsRow}>
        <Text style={styles.teamName}>{team1Label}</Text>
        <Text style={styles.vs}>vs</Text>
        <Text style={styles.teamName}>{team2Label}</Text>
      </View>

      {scoreText && <Text style={styles.score}>{scoreText}</Text>}

      {/* Bottom: location + GG placeholder */}
      <View style={styles.bottomRow}>
        {match.location ? (
          <View style={styles.locationRow}>
            <Icon name="map-pin" size={14} color={colors.gray400} />
            <Text style={styles.location}>{match.location}</Text>
          </View>
        ) : (
          <View />
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  winBorder: {
    borderLeftWidth: 4,
    borderLeftColor: colors.win,
  },
  lossBorder: {
    borderLeftWidth: 4,
    borderLeftColor: colors.loss,
  },
  scheduledBorder: {
    borderLeftWidth: 4,
    borderLeftColor: colors.secondary,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  date: {
    ...typography.bodySmall,
    color: colors.gray500,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  winBadge: {
    backgroundColor: colors.winOverlay,
  },
  lossBadge: {
    backgroundColor: colors.lossOverlay,
  },
  scheduledBadge: {
    backgroundColor: colors.secondaryOverlay,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '600',
    marginLeft: 4,
  },
  teamsRow: {
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  teamName: {
    ...typography.bodyLarge,
    color: colors.neutral,
    textAlign: 'center',
  },
  vs: {
    ...typography.h3,
    color: colors.gray400,
    marginVertical: spacing.xs,
  },
  score: {
    ...typography.scoreDisplay,
    color: colors.neutral,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  location: {
    ...typography.caption,
    color: colors.gray400,
    marginLeft: spacing.xs,
  },
});

export default MatchCard;
