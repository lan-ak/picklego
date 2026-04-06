import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, Linking, Platform, ActivityIndicator, Share } from 'react-native';
import Animated from 'react-native-reanimated';
import { useFadeIn, useHaptic } from '../hooks';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { doc, onSnapshot } from 'firebase/firestore';
import MapView, { Marker } from 'react-native-maps';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { PrimaryButton, DangerButton } from '../components/Button';
import { Icon } from '../components/Icon';
import { Chip } from '../components/Chip';
import { Section } from '../components/Section';
import { PlayerSlots } from '../components/PlayerSlots';
import { TeamAssignModal } from '../components/TeamAssignModal';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import Layout from '../components/Layout';
import { formatPlayerNameWithInitial } from '../utils/formatPlayerName';
import type { Match, Game, MatchNotification } from '../types';
import { RootStackParamList } from '../types';
import { formatFullDate, formatTime } from '../utils/dateFormat';
import { buildMatchShareMessage } from '../utils/shareMatch';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import PicklePete from '../components/PicklePete';
import { shuffleTeams } from '../utils/shuffleTeams';
import { db, getMatchDocument, callResendMatchNotifications } from '../config/firebase';
import { generateOpenMatchLink } from '../services/appsflyer';
import { usePlacement } from 'expo-superwall';
import { PLACEMENTS } from '../services/superwallPlacements';

type MatchDetailsRouteProp = RouteProp<RootStackParamList, 'MatchDetails'>;
type MatchDetailsNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const MatchDetailsScreen = () => {
  const fadeStyle = useFadeIn();
  const route = useRoute<MatchDetailsRouteProp>();
  const navigation = useNavigation<MatchDetailsNavigationProp>();
  const { matches, players, deleteMatch, currentUser, getPlayerName, getNotificationsForMatch, joinOpenMatch, leaveOpenMatch, cancelOpenMatch, updateMatch } = useData();
  const { showToast } = useToast();
  const triggerHaptic = useHaptic();
  const { registerPlacement } = usePlacement();
  const [directMatch, setDirectMatch] = useState<Match | null>(null);
  const [liveMatch, setLiveMatch] = useState<Match | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [matchNotifications, setMatchNotifications] = useState<MatchNotification[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const contextMatch = matches.find(m => m.id === route.params.matchId);
  const match = liveMatch || contextMatch || directMatch;

  // Open invite derived state
  const isOpenInvite = match?.isOpenInvite === true;
  const isCreator = currentUser?.id === match?.createdBy;
  const isJoined = match?.allPlayerIds?.includes(currentUser?.id || '') || false;
  const isInPool = match?.playerPool?.includes(currentUser?.id || '') || false;
  const currentCount = (match?.allPlayerIds || []).length;
  const maxPlayers = match?.maxPlayers || (match?.matchType === 'doubles' ? 4 : 2);
  const isFull = match?.openInviteStatus === 'full' || (isOpenInvite && currentCount >= maxPlayers);
  const isOpen = isOpenInvite && match?.openInviteStatus === 'open' && !isFull;
  const isOpenCancelled = isOpenInvite && (match?.openInviteStatus === 'cancelled' || match?.status === 'expired');
  const isOpenFilling = isOpen && !isFull;
  const isOpenFull = isOpenInvite && isFull;
  const teamsEmpty = isOpenFull && match && (match.team1PlayerIds || []).length === 0;
  const teamsAssigned = match ? (match.team1PlayerIds || []).length > 0 && (match.team2PlayerIds || []).length > 0 : false;

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

  // Real-time listener for open invite matches
  useEffect(() => {
    const matchId = route.params.matchId;
    const existing = matches.find(m => m.id === matchId);
    const isOpenInviteMatch = existing?.isOpenInvite || directMatch?.isOpenInvite || liveMatch?.isOpenInvite;

    // For open invite matches, use real-time listener
    if (isOpenInviteMatch || (!existing && !directMatch)) {
      // If we don't know if it's open invite yet, try one-time fetch first
      if (!existing && !directMatch && !liveMatch) {
        setLoading(true);
        getMatchDocument(matchId)
          .then(m => {
            if (m) {
              if (m.isOpenInvite) {
                setLiveMatch(m); // Will be replaced by onSnapshot
              } else {
                setDirectMatch(m);
              }
            }
          })
          .finally(() => setLoading(false));
      }
    }

    // Subscribe to real-time updates for open invite matches
    if (isOpenInviteMatch) {
      const unsubscribe = onSnapshot(
        doc(db, 'matches', matchId),
        (snapshot) => {
          if (snapshot.exists()) {
            setLiveMatch({ id: snapshot.id, ...snapshot.data() } as Match);
          } else {
            setLiveMatch(null);
          }
          setLoading(false);
        },
        (error) => {
          console.error('MatchDetails: onSnapshot error', error);
          setLoading(false);
        }
      );
      return unsubscribe;
    }
  }, [route.params.matchId, matches.length, directMatch?.isOpenInvite, liveMatch?.isOpenInvite]);

  // Auto-shuffle teams when open match is full but teams haven't been assigned yet
  useEffect(() => {
    if (teamsEmpty && isCreator && currentUser && match) {
      const { team1, team2 } = shuffleTeams(match.allPlayerIds, currentUser.id);
      updateMatch(match.id, {
        team1PlayerIds: team1,
        team2PlayerIds: team2,
        team1PlayerNames: team1.map(id => getPlayerName(id)),
        team2PlayerNames: team2.map(id => getPlayerName(id)),
        openInviteStatus: 'full',
      });
    }
  }, [teamsEmpty]);

  useEffect(() => {
    if (!match) return;
    getNotificationsForMatch(match.id).then(setMatchNotifications);
  }, [match?.id]);

  // --- Open invite handlers (must be before early returns to satisfy Rules of Hooks) ---

  const handleShare = useCallback(async () => {
    if (!match) return;
    try {
      const link = await generateOpenMatchLink(match.id);
      const message = buildMatchShareMessage({
        link,
        scheduledDate: match.scheduledDate,
        location: match.location,
        matchType: match.matchType,
        numberOfGames: match.numberOfGames,
        pointsToWin: match.pointsToWin,
        currentPlayers: currentCount,
        maxPlayers,
      });

      await Share.share({ message });
    } catch (error) {
      console.error('Share error:', error);
    }
  }, [match, currentCount, maxPlayers]);

  const handleJoin = useCallback(async () => {
    if (!match) return;
    setActionLoading(true);
    try {
      const result = await joinOpenMatch(match.id);
      if (result.joined) {
        triggerHaptic('success');
        showToast(result.isFull ? 'Match is full! Teams randomized.' : 'Joined the match!', 'success');
      }
    } catch (error: any) {
      showToast(error?.message || 'Failed to join match', 'error');
    } finally {
      setActionLoading(false);
    }
  }, [match, joinOpenMatch, triggerHaptic, showToast]);

  const handleLeave = useCallback(async () => {
    if (!match) return;
    Alert.alert('Leave Match', 'Are you sure you want to leave this open match?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try {
            await leaveOpenMatch(match.id);
            showToast('Left the match', 'success');
            navigation.goBack();
          } catch (error: any) {
            showToast(error?.message || 'Failed to leave match', 'error');
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  }, [match, leaveOpenMatch, showToast, navigation]);

  const handleCancelInvite = useCallback(async () => {
    if (!match) return;
    Alert.alert('Cancel Match', 'Are you sure you want to cancel this open match? All joined players will be notified.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel Match',
        style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try {
            await cancelOpenMatch(match.id);
            showToast('Match cancelled', 'success');
            navigation.goBack();
          } catch (error: any) {
            showToast(error?.message || 'Failed to cancel match', 'error');
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  }, [match, cancelOpenMatch, showToast, navigation]);

  const handleShuffle = useCallback(async () => {
    if (!match || !currentUser) return;
    const { team1, team2 } = shuffleTeams(match.allPlayerIds, currentUser.id);
    try {
      await updateMatch(match.id, {
        team1PlayerIds: team1,
        team2PlayerIds: team2,
        team1PlayerNames: team1.map(id => getPlayerName(id)),
        team2PlayerNames: team2.map(id => getPlayerName(id)),
      });
      triggerHaptic('success');
      showToast('Teams reshuffled!', 'success');
    } catch (error) {
      showToast('Failed to shuffle teams', 'error');
    }
  }, [match, currentUser, updateMatch, getPlayerName, triggerHaptic, showToast]);

  const handleOpenAssignConfirm = useCallback(async (team1: string[], team2: string[]) => {
    if (!match) return;
    try {
      await updateMatch(match.id, {
        team1PlayerIds: team1,
        team2PlayerIds: team2,
        team1PlayerNames: team1.map(id => getPlayerName(id)),
        team2PlayerNames: team2.map(id => getPlayerName(id)),
      });
      setShowAssignModal(false);
      triggerHaptic('success');
      showToast('Teams updated!', 'success');
    } catch (error) {
      showToast('Failed to update teams', 'error');
    }
  }, [match, updateMatch, getPlayerName, triggerHaptic, showToast]);

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
      <Layout title={"Match Details"} showBackButton={true}>
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
          onPress: () => {
            deleteMatch(match.id);
            navigation.goBack();
          }
        }
      ]
    );
  };

  const handleRematch = async () => {
    if (match.matchType !== 'doubles' || !currentUser) return;

    // Superwall: fire placement for analytics (non-blocking)
    registerPlacement({ placement: PLACEMENTS.REMATCH });

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
        {
          text: 'Pick Teams',
          onPress: () => setShowAssignModal(true),
        },
      ]
    );
  };

  const handlePickTeamsConfirm = (team1: string[], team2: string[]) => {
    setShowAssignModal(false);
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
  };

  // Player slot data for open invite filling state
  const playerSlots = (match?.allPlayerIds || []).map(id => {
    const player = players.find(p => p.id === id);
    const poolIndex = (match?.playerPool || []).indexOf(id);
    const name = player?.name || (poolIndex >= 0 ? (match?.playerPoolNames?.[poolIndex] || 'Player') : getPlayerName(id));
    return { id, name, profilePic: player?.profilePic };
  });

  const teamPlayerInfos = (match?.allPlayerIds || []).map(id => {
    const player = players.find(p => p.id === id);
    return { id, name: player?.name || getPlayerName(id), profilePic: player?.profilePic };
  });

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

  const formatMatchDate = (dateString: string) => formatFullDate(dateString);

  const formatMatchTime = (dateString: string) => formatTime(dateString);

  const getWinnerText = () => {
    if (!currentUser || match.status !== 'completed') return null;

    if (isUserInMatch()) {
      return isCurrentUserWinner(match) ? 'You are the winner!' : 'You lost the match.';
    }
    return null;
  };

  const getPlayerNotificationStatus = (playerId: string) => {
    const notif = matchNotifications.find(n => n.recipientId === playerId);
    if (!notif) return null;
    return notif.status;
  };

  const handleResendNotifications = async () => {
    try {
      const result = await callResendMatchNotifications(match.id);
      if (result.sent > 0) {
        showToast(`Notifications resent to ${result.sent} player${result.sent > 1 ? 's' : ''}`, 'success');
      }
    } catch (error) {
      console.error('Error resending notifications:', error);
      showToast('Failed to resend notifications', 'error');
    }
    // Refresh notification statuses after resend
    getNotificationsForMatch(match.id).then(setMatchNotifications);
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
    <Layout title={"Match Details"} showBackButton={true}>
      <Animated.View style={[{ flex: 1 }, fadeStyle]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Match Header Section */}
        <Section title="Match Details" icon="calendar" headerBorder style={{ marginBottom: spacing.sm }}>
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
              variant={isOpenCancelled ? 'warning' : isOpenInvite ? 'info' : match.status === 'completed' ? 'success' : match.status === 'expired' ? 'warning' : 'info'}
              label={isOpenCancelled ? 'Cancelled' : isOpenFilling ? 'Open' : isOpenFull ? 'Full' : match.status === 'completed' ? 'Completed' : match.status === 'expired' ? 'Expired' : 'Scheduled'}
            />
          </View>
        </Section>

        {/* Open Invite: Player Slots (filling state) */}
        {isOpenFilling && (
          <Section title={`Players (${currentCount}/${maxPlayers})`} card={false} style={{ marginTop: spacing.xxl }}>
            <PlayerSlots
              players={playerSlots}
              maxSlots={maxPlayers}
              currentUserId={currentUser?.id}
            />
          </Section>
        )}

        {/* Open Invite: Cancelled banner */}
        {isOpenCancelled && (
          <View style={[styles.statusCard, styles.cancelledCard]}>
            <Text style={styles.statusTitle}>
              {match.status === 'expired' ? 'Match expired' : 'Match cancelled'}
            </Text>
            <Text style={styles.statusSubtitle}>This open match is no longer active.</Text>
          </View>
        )}

        {/* Teams Section - show when teams are actually assigned */}
        {teamsAssigned && !isOpenFilling && !isOpenCancelled && (
          <Section title="Teams" icon="users" headerBorder style={{ marginBottom: spacing.sm }}>
            <View style={styles.teamsContainer}>
              {renderTeamCard(1, currentUser?.id === match.createdBy)}

              <View style={styles.vsSeparator}>
                <View style={styles.vsSeparatorLine} />
                <Text style={styles.vsSeparatorText}>vs</Text>
                <View style={styles.vsSeparatorLine} />
              </View>

              {renderTeamCard(2, currentUser?.id === match.createdBy)}
            </View>
            {isCreator && match.matchType === 'doubles' && isOpenFull && (
              <View style={styles.textActions}>
                <AnimatedPressable onPress={handleShuffle} style={styles.textAction}>
                  <Icon name="shuffle" size={16} color={colors.secondary} />
                  <Text style={styles.textActionLabel}>Shuffle Teams</Text>
                </AnimatedPressable>
                <AnimatedPressable onPress={() => setShowAssignModal(true)} style={styles.textAction}>
                  <Icon name="pencil" size={16} color={colors.secondary} />
                  <Text style={styles.textActionLabel}>Assign Teams</Text>
                </AnimatedPressable>
              </View>
            )}
          </Section>
        )}

        {/* Results Section - Only for completed matches */}
        {match.status === 'completed' && (
          <Section title="Match Results" icon="trophy" headerBorder style={{ marginBottom: spacing.sm }}>
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
          </Section>
        )}

        {/* Actions Section */}
        {match.status !== 'completed' && !isOpenCancelled && (
          <Section title="Actions" icon="wrench" headerBorder style={{ marginBottom: spacing.sm }}>
            {/* Open Invite Full: same Edit/Complete actions + shuffle/assign text CTAs */}
            {isOpenFull && teamsAssigned && (
              <>
                <View style={styles.actionButtons}>
                  {isCreator && (
                    <PrimaryButton
                      title="Edit Match"
                      icon="pencil"
                      onPress={handleEditMatch}
                      style={{ flex: 1 }}
                    />
                  )}
                  <PrimaryButton
                    title="Complete Match"
                    icon="check-circle"
                    onPress={handleCompleteMatch}
                    style={{ flex: 1 }}
                  />
                </View>
                <DangerButton
                  title="Remove Match"
                  icon="trash"
                  onPress={handleDeleteMatch}
                />
              </>
            )}

            {/* Open Invite Filling: Share/Cancel (creator) or Join/Leave */}
            {isOpenFilling && (
              <>
                {isCreator && (
                  <View style={styles.actionButtons}>
                    <PrimaryButton
                      title="Share Link"
                      icon="share-2"
                      onPress={handleShare}
                      style={{ flex: 1 }}
                    />
                  </View>
                )}

                {!isJoined && !isCreator && (
                  <View style={styles.actionButtons}>
                    <PrimaryButton
                      title="Join Match"
                      icon="user-plus"
                      onPress={handleJoin}
                      loading={actionLoading}
                      style={{ flex: 1 }}
                    />
                  </View>
                )}

                {isInPool && !isCreator && (
                  <DangerButton
                    title="Leave Match"
                    icon="log-out"
                    onPress={handleLeave}
                    loading={actionLoading}
                  />
                )}

                {isCreator && (
                  <DangerButton
                    title="Cancel Invite"
                    icon="x"
                    onPress={handleCancelInvite}
                    loading={actionLoading}
                  />
                )}
              </>
            )}

            {/* Scheduled (non-open): Edit/Complete/Remove */}
            {!isOpenInvite && match.status === 'scheduled' && isUserInMatch() && (
              <>
                <View style={styles.actionButtons}>
                  {currentUser?.id === match.createdBy && (
                    <PrimaryButton
                      title="Edit Match"
                      icon="pencil"
                      onPress={handleEditMatch}
                      style={{ flex: 1 }}
                    />
                  )}
                  <PrimaryButton
                    title="Complete Match"
                    icon="check-circle"
                    onPress={handleCompleteMatch}
                    style={{ flex: 1 }}
                  />
                </View>
                <DangerButton
                  title="Remove Match"
                  icon="trash"
                  onPress={handleDeleteMatch}
                />
              </>
            )}
          </Section>
        )}

        {/* Remove button for expired matches */}
        {match.status === 'expired' && isUserInMatch() && (
          <View style={styles.footer}>
            <DangerButton
              title="Remove Match"
              icon="trash"
              onPress={handleDeleteMatch}
              style={{ flex: 1 }}
            />
          </View>
        )}

        {/* Rematch and Remove buttons for completed matches */}
        {match.status === 'completed' && isUserInMatch() && (
          <View style={styles.footer}>
            {match.matchType === 'doubles' && (
              <PrimaryButton
                title="Rematch"
                icon="repeat"
                onPress={handleRematch}
                style={{ flex: 1, backgroundColor: colors.secondary }}
                accessibilityHint="Create a new match with the same players"
              />
            )}
            <DangerButton
              title="Remove Match"
              icon="trash"
              onPress={handleDeleteMatch}
              style={{ flex: 1 }}
            />
          </View>
        )}
      </ScrollView>
      </Animated.View>
      {match.matchType === 'doubles' && (
        <TeamAssignModal
          visible={showAssignModal}
          onClose={() => setShowAssignModal(false)}
          onConfirm={isOpenFull ? handleOpenAssignConfirm : handlePickTeamsConfirm}
          initialTeam1={match.team1PlayerIds || []}
          initialTeam2={match.team2PlayerIds || []}
          players={teamPlayerInfos}
          currentUserId={currentUser?.id}
        />
      )}
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
  footer: {
    padding: spacing.lg,
    gap: spacing.md,
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
  // Open invite styles
  textActions: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  textAction: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  textActionLabel: {
    ...typography.bodySmall,
    color: colors.secondary,
    fontWeight: '600' as const,
  },
  statusCard: {
    backgroundColor: colors.winOverlay,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center' as const,
    marginTop: spacing.xxl,
    marginHorizontal: spacing.lg,
  },
  cancelledCard: {
    backgroundColor: colors.lossOverlay,
  },
  statusTitle: {
    ...typography.h3,
    color: colors.neutral,
  },
  statusSubtitle: {
    ...typography.bodySmall,
    color: colors.gray500,
    marginTop: spacing.xs,
  },
});

export default MatchDetailsScreen;
