import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Icon } from './Icon';
import { AnimatedPressable } from './AnimatedPressable';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { formatMatchCardDate } from '../utils/dateFormat';
import { formatPlayerNameWithInitial } from '../utils/formatPlayerName';
import { Match, Game } from '../types';

type MatchCardProps = {
  match: Match;
  currentUserId?: string;
  getPlayerName?: (id: string) => string;
  onPress: () => void;
};

const MatchCard = ({
  match,
  currentUserId = '',
  getPlayerName = () => '',
  onPress,
}: MatchCardProps) => {
  const isOpen = match.isOpenInvite && match.openInviteStatus === 'open';
  const userTeam = match.team1PlayerIds.includes(currentUserId) ? 1
    : match.team2PlayerIds.includes(currentUserId) ? 2
    : null;
  const isCompleted = match.status === 'completed';
  const isWinner = isCompleted && match.winnerTeam === userTeam;
  const isLoser = isCompleted && userTeam !== null && match.winnerTeam !== userTeam;
  const isScheduled = match.status === 'scheduled' && !isOpen;

  const getTeamLabel = (teamIds: string[]) =>
    teamIds
      .map((id) => (id === currentUserId ? 'Me' : formatPlayerNameWithInitial(getPlayerName(id))))
      .join(' & ');

  const team1Label = getTeamLabel(match.team1PlayerIds);
  const team2Label = getTeamLabel(match.team2PlayerIds);

  const scoreText = match.games.length > 0
    ? match.games.map((g: Game) => `${g.team1Score}-${g.team2Score}`).join(', ')
    : null;

  // Open match player count
  const currentCount = (match.allPlayerIds || []).length;
  const maxPlayers = match.maxPlayers || (match.matchType === 'doubles' ? 4 : 2);

  return (
    <AnimatedPressable
      style={[
        styles.card,
        isOpen && styles.openBorder,
        isWinner && styles.winBorder,
        isLoser && styles.lossBorder,
        isScheduled && styles.scheduledBorder,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        isOpen
          ? `Open ${match.matchType} match, ${currentCount} of ${maxPlayers} players joined`
          : `${team1Label} vs ${team2Label}${isWinner ? ', Won' : isLoser ? ', Lost' : ''}`
      }
      accessibilityHint="View match details"
    >
      {/* Top row: date + status badge */}
      <View style={styles.topRow}>
        <Text style={styles.date}>
          {formatMatchCardDate(match.scheduledDate)}
        </Text>
        {isOpen && (
          <View style={[styles.badge, styles.openBadge]}>
            <Text style={[styles.badgeText, { color: colors.action, marginLeft: 0 }]}>Open</Text>
          </View>
        )}
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

      {/* Open match: player count with dots */}
      {isOpen ? (
        <View style={styles.playerCountContainer}>
          <View style={styles.playerCountRow}>
            <Icon name="users" size={14} color={colors.primary} />
            <Text style={styles.playerCountText}>
              {currentCount}/{maxPlayers} players
            </Text>
            <View style={styles.dots}>
              {Array.from({ length: maxPlayers }).map((_, i) => (
                <View
                  key={i}
                  style={[styles.dot, i < currentCount ? styles.dotFilled : styles.dotEmpty]}
                />
              ))}
            </View>
          </View>
        </View>
      ) : (
        /* Teams in gray surface container */
        <View style={styles.teamsContainer}>
          <Text style={styles.teamName}>{team1Label}</Text>
          <Text style={styles.vs}>vs</Text>
          <Text style={styles.teamName}>{team2Label}</Text>
        </View>
      )}

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
  openBorder: {
    borderLeftWidth: 4,
    borderLeftColor: colors.action,
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
  openBadge: {
    backgroundColor: colors.actionOverlay,
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
  playerCountContainer: {
    marginVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
  },
  playerCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  playerCountText: {
    ...typography.label,
    color: colors.primary,
  },
  dots: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 'auto',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotFilled: {
    backgroundColor: colors.primary,
  },
  dotEmpty: {
    backgroundColor: colors.gray200,
  },
});

export default MatchCard;
