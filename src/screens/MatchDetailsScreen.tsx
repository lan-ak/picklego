import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, ScrollView } from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { Icon } from '../components/Icon';
import { useData } from '../context/DataContext';
import Layout from '../components/Layout';
import type { Match, Game } from '../types';
import { RootStackParamList } from '../types';
import { format } from 'date-fns';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import PicklePete from '../components/PicklePete';

type MatchDetailsRouteProp = RouteProp<RootStackParamList, 'MatchDetails'>;
type MatchDetailsNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const MatchDetailsScreen = () => {
  const route = useRoute<MatchDetailsRouteProp>();
  const navigation = useNavigation<MatchDetailsNavigationProp>();
  const { matches, players, deleteMatch, currentUser, getPlayerName } = useData();
  const match = matches.find(m => m.id === route.params.matchId);

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
    Alert.alert(
      'Delete Match',
      'Are you sure you want to delete this match? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteMatch(match.id);
            navigation.goBack();
          }
        }
      ]
    );
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

  return (
    <Layout title="Match Details" showBackButton={true}>
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

          <View style={styles.matchTypeContainer}>
            <View style={styles.chipContainer}>
              <Text style={styles.chipText}>
                {match.matchType === 'doubles' ? 'Doubles' : 'Singles'}
              </Text>
            </View>

            <View style={styles.chipContainer}>
              <Text style={styles.chipText}>
                {match.pointsToWin} pts
              </Text>
            </View>

            <View style={styles.chipContainer}>
              <Text style={styles.chipText}>
                Best of {match.numberOfGames}
              </Text>
            </View>

            <View style={[styles.chipContainer, match.status === 'completed' ? styles.completedChip : match.status === 'expired' ? styles.expiredChip : styles.scheduledChip]}>
              <Text style={[styles.chipText, match.status === 'completed' ? styles.completedChipText : match.status === 'expired' ? styles.expiredChipText : styles.scheduledChipText]}>
                {match.status === 'completed' ? 'Completed' : match.status === 'expired' ? 'Expired' : 'Scheduled'}
              </Text>
            </View>
          </View>
        </View>

        {/* Teams Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="users" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Teams</Text>
          </View>

          <View style={styles.teamsContainer}>
            <View
              style={[
                styles.teamCard,
                match.status === 'completed' && (isTeam1Winner(match) ? styles.winnerTeam : styles.loserTeam)
              ]}
              accessibilityLabel={`Team 1: ${getTeamNames(1)}${match.status === 'completed' && isTeam1Winner(match) ? ', Winner' : ''}`}
            >
              <Text style={styles.teamLabel}>Team 1</Text>
              <Text style={styles.playerNames}>{getTeamNames(1)}</Text>
            </View>

            <View style={styles.vsContainer}>
              <Text style={styles.vsText}>VS</Text>
            </View>

            <View
              style={[
                styles.teamCard,
                match.status === 'completed' && (!isTeam1Winner(match) ? styles.winnerTeam : styles.loserTeam)
              ]}
              accessibilityLabel={`Team 2: ${getTeamNames(2)}${match.status === 'completed' && !isTeam1Winner(match) ? ', Winner' : ''}`}
            >
              <Text style={styles.teamLabel}>Team 2</Text>
              <Text style={styles.playerNames}>{getTeamNames(2)}</Text>
            </View>
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
                <Text style={styles.scoreText}>
                  {match.games.map(g => `${g.team1Score}-${g.team2Score}`).join(', ')}
                </Text>
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
                <TouchableOpacity
                  style={[styles.button, styles.editButton]}
                  onPress={handleEditMatch}
                  accessibilityLabel="Edit match"
                  accessibilityRole="button"
                >
                  <Icon name="pencil" size={20} color={colors.white} />
                  <Text style={styles.buttonText}>Edit Match</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.button, styles.completeButton]}
                onPress={handleCompleteMatch}
                accessibilityLabel="Complete match"
                accessibilityRole="button"
              >
                <Icon name="check-circle" size={20} color={colors.white} />
                <Text style={styles.buttonText}>Complete Match</Text>
              </TouchableOpacity>
            </View>

            {currentUser?.id === match.createdBy && (
              <TouchableOpacity
                style={[styles.button, styles.deleteButton]}
                onPress={handleDeleteMatch}
                accessibilityLabel="Delete match"
                accessibilityRole="button"
              >
                <Icon name="trash" size={20} color={colors.white} />
                <Text style={styles.buttonText}>Delete Match</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Simple Delete button for completed matches */}
        {match.status === 'completed' && currentUser?.id === match.createdBy && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.button, styles.deleteButton]}
              onPress={handleDeleteMatch}
              accessibilityLabel="Delete match"
              accessibilityRole="button"
            >
              <Icon name="trash" size={20} color={colors.white} />
              <Text style={styles.buttonText}>Delete Match</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
  matchTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  chipContainer: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipText: {
    ...typography.bodySmall,
    color: colors.neutral,
  },
  completedChip: {
    backgroundColor: colors.winOverlay,
    borderWidth: 1,
    borderColor: '#81C784',
  },
  scheduledChip: {
    backgroundColor: colors.secondaryOverlay,
    borderWidth: 1,
    borderColor: '#90CAF9',
  },
  expiredChip: {
    backgroundColor: colors.actionOverlay,
    borderWidth: 1,
    borderColor: '#FFB74D',
  },
  completedChipText: {
    color: '#388E3C',
  },
  scheduledChipText: {
    color: colors.secondary,
  },
  expiredChipText: {
    color: '#E65100',
  },
  teamsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamCard: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  teamLabel: {
    ...typography.bodySmall,
    color: colors.gray500,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  playerNames: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.neutral,
    textAlign: 'center',
  },
  vsContainer: {
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  vsText: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.gray400,
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
  footer: {
    padding: spacing.lg,
  },
  winnerTeam: {
    backgroundColor: colors.winOverlay,
    borderWidth: 1,
    borderColor: '#81C784',
  },
  loserTeam: {
    backgroundColor: colors.lossOverlay,
    borderWidth: 1,
    borderColor: '#E57373',
  },
});

export default MatchDetailsScreen;
