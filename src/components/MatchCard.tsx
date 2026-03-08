import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import { Icon } from './Icon';
import { AnimatedPressable } from './AnimatedPressable';
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
    <AnimatedPressable
      style={[
        styles.card,
        isWinner && styles.winBorder,
        isLoser && styles.lossBorder,
        isScheduled && styles.scheduledBorder,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${team1Label} vs ${team2Label}${isWinner ? ', Won' : isLoser ? ', Lost' : ''}`}
      accessibilityHint="View match details"
    >
      {/* Top row: date + status badge */}
      <View style={styles.topRow}>
        <Text style={styles.date}>
          {format(new Date(match.scheduledDate), 'MMM d, yyyy - h:mm a')}
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
        {isCompleted && userTeam === null && (
          <View style={[styles.badge, styles.completedBadge]}>
            <Icon name="check-circle" size={14} color={colors.primary} />
            <Text style={[styles.badgeText, { color: colors.primary }]}>Completed</Text>
          </View>
        )}
      </View>

      {/* Match type info */}
      <Text style={styles.matchTypeInfo}>
        {match.matchType === 'doubles' ? 'Doubles' : 'Singles'} {'\u00B7'} {match.pointsToWin} pts {'\u00B7'} Best of {match.numberOfGames}
      </Text>

      {/* Teams in gray surface container */}
      <View style={styles.teamsContainer}>
        <Text style={styles.teamName}>{team1Label}</Text>
        <Text style={styles.vs}>vs</Text>
        <Text style={styles.teamName}>{team2Label}</Text>
      </View>

      {/* Score with green overlay background */}
      {isCompleted && scoreText && (
        <View style={styles.scoreContainer}>
          <Text style={styles.score}>{scoreText}</Text>
        </View>
      )}

      {/* Bottom: location */}
      {match.location ? (
        <View style={styles.bottomRow}>
          <View style={styles.locationRow}>
            <Icon name="map-pin" size={14} color={colors.gray400} />
            <Text style={styles.location}>{match.location}</Text>
          </View>
        </View>
      ) : null}
    </AnimatedPressable>
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
    ...typography.label,
    color: colors.primary,
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
  completedBadge: {
    backgroundColor: colors.winOverlay,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '600',
    marginLeft: 4,
  },
  matchTypeInfo: {
    ...typography.label,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  teamsContainer: {
    marginVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    alignItems: 'center',
  },
  teamName: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.neutral,
    textAlign: 'center',
    marginVertical: spacing.xs,
  },
  vs: {
    ...typography.bodySmall,
    color: colors.gray500,
    textAlign: 'center',
    marginVertical: spacing.sm,
    fontWeight: '500',
  },
  scoreContainer: {
    marginTop: spacing.md,
    backgroundColor: colors.primaryOverlay,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
  },
  score: {
    ...typography.scoreDisplay,
    color: colors.neutral,
    textAlign: 'center',
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
