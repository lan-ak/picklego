import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Switch,
  Linking,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useData } from '../context/DataContext';
import { Ionicons } from '@expo/vector-icons';
import Layout from '../components/Layout';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

type CompleteMatchRouteProp = RouteProp<RootStackParamList, 'CompleteMatch'>;

type GameScore = {
  team1Score: string;
  team2Score: string;
  winner: 'team1' | 'team2' | null;
};

const CompleteMatchScreen = () => {
  const route = useRoute<CompleteMatchRouteProp>();
  const navigation = useNavigation();
  const { matches, players, updateMatch, invitePlayer, addPlayer } = useData();
  const match = matches.find(m => m.id === route.params.matchId);
  
  // Initialize match state
  const [gameScores, setGameScores] = useState<GameScore[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerEmail, setNewPlayerEmail] = useState('');
  const [sendInvite, setSendInvite] = useState(true);
  const [inviteMethod, setInviteMethod] = useState<'email' | 'sms'>('email');
  const [phoneNumber, setPhoneNumber] = useState('');
  
  useEffect(() => {
    if (match) {
      // Initialize game scores
      setGameScores(
        Array(match.numberOfGames || 0).fill(null).map(() => ({ 
          team1Score: '', 
          team2Score: '', 
          winner: null 
        }))
      );
      
      // Log match info for debugging
      console.log('Match loaded:', {
        id: match.id,
        isDoubles: match.isDoubles,
        teams: match.teams,
        players: match.players
      });
    }
  }, [match]);

  if (!match) {
    return (
      <Layout>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Match not found</Text>
        </View>
      </Layout>
    );
  }

  const getTeamNames = (teamNumber: 1 | 2) => {
    try {
      // For matches without teams property (old format)
      if (!match.teams) {
        if (!match.isDoubles) {
          // For singles, first player is team 1, second player is team 2
          const playerIndex = teamNumber === 1 ? 0 : 1;
          const playerId = match.players[playerIndex];
          return players.find(p => p.id === playerId)?.name || 'Unknown Player';
        } else {
          // For doubles, split players array in half
          const midPoint = Math.floor(match.players.length / 2);
          const playerIds = teamNumber === 1 
            ? match.players.slice(0, midPoint)
            : match.players.slice(midPoint);
          return playerIds.map(id => players.find(p => p.id === id)?.name || 'Unknown Player').join(' & ');
        }
      }
      
      // For matches with teams property (new format)
      const teamPlayers = teamNumber === 1 ? match.teams.team1 : match.teams.team2;
      if (!match.isDoubles) {
        // For singles, just return the single player name
        const playerId = teamPlayers[0];
        return players.find(p => p.id === playerId)?.name || 'Unknown Player';
      }
      return teamPlayers.map(id => players.find(p => p.id === id)?.name || 'Unknown Player').join(' & ');
    } catch (error) {
      console.error('Error in getTeamNames:', error, {
        match,
        teamNumber,
        teams: match.teams,
        players: match.players
      });
      return `Team ${teamNumber}`;
    }
  };

  const handleGameWinnerSelect = (gameIndex: number, winner: 'team1' | 'team2') => {
    const newScores = [...gameScores];
    const currentGame = newScores[gameIndex];
    
    newScores[gameIndex] = {
      ...currentGame,
      winner,
      team1Score: winner === 'team1' ? match.pointsToWin.toString() : '',
      team2Score: winner === 'team2' ? match.pointsToWin.toString() : ''
    };
    
    setGameScores(newScores);
  };

  const handleScoreChange = (gameIndex: number, team: 'team1Score' | 'team2Score', value: string) => {
    const newScores = [...gameScores];
    newScores[gameIndex] = {
      ...newScores[gameIndex],
      [team]: value.replace(/[^0-9]/g, '')
    };
    setGameScores(newScores);
  };

  const validateScores = () => {
    // Check if all games have scores and winners
    const hasEmptyScores = gameScores.some(
      game => !game.team1Score || !game.team2Score || !game.winner
    );
    if (hasEmptyScores) {
      return { valid: false, message: 'Please select winners and enter scores for all games.' };
    }

    // Check if scores are valid numbers
    const hasInvalidScores = gameScores.some(
      game => 
        isNaN(parseInt(game.team1Score)) || 
        isNaN(parseInt(game.team2Score))
    );
    if (hasInvalidScores) {
      return { valid: false, message: 'Please enter valid scores.' };
    }

    // Verify at least one team reaches points to win in each game
    const hasValidWinningScore = gameScores.every(game => {
      const t1Score = parseInt(game.team1Score);
      const t2Score = parseInt(game.team2Score);
      return t1Score >= match.pointsToWin || t2Score >= match.pointsToWin;
    });
    if (!hasValidWinningScore) {
      return { valid: false, message: `At least one team must reach ${match.pointsToWin} points in each game.` };
    }

    return { valid: true };
  };

  const determineMatchWinner = () => {
    try {
      console.log('Determining match winner...');
      const winCounts = gameScores.reduce((counts, game) => {
        if (game.winner) {
          counts[game.winner] = (counts[game.winner] || 0) + 1;
        }
        return counts;
      }, {} as Record<string, number>);
      
      console.log('Win counts:', winCounts);
      
      // Get win counts for each team, defaulting to 0 if not present
      const team1Wins = winCounts.team1 || 0;
      const team2Wins = winCounts.team2 || 0;
      
      console.log('Team 1 wins:', team1Wins, 'Team 2 wins:', team2Wins);
      
      // Handle matches without teams property (old format)
      if (!match.teams) {
        console.log('Old format match, calculating winner');
        if (!match.isDoubles) {
          // For singles, winner is the first or second player based on which team won
          if (team1Wins > team2Wins) {
            return [match.players[0]]; // Return as array for consistency
          } else if (team2Wins > team1Wins) {
            return [match.players[1]]; // Return as array for consistency
          }
        } else {
          // For doubles, split players and return winning team
          const midPoint = Math.floor(match.players.length / 2);
          if (team1Wins > team2Wins) {
            return match.players.slice(0, midPoint); // First half of players
          } else if (team2Wins > team1Wins) {
            return match.players.slice(midPoint); // Second half of players
          }
        }
        return null;
      }
      
      // Handle matches with teams property (new format)
      console.log('New format match, teams:', match.teams);
      if (team1Wins > team2Wins) {
        console.log('Team 1 wins with:', match.teams.team1);
        return match.teams.team1;
      } else if (team2Wins > team1Wins) {
        console.log('Team 2 wins with:', match.teams.team2);
        return match.teams.team2;
      }
      
      console.log('No winner could be determined - equal wins:', team1Wins, team2Wins);
      return null;
    } catch (error) {
      console.error('Error in determineMatchWinner:', error, {
        match,
        gameScores,
        teams: match.teams,
        players: match.players,
        isDoubles: match.isDoubles
      });
      return null;
    }
  };

  const formatFinalScore = () => {
    return gameScores
      .map(game => `${game.team1Score}-${game.team2Score}`)
      .join(', ');
  };

  const handleCompleteMatch = async () => {
    const validation = validateScores();
    if (!validation.valid) {
      Alert.alert('Incomplete Scores', validation.message);
      return;
    }

    const matchWinner = determineMatchWinner();
    if (!matchWinner) {
      Alert.alert('Error', 'Could not determine match winner. Please make sure there is a clear winner across all games.');
      return;
    }

    try {
      console.log('Completing match with winner:', matchWinner);
      await updateMatch(match.id, {
        status: 'completed',
        winner: matchWinner,
        score: formatFinalScore(),
      });

      Alert.alert(
        'Success',
        'Match completed successfully!',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      );
    } catch (error) {
      console.error('Error completing match:', error);
      Alert.alert(
        'Error',
        'Failed to complete match. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleInvitePlayer = async () => {
    if (!newPlayerName.trim()) {
      Alert.alert('Error', 'Please enter a player name');
      return;
    }

    try {
      if (inviteMethod === 'sms' && phoneNumber.trim()) {
        // Basic phone number validation
        const phoneRegex = /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/;
        if (!phoneRegex.test(phoneNumber.trim())) {
          Alert.alert('Error', 'Please enter a valid phone number');
          return;
        }

        // Add the player without email
        const newPlayer = await addPlayer({
          name: newPlayerName.trim(),
          phoneNumber: phoneNumber.trim(),
        });

        // Send SMS invitation
        const message = `Hi ${newPlayerName}, you've been invited to join PickleGo! Download the app to track your pickleball matches and stats.`;
        const url = `sms:${phoneNumber}?body=${encodeURIComponent(message)}`;
        
        const canOpen = await Linking.canOpenURL(url);
        if (canOpen) {
          await Linking.openURL(url);
          Alert.alert(
            'Success', 
            `${newPlayerName} has been added. A text message has been prepared to send.`,
            [{ text: 'OK' }]
          );
          setNewPlayerName('');
          setPhoneNumber('');
          setShowInviteModal(false);
        } else {
          Alert.alert('Error', 'Unable to open SMS app');
        }
      } else if (inviteMethod === 'email' && sendInvite && newPlayerEmail.trim()) {
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newPlayerEmail.trim())) {
          Alert.alert('Error', 'Please enter a valid email address');
          return;
        }

        const invitedPlayer = await invitePlayer(newPlayerName.trim(), newPlayerEmail.trim());
        
        if (invitedPlayer) {
          Alert.alert(
            'Success', 
            `${newPlayerName} has been added and invited. They will receive an email to join the app.`,
            [{ text: 'OK' }]
          );
          setNewPlayerName('');
          setNewPlayerEmail('');
          setShowInviteModal(false);
        } else {
          Alert.alert('Error', 'This email is already registered or there was an error sending the invitation.');
        }
      } else {
        // Just add the player without invitation
        await addPlayer({
          name: newPlayerName.trim(),
        });
        setNewPlayerName('');
        setNewPlayerEmail('');
        setPhoneNumber('');
        setShowInviteModal(false);
        Alert.alert('Success', `${newPlayerName} has been added.`);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to add player');
    }
  };

  const renderInvitePlayerModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={showInviteModal}
      onRequestClose={() => setShowInviteModal(false)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: '#0D6B3E' }]}>Invite Player</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowInviteModal(false)}
              >
                <Ionicons name="close" size={24} color="#0D6B3E" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Player Name</Text>
              <TextInput
                style={styles.input}
                value={newPlayerName}
                onChangeText={setNewPlayerName}
                placeholder="Enter player's name"
                autoFocus
              />
            </View>
            
            <View style={styles.inviteMethodContainer}>
              <Text style={styles.inputLabel}>Invite Method</Text>
              <View style={styles.inviteMethodButtons}>
                <TouchableOpacity
                  style={[
                    styles.methodButton,
                    inviteMethod === 'email' && styles.activeMethodButton
                  ]}
                  onPress={() => setInviteMethod('email')}
                >
                  <Ionicons 
                    name="mail" 
                    size={18} 
                    color={inviteMethod === 'email' ? '#fff' : '#0D6B3E'} 
                  />
                  <Text 
                    style={[
                      styles.methodButtonText,
                      inviteMethod === 'email' && styles.activeMethodButtonText
                    ]}
                  >
                    Email
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.methodButton,
                    inviteMethod === 'sms' && styles.activeMethodButton
                  ]}
                  onPress={() => setInviteMethod('sms')}
                >
                  <Ionicons 
                    name="chatbubble" 
                    size={18} 
                    color={inviteMethod === 'sms' ? '#fff' : '#0D6B3E'} 
                  />
                  <Text 
                    style={[
                      styles.methodButtonText,
                      inviteMethod === 'sms' && styles.activeMethodButtonText
                    ]}
                  >
                    SMS
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {inviteMethod === 'email' ? (
              <>
                <View style={styles.switchContainer}>
                  <Text style={styles.switchLabel}>Send email invitation</Text>
                  <Switch
                    value={sendInvite}
                    onValueChange={setSendInvite}
                    trackColor={{ false: "#767577", true: "#0D6B3E" }}
                    thumbColor={sendInvite ? "#f4f3f4" : "#f4f3f4"}
                  />
                </View>
                
                {sendInvite && (
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Email Address</Text>
                    <TextInput
                      style={styles.input}
                      value={newPlayerEmail}
                      onChangeText={setNewPlayerEmail}
                      placeholder="Enter email address"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                )}
              </>
            ) : (
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <TextInput
                  style={styles.input}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  placeholder="Enter phone number"
                  keyboardType="phone-pad"
                />
              </View>
            )}
            
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.secondaryButton]}
                onPress={() => setShowInviteModal(false)}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.primaryButton]}
                onPress={handleInvitePlayer}
              >
                <Text style={styles.primaryButtonText}>Add Player</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <Layout title="Complete Match">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="trophy" size={24} color="#0D6B3E" />
              <Text style={styles.sectionTitle}>Game Scores</Text>
            </View>
            
            {gameScores.map((game, index) => (
              <View key={index} style={styles.gameScoreContainer}>
                <Text style={styles.gameNumber}>Game {index + 1}</Text>
                
                <View style={styles.winnerSelector}>
                  <Text style={styles.winnerLabel}>Select Winner:</Text>
                  <View style={styles.winnerButtons}>
                    <TouchableOpacity
                      style={[
                        styles.winnerButton,
                        game.winner === 'team1' && styles.winnerButtonSelected
                      ]}
                      onPress={() => handleGameWinnerSelect(index, 'team1')}
                    >
                      <Text style={[
                        styles.winnerButtonText,
                        game.winner === 'team1' && styles.winnerButtonTextSelected
                      ]}>
                        {getTeamNames(1)}
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[
                        styles.winnerButton,
                        game.winner === 'team2' && styles.winnerButtonSelected
                      ]}
                      onPress={() => handleGameWinnerSelect(index, 'team2')}
                    >
                      <Text style={[
                        styles.winnerButtonText,
                        game.winner === 'team2' && styles.winnerButtonTextSelected
                      ]}>
                        {getTeamNames(2)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                
                <View style={styles.scoreInputRow}>
                  <View style={styles.teamScoreContainer}>
                    <Text style={styles.teamName}>{getTeamNames(1)}</Text>
                    <TextInput
                      style={styles.scoreInput}
                      value={game.team1Score}
                      onChangeText={(value) => handleScoreChange(index, 'team1Score', value)}
                      keyboardType="number-pad"
                      placeholder="0"
                    />
                  </View>
                  
                  <Text style={styles.scoreSeparator}>vs</Text>
                  
                  <View style={styles.teamScoreContainer}>
                    <Text style={styles.teamName}>{getTeamNames(2)}</Text>
                    <TextInput
                      style={styles.scoreInput}
                      value={game.team2Score}
                      onChangeText={(value) => handleScoreChange(index, 'team2Score', value)}
                      keyboardType="number-pad"
                      placeholder="0"
                    />
                  </View>
                </View>
              </View>
            ))}
            <Text style={styles.pointsToWinText}>
              First to {match.pointsToWin} points wins each game
            </Text>
          </View>
        </ScrollView>
        
        <View style={styles.footer}>
          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={20} color="#666" />
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.primaryButton]}
            onPress={handleCompleteMatch}
          >
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>Complete Match</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      
      {renderInvitePlayerModal()}
    </Layout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  section: {
    backgroundColor: '#fff',
    margin: 16,
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
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0D6B3E',
    marginLeft: 8,
  },
  gameScoreContainer: {
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 12,
  },
  gameNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0D6B3E',
    marginBottom: 8,
  },
  scoreInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teamScoreContainer: {
    flex: 1,
    alignItems: 'center',
  },
  teamName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    textAlign: 'center',
  },
  scoreInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    width: 60,
    fontSize: 18,
    textAlign: 'center',
    backgroundColor: '#fff',
  },
  scoreSeparator: {
    fontSize: 16,
    color: '#666',
    marginHorizontal: 12,
    fontWeight: '600',
  },
  pointsToWinText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 4,
  },
  primaryButton: {
    backgroundColor: '#0D6B3E',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  secondaryButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
    marginLeft: 8,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#f44336',
    textAlign: 'center',
  },
  winnerSelector: {
    marginBottom: 12,
  },
  winnerLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  winnerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  winnerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f8f8',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  winnerButtonSelected: {
    backgroundColor: '#0D6B3E',
    borderColor: '#0D6B3E',
  },
  winnerButtonText: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
    flex: 1,
  },
  winnerButtonTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  inviteContainer: {
    marginTop: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D6B3E',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  inviteButtonText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 500,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  switchLabel: {
    fontSize: 16,
    color: '#333',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  inviteMethodContainer: {
    marginBottom: 16,
  },
  inviteMethodButtons: {
    flexDirection: 'row',
    marginTop: 8,
  },
  methodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0D6B3E',
    marginRight: 12,
    flex: 1,
  },
  activeMethodButton: {
    backgroundColor: '#0D6B3E',
  },
  methodButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0D6B3E',
    marginLeft: 8,
  },
  activeMethodButtonText: {
    color: '#fff',
  },
});

export default CompleteMatchScreen; 