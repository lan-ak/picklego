import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, Linking, Platform, ActivityIndicator } from 'react-native';
import Animated from 'react-native-reanimated';
import { useFadeIn } from '../hooks';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import MapView, { Marker } from 'react-native-maps';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Icon } from '../components/Icon';
import { Chip } from '../components/Chip';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import Layout from '../components/Layout';
import type { Match, Game } from '../types';
import { RootStackParamList } from '../types';
import { format } from 'date-fns';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import PicklePete from '../components/PicklePete';
import { shuffleTeams } from '../utils/shuffleTeams';
import { getMatchDocument } from '../config/firebase';

type MatchDetailsRouteProp = RouteProp<RootStackParamList, 'MatchDetails'>;
type MatchDetailsNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const MatchDetailsScreen = () => {
  const fadeStyle = useFadeIn();
  const route = useRoute<MatchDetailsRouteProp>();
  const navigation = useNavigation<MatchDetailsNavigationProp>();
  const { matches, players, deleteMatch, currentUser, getPlayerName, getNotificationsForMatch, sendMatchNotifications } = useData();
  const { showToast } = useToast();
  const [directMatch, setDirectMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(false);
  const match = matches.find(m => m.id === route.params.matchId) || directMatch;

  const getUserTeamNumber = useCallback((userId: string, match: Match): number | null => {
    if (match.team1PlayerIds.includes(userId)) return 1;
    if (match.team2PlayerIds.includes(userId)) return 2;
    return null;
  }, []);

  const isCurrentUserWinner = useCallback((match: Match): boolean => {
    if (!match.winnerTeam) return false;
    if (!currentUser) return false;

    const userTeam = getUserTeamNumber(currentUser.id, match);
    return match.winnerTeam === userTeam;
  }, [currentUser, getUserTeamNumber]);

  const isTeam1Winner = useCallback((match: Match): boolean => {
    return match.winnerTeam === 1;
  }, []);

  useEffect(() => {
    if (!matches.find(m => m.id === route.params.matchId) && !directMatch) {
      setLoading(true);
      getMatchDocument(route.params.matchId)
        .then(m => { if (m) setDirectMatch(m); })
        .finally(() => setLoading(false));
    }
  }, [route.params.matchId, matches.length]);

  if (loading) {
    return (
      <Layout title="Match Details" showBackButton={true}>
        <View style={styles.errorContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Layout>
    );
  }

  if (!match) {
    return (
      <Layout title="Match Details" showBackButton={true}>
        <View style={styles.errorContainer}>
          <PicklePete pose="error" size="sm" message="Match not found" />
        </View>
      </Layout>
    );
  }

  const handleCompleteMatch = () => {
    navigation.navigate('CompleteMatch', { matchId: match.id });
  };

  const handleEditMatch = () => {
    // Navigate to AddMatch screen with the match data for editing
    navigation.navigate('AddMatch', { matchId: match.id, isEditing: true });
  };

  const handleDeleteMatch = () => {
    const isScheduled = match.status === 'scheduled';
    Alert.alert(
      isScheduled ? 'Cancel Match' : 'Remove Match',
      isScheduled
        ? 'This will cancel the match for all players. They will be notified.'
        : 'Are you sure you want to remove this match from your history? Other players in this match will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isScheduled ? 'Cancel Match' : 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteMatch(match.id);
            navigation.goBack();
          }
        }
      ]
    );
  };

  const handleRematch = () => {
    if (match.matchType !== 'doubles' || !currentUser) return;

    Alert.alert(
      'Rematch',
      'How would you like to set up the rematch?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Same Teams',
          onPress: () => {
            navigation.navigate('AddMatch', {
              rematch: {
                team1PlayerIds: match.team1PlayerIds,
                team2PlayerIds: match.team2PlayerIds,
                pointsToWin: match.pointsToWin,
                numberOfGames: match.numberOfGames,
                location: match.location,
                locationCoords: match.locationCoords,
                isDoubles: true,
                randomizeTeamsPerGame: match.randomizeTeamsPerGame,
              },
            });
          },
        },
        {
          text: 'Random Teams',
          onPress: () => {
            const { team1, team2 } = shuffleTeams(match.allPlayerIds, currentUser.id);
            navigation.navigate('AddMatch', {
              rematch: {
                team1PlayerIds: team1,
                team2PlayerIds: team2,
                pointsToWin: match.pointsToWin,
                numberOfGames: match.numberOfGames,
                location: match.location,
                locationCoords: match.locationCoords,
                isDoubles: true,
                randomizeTeamsPerGame: match.randomizeTeamsPerGame,
              },
            });
          },
        },
      ]
    );
  };

  const formatPlayerNameWithInitial = (fullName: string) => {
    const parts = fullName.trim().split(' ');
    if (parts.length < 2) return fullName;
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  };

  const getTeamNames = (teamNumber: 1 | 2) => {
    try {
      const playerIds = teamNumber === 1 ? match.team1PlayerIds : match.team2PlayerIds;

      if (match.matchType !== 'doubles') {
        return getPlayerName(playerIds[0]);
      }

      return playerIds.map(id => getPlayerName(id)).join(' & ');
    } catch (error) {
      console.error('Error in getTeamNames:', error);
      return `Team ${teamNumber}`;
    }
  };

  const isUserInMatch = () => {
    if (!currentUser) return false;
    return match.allPlayerIds.includes(currentUser.id);
  };

  const getMatchResult = () => {
    if (!currentUser || match.status !== 'completed') return null;

    if (isUserInMatch()) {
      return isCurrentUserWinner(match) ? 'Win' : 'Loss';
    }
    return null;
  };

  const formatMatchDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'MMMM d, yyyy');
  };

  const formatMatchTime = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'h:mm a');
  };

  const getWinnerText = () => {
    if (!currentUser || match.status !== 'completed') return null;

    if (isUserInMatch()) {
      return isCurrentUserWinner(match) ? 'You are the winner!' : 'You lost the match.';
    }
    return null;
  };

  const matchNotifications = getNotificationsForMatch(match.id);

  const getPlayerNotificationStatus = (playerId: string) => {
    const notif = matchNotifications.find(n => n.recipientId === playerId);
    if (!notif) return null;
    return notif.status;
  };

  const handleResendNotifications = async () => {
    const result = await sendMatchNotifications(match);
    if (result.failed > 0) {
      showToast(`Failed to notify ${result.failed} player${result.failed > 1 ? 's' : ''}`, 'error');
    } else if (result.sent > 0) {
      showToast(`Notifications resent to ${result.sent} player${result.sent > 1 ? 's' : ''}`, 'success');
    }
  };

  const getTeamCardVariant = (teamNumber: 1 | 2): 'winner' | 'loser' | 'scheduled' | 'default' => {
    if (match.status === 'completed' && match.winnerTeam !== null) {
      const isWinner = teamNumber === 1 ? isTeam1Winner(match) : !isTeam1Winner(match);
      return isWinner ? 'winner' : 'loser';
    }
    if (match.status === 'scheduled') return 'scheduled';
    return 'default';
  };

  const renderTeamCard = (teamNumber: 1 | 2, showNotificationStatus: boolean) => {
    const playerIds = teamNumber === 1 ? match.team1PlayerIds : match.team2PlayerIds;
    const variant = getTeamCardVariant(teamNumber);
    const isWinner = variant === 'winner';

    return (
      <View
        style={[
          styles.teamCard,
          variant === 'winner' && styles.teamCardWinner,
          variant === 'loser' && styles.teamCardLoser,
          variant === 'scheduled' && styles.teamCardScheduled,
        ]}
        accessibilityLabel={`Team ${teamNumber}: ${getTeamNames(teamNumber)}${isWinner ? ', Winner' : ''}`}
      >
        <View style={styles.teamCardHeader}>
          <Text style={styles.teamLabel}>Team {teamNumber}</Text>
          {match.status === 'completed' && isWinner && (
            <View style={styles.winnerBadge}>
              <Icon name="trophy" size={12} color={colors.win} />
              <Text style={styles.winnerBadgeText}>Winner</Text>
            </View>
          )}
        </View>

        {playerIds.map(playerId => {
          const isMe = currentUser && playerId === currentUser.id;
          const name = isMe ? 'Me' : formatPlayerNameWithInitial(getPlayerName(playerId));

          let notifStatus: string | null = null;
          if (showNotificationStatus) {
            const player = players.find(p => p.id === playerId);
            const hasEmail = player?.email;
            notifStatus = isMe || !hasEmail ? null : getPlayerNotificationStatus(playerId);
          }

          return (
            <View key={playerId} style={styles.playerRowRedesigned}>
              <Icon
                name="user"
                size={16}
                color={
                  variant === 'winner' ? colors.win :
                  variant === 'loser' ? colors.loss :
                  colors.gray400
                }
                style={styles.playerIcon}
              />
              <Text
                style={[
                  styles.playerName,
                  variant === 'winner' && styles.winningTeamText,
                  variant === 'loser' && styles.losingTeamText,
                ]}
              >
                {name}
              </Text>
              {showNotificationStatus && notifStatus === 'sent' && (
                <View style={styles.notifStatusRow}>
                  <View style={[styles.notifBadge, styles.notifSent]}>
                    <Icon name="mail" size={12} color={colors.gray400} />
                    <Text style={[styles.notifBadgeText, styles.notifSentText]}>Sent</Text>
                  </View>
                  <AnimatedPressable onPress={handleResendNotifications} style={styles.resendButton}>
                    <Text style={styles.resendText}>Resend</Text>
                  </AnimatedPressable>
                </View>
              )}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <Layout title="Match Details" showBackButton={true}>
      <Animated.View style={[{ flex: 1 }, fadeStyle]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Match Header Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="calendar" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Match Details</Text>
          </View>

          <View style={styles.detailsRow}>
            <View style={styles.detailItem}>
              <Icon name="calendar" size={20} color={colors.primary} />
              <Text style={styles.detailText}>{formatMatchDate(match.scheduledDate)}</Text>
            </View>

            <View style={styles.detailItem}>
              <Icon name="clock" size={20} color={colors.primary} />
              <Text style={styles.detailText}>{formatMatchTime(match.scheduledDate)}</Text>
            </View>
          </View>

          {match.location && (
            <View style={styles.detailItem}>
              <Icon name="map-pin" size={20} color={colors.primary} />
              <Text style={styles.detailText}>{match.location}</Text>
            </View>
          )}

          {match.locationCoords && (
            <View style={styles.mapSection}>
              <View style={styles.mapWrapper}>
                <MapView
                  style={styles.mapView}
                  initialRegion={{
                    ...match.locationCoords,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                  scrollEnabled={false}
                  zoomEnabled={false}
                  pitchEnabled={false}
                  rotateEnabled={false}
                >
                  <Marker coordinate={match.locationCoords} />
                </MapView>
              </View>
              <AnimatedPressable
                style={styles.directionsButton}
                onPress={() => {
                  if (!match.locationCoords) return;
                  const { latitude, longitude } = match.locationCoords;
                  const label = encodeURIComponent(match.location || 'Match Location');
                  const url = Platform.select({
                    ios: `maps:0,0?q=${label}@${latitude},${longitude}`,
                    android: `geo:0,0?q=${latitude},${longitude}(${label})`,
                  });
                  if (url) Linking.openURL(url);
                }}
                accessibilityLabel="Get directions to match location"
                accessibilityRole="button"
              >
                <Icon name="navigation" size={18} color={colors.white} />
                <Text style={styles.directionsButtonText}>Get Directions</Text>
              </AnimatedPressable>
            </View>
          )}

          <View style={styles.matchTypeContainer}>
            <Chip label={match.matchType === 'doubles' ? 'Doubles' : 'Singles'} />
            <Chip label={`${match.pointsToWin} pts`} />
            <Chip label={`Best of ${match.numberOfGames}`} />
            <Chip
              variant={match.status === 'completed' ? 'success' : match.status === 'expired' ? 'warning' : 'info'}
              label={match.status === 'completed' ? 'Completed' : match.status === 'expired' ? 'Expired' : 'Scheduled'}
            />
          </View>
        </View>

        {/* Teams Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="users" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Teams</Text>
          </View>

          <View style={styles.teamsContainer}>
            {renderTeamCard(1, currentUser?.id === match.createdBy)}

            <View style={styles.vsSeparator}>
              <View style={styles.vsSeparatorLine} />
              <Text style={styles.vsSeparatorText}>vs</Text>
              <View style={styles.vsSeparatorLine} />
            </View>

            {renderTeamCard(2, currentUser?.id === match.createdBy)}
          </View>
        </View>

        {/* Results Section - Only for completed matches */}
        {match.status === 'completed' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="trophy" size={24} color={colors.primary} />
              <Text style={styles.sectionTitle}>Match Results</Text>
            </View>

            <View style={styles.resultContent}>
              <Text style={styles.resultLabel}>Final Score</Text>
              {match.games.length > 0 ? (
                match.randomizeTeamsPerGame && match.matchType === 'doubles' ? (
                  <View>
                    {match.games.map((g, i) => {
                      const t1Ids = g.team1PlayerIds || match.team1PlayerIds;
                      const t2Ids = g.team2PlayerIds || match.team2PlayerIds;
                      const t1Names = t1Ids.map(id => formatPlayerNameWithInitial(getPlayerName(id))).join(' & ');
                      const t2Names = t2Ids.map(id => formatPlayerNameWithInitial(getPlayerName(id))).join(' & ');
                      return (
                        <View key={i} style={styles.perGameResult}>
                          <Text style={styles.perGameLabel}>Game {i + 1}{i > 0 ? ' (shuffled)' : ''}</Text>
                          <Text style={styles.perGameScore}>
                            {t1Names}  {g.team1Score} - {g.team2Score}  {t2Names}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.scoreText}>
                    {match.games.map(g => `${g.team1Score}-${g.team2Score}`).join(', ')}
                  </Text>
                )
              ) : (
                <Text style={styles.scoreText}>No score recorded</Text>
              )}

              <Text style={styles.winnerText}>{getWinnerText()}</Text>
              {isUserInMatch() && isCurrentUserWinner(match) && (
                <PicklePete pose="win" size="sm" message="You won this one!" />
              )}
              {isUserInMatch() && !isCurrentUserWinner(match) && (
                <PicklePete pose="loss" size="sm" message="Tough match! Next time!" />
              )}
            </View>
          </View>
        )}

        {/* Action Buttons - Different buttons for scheduled vs completed */}
        {match.status === 'scheduled' && isUserInMatch() && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="wrench" size={24} color={colors.primary} />
              <Text style={styles.sectionTitle}>Actions</Text>
            </View>

            <View style={styles.actionButtons}>
              {currentUser?.id === match.createdBy && (
                <AnimatedPressable
                  style={[styles.button, styles.editButton]}
                  onPress={handleEditMatch}
                  accessibilityLabel="Edit match"
                  accessibilityRole="button"
                >
                  <Icon name="pencil" size={20} color={colors.white} />
                  <Text style={styles.buttonText}>Edit Match</Text>
                </AnimatedPressable>
              )}

              <AnimatedPressable
                style={[styles.button, styles.completeButton]}
                onPress={handleCompleteMatch}
                accessibilityLabel="Complete match"
                accessibilityRole="button"
              >
                <Icon name="check-circle" size={20} color={colors.white} />
                <Text style={styles.buttonText}>Complete Match</Text>
              </AnimatedPressable>
            </View>

            {isUserInMatch() && (
              <AnimatedPressable
                hapticStyle="heavy"
                style={[styles.button, styles.deleteButton]}
                onPress={handleDeleteMatch}
                accessibilityLabel="Remove match"
                accessibilityRole="button"
              >
                <Icon name="trash" size={20} color={colors.white} />
                <Text style={styles.buttonText}>Remove Match</Text>
              </AnimatedPressable>
            )}
          </View>
        )}

        {/* Rematch and Remove buttons for completed matches */}
        {match.status === 'completed' && isUserInMatch() && (
          <View style={styles.footer}>
            {match.matchType === 'doubles' && (
              <AnimatedPressable
                style={[styles.button, styles.rematchButton]}
                onPress={handleRematch}
                accessibilityLabel="Rematch"
                accessibilityRole="button"
                accessibilityHint="Create a new match with the same players"
              >
                <Icon name="repeat" size={20} color={colors.white} />
                <Text style={styles.buttonText}>Rematch</Text>
              </AnimatedPressable>
            )}
            <AnimatedPressable
              hapticStyle="heavy"
              style={[styles.button, styles.deleteButton]}
              onPress={handleDeleteMatch}
              accessibilityLabel="Remove match"
              accessibilityRole="button"
            >
              <Icon name="trash" size={20} color={colors.white} />
              <Text style={styles.buttonText}>Remove Match</Text>
            </AnimatedPressable>
          </View>
        )}
      </ScrollView>
      </Animated.View>
    </Layout>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  section: {
    backgroundColor: colors.white,
    margin: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    ...shadows.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.primary,
    marginLeft: spacing.sm,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  errorText: {
    ...typography.bodyLarge,
    color: colors.error,
    textAlign: 'center',
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  detailText: {
    ...typography.bodyLarge,
    color: colors.neutral,
    marginLeft: spacing.sm,
  },
  mapSection: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  mapWrapper: {
    height: 200,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  mapView: {
    ...StyleSheet.absoluteFillObject,
  },
  directionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.sm,
    gap: spacing.sm,
  },
  directionsButtonText: {
    ...typography.button,
    color: colors.white,
  },
  matchTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  teamsContainer: {
  },
  teamCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  teamCardWinner: {
    backgroundColor: colors.winOverlay,
    borderColor: '#81C784',
    borderLeftWidth: 4,
    borderLeftColor: colors.win,
  },
  teamCardLoser: {
    backgroundColor: colors.lossOverlay,
    borderColor: '#E57373',
    borderLeftWidth: 4,
    borderLeftColor: colors.loss,
  },
  teamCardScheduled: {
    borderLeftWidth: 4,
    borderLeftColor: colors.secondary,
  },
  teamCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  vsSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.xs,
  },
  vsSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.gray300,
  },
  vsSeparatorText: {
    ...typography.h3,
    color: colors.gray400,
    marginHorizontal: spacing.md,
  },
  winningTeamText: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  losingTeamText: {
    color: colors.loss,
  },
  resultContent: {
    alignItems: 'center',
    padding: spacing.lg,
  },
  resultLabel: {
    ...typography.bodyLarge,
    color: colors.gray500,
    marginBottom: spacing.sm,
  },
  scoreText: {
    ...typography.scoreDisplay,
    color: colors.primary,
    marginBottom: spacing.lg,
  },
  perGameResult: {
    marginBottom: spacing.sm,
  },
  perGameLabel: {
    ...typography.caption,
    color: colors.secondary,
    fontStyle: 'italic',
    marginBottom: 2,
  },
  perGameScore: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
  winnerText: {
    ...typography.h3,
    fontSize: 18,
    color: colors.neutral,
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
    flex: 1,
  },
  buttonText: {
    ...typography.button,
    color: colors.white,
    marginLeft: spacing.sm,
  },
  editButton: {
    backgroundColor: colors.primary,
  },
  completeButton: {
    backgroundColor: colors.primary,
  },
  deleteButton: {
    backgroundColor: colors.error,
  },
  rematchButton: {
    backgroundColor: colors.secondary,
  },
  footer: {
    padding: spacing.lg,
  },
  winnerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.winOverlay,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    gap: 4,
  },
  winnerBadgeText: {
    ...typography.caption,
    color: colors.win,
    fontWeight: '600',
  },
  teamLabel: {
    ...typography.bodySmall,
    color: colors.gray500,
    fontWeight: '600',
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  playerRowRedesigned: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  playerIcon: {
    marginRight: spacing.sm,
  },
  playerName: {
    ...typography.bodyLarge,
    color: colors.neutral,
    fontWeight: '600',
    flex: 1,
  },
  notifBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    gap: 4,
  },
  notifSent: {
    backgroundColor: colors.surface,
  },
  notifBadgeText: {
    ...typography.caption,
    fontSize: 11,
  },
  notifSentText: {
    color: colors.gray400,
  },
  notifStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  resendButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  resendText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.secondary,
    fontWeight: '600',
  },
});

export default MatchDetailsScreen;
