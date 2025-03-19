import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, ScrollView } from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import Layout from '../components/Layout';
import type { Match } from '../types';
import { RootStackParamList } from '../types';
import { format } from 'date-fns';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

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
          <Text style={styles.errorText}>Match not found</Text>
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
      // For matches without teams property (old format)
      if (!match.teams) {
        if (!match.isDoubles) {
          // For singles, first player is team 1, second player is team 2
          const playerIndex = teamNumber === 1 ? 0 : 1;
          const playerId = match.players[playerIndex];
          const playerName = getPlayerName(playerId);
          
          return playerName;
        } else {
          // For doubles, split players array in half
          const midPoint = Math.floor(match.players.length / 2);
          const playerIds = teamNumber === 1 
            ? match.players.slice(0, midPoint)
            : match.players.slice(midPoint);
          
          return playerIds.map(id => getPlayerName(id)).join(' & ');
        }
      }
      
      // For matches with teams property (new format)
      const teamPlayers = teamNumber === 1 ? match.teams.team1 : match.teams.team2;
      
      return teamPlayers.map(id => getPlayerName(id)).join(' & ');
    } catch (error) {
      console.error('Error in getTeamNames:', error);
      return `Team ${teamNumber}`;
    }
  };

  const isUserInMatch = () => {
    if (!currentUser) return false;
    
    if (match.teams) {
      return match.teams.team1.includes(currentUser.id) || match.teams.team2.includes(currentUser.id);
    } else {
      return match.players.includes(currentUser.id);
    }
  };

  const getUserTeamNumber = useCallback((userId: string, match: Match): number | null => {
    if (match.teams) {
      if (match.teams.team1.includes(userId)) return 1;
      if (match.teams.team2.includes(userId)) return 2;
      return null;
    } else {
      // For older format
      const playerIndex = match.players.indexOf(userId);
      if (playerIndex === -1) return null;
      
      // For singles: player 0 is team 1, player 1 is team 2
      if (!match.isDoubles) {
        return playerIndex === 0 ? 1 : 2;
      }
      
      // For doubles: first half is team 1, second half is team 2
      const midPoint = Math.floor(match.players.length / 2);
      return playerIndex < midPoint ? 1 : 2;
    }
  }, []);

  const isCurrentUserWinner = useCallback((match: Match): boolean => {
    if (!match.winner) return false;
    if (!currentUser) return false;
    
    if (Array.isArray(match.winner)) {
      return match.winner.includes(currentUser.id);
    } else if (typeof match.winner === 'number') {
      const userTeam = getUserTeamNumber(currentUser.id, match);
      return userTeam === match.winner;
    }
    
    return false;
  }, [currentUser, getUserTeamNumber]);

  const isTeam1Winner = useCallback((match: Match): boolean => {
    if (!match.winner) return false;
    
    if (Array.isArray(match.winner)) {
      // If winner is an array of player IDs, check if all team1 players are winners
      if (!match.teams) return false;
      
      const winnerSet = new Set(match.winner);
      return match.teams.team1.every(playerId => winnerSet.has(playerId));
    } else if (typeof match.winner === 'number') {
      // If winner is a team number, check if it's team 1
      return match.winner === 1;
    }
    
    return false;
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

  // Add this function to parse game scores
  const parseGameScores = (scoreString: string) => {
    if (!scoreString) return [];
    
    return scoreString.split(', ').map((gameScore, index) => {
      const [team1Score, team2Score] = gameScore.split('-').map(Number);
      const winner = team1Score > team2Score ? 1 : 2;
      return { team1Score, team2Score, winner, gameNumber: index + 1 };
    });
  };

  return (
    <Layout title="Match Details" showBackButton={true}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Match Header Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="calendar-outline" size={24} color="#0D6B3E" />
            <Text style={styles.sectionTitle}>Match Details</Text>
          </View>
          
          <View style={styles.detailsRow}>
            <View style={styles.detailItem}>
              <Ionicons name="calendar-outline" size={20} color="#0D6B3E" />
              <Text style={styles.detailText}>{formatMatchDate(match.date)}</Text>
            </View>
            
            <View style={styles.detailItem}>
              <Ionicons name="time-outline" size={20} color="#0D6B3E" />
              <Text style={styles.detailText}>{formatMatchTime(match.date)}</Text>
            </View>
          </View>

          {match.location && (
            <View style={styles.detailItem}>
              <Ionicons name="location-outline" size={20} color="#0D6B3E" />
              <Text style={styles.detailText}>{match.location}</Text>
            </View>
          )}

          <View style={styles.matchTypeContainer}>
            <View style={styles.chipContainer}>
              <Text style={styles.chipText}>
                {match.isDoubles ? 'Doubles' : 'Singles'}
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
            
            <View style={[styles.chipContainer, match.status === 'completed' ? styles.completedChip : styles.scheduledChip]}>
              <Text style={[styles.chipText, match.status === 'completed' ? styles.completedChipText : styles.scheduledChipText]}>
                {match.status === 'completed' ? 'Completed' : 'Scheduled'}
              </Text>
            </View>
          </View>
        </View>
        
        {/* Teams Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="people" size={24} color="#0D6B3E" />
            <Text style={styles.sectionTitle}>Teams</Text>
          </View>
          
          <View style={styles.teamsContainer}>
            <View style={[
              styles.teamCard, 
              match.status === 'completed' && (isTeam1Winner(match) ? styles.winnerTeam : styles.loserTeam)
            ]}>
              <Text style={styles.teamLabel}>Team 1</Text>
              <Text style={styles.playerNames}>{getTeamNames(1)}</Text>
            </View>
            
            <View style={styles.vsContainer}>
              <Text style={styles.vsText}>VS</Text>
            </View>
            
            <View style={[
              styles.teamCard, 
              match.status === 'completed' && (!isTeam1Winner(match) ? styles.winnerTeam : styles.loserTeam)
            ]}>
              <Text style={styles.teamLabel}>Team 2</Text>
              <Text style={styles.playerNames}>{getTeamNames(2)}</Text>
            </View>
          </View>
        </View>
        
        {/* Results Section - Only for completed matches */}
        {match.status === 'completed' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="trophy" size={24} color="#0D6B3E" />
              <Text style={styles.sectionTitle}>Match Results</Text>
            </View>
            
            <View style={styles.resultContent}>
              <Text style={styles.resultLabel}>Final Score</Text>
              {typeof match.score === 'object' && match.score !== null ? (
                <Text style={styles.scoreText}>
                  {match.score.team1} - {match.score.team2}
                </Text>
              ) : (
                <Text style={styles.scoreText}>{match.score || 'No score recorded'}</Text>
              )}
              
              <Text style={styles.winnerText}>{getWinnerText()}</Text>
            </View>
          </View>
        )}
        
        {/* Action Buttons - Different buttons for scheduled vs completed */}
        {match.status === 'scheduled' && isUserInMatch() && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="construct" size={24} color="#0D6B3E" />
              <Text style={styles.sectionTitle}>Actions</Text>
            </View>
            
            <View style={styles.actionButtons}>
              <TouchableOpacity 
                style={[styles.button, styles.editButton]}
                onPress={handleEditMatch}
              >
                <Ionicons name="create-outline" size={20} color="#fff" />
                <Text style={styles.buttonText}>Edit Match</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.button, styles.completeButton]}
                onPress={handleCompleteMatch}
              >
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={styles.buttonText}>Complete Match</Text>
              </TouchableOpacity>
            </View>
            
            {isUserInMatch() && (
              <TouchableOpacity
                style={[styles.button, styles.deleteButton]}
                onPress={handleDeleteMatch}
              >
                <Ionicons name="trash-outline" size={20} color="#fff" />
                <Text style={styles.buttonText}>Delete Match</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        
        {/* Simple Delete button for completed matches */}
        {match.status === 'completed' && isUserInMatch() && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.button, styles.deleteButton]}
              onPress={handleDeleteMatch}
            >
              <Ionicons name="trash-outline" size={20} color="#fff" />
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
    backgroundColor: '#F5F7FA',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  section: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0D6B3E',
    marginLeft: 8,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#f44336',
    textAlign: 'center',
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 8,
  },
  matchTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 8,
  },
  chipContainer: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: {
    fontSize: 14,
    color: '#333',
  },
  completedChip: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#81C784',
  },
  scheduledChip: {
    backgroundColor: '#E3F2FD',
    borderWidth: 1,
    borderColor: '#90CAF9',
  },
  completedChipText: {
    color: '#388E3C',
  },
  scheduledChipText: {
    color: '#1976D2',
  },
  teamsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamCard: {
    flex: 1,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  teamLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  playerNames: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  vsContainer: {
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  vsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
  },
  resultContent: {
    alignItems: 'center',
    padding: 16,
  },
  resultLabel: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  scoreText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0D6B3E',
    marginBottom: 16,
  },
  winnerText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
    flex: 1,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
    marginLeft: 8,
  },
  editButton: {
    backgroundColor: '#0D6B3E',
  },
  completeButton: {
    backgroundColor: '#0D6B3E',
  },
  deleteButton: {
    backgroundColor: '#F44336',
  },
  footer: {
    padding: 16,
  },
  winnerTeam: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#81C784',
  },
  loserTeam: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#E57373',
  },
});

export default MatchDetailsScreen; 