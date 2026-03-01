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
        matchType: match.matchType,
        team1PlayerIds: match.team1PlayerIds,
        team2PlayerIds: match.team2PlayerIds
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
      const playerIds = teamNumber === 1 ? match.team1PlayerIds : match.team2PlayerIds;
      if (match.matchType !== 'doubles') {
        return players.find(p => p.id === playerIds[0])?.name || 'Unknown Player';
      }
      return playerIds.map(id => players.find(p => p.id === id)?.name || 'Unknown Player').join(' & ');
    } catch (error) {
      console.error('Error in getTeamNames:', error);
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

  const validateScores = (): { valid: boolean; message?: string } => {
    const hasEmptyScores = gameScores.some(
      game => !game.team1Score || !game.team2Score || !game.winner
    );
    if (hasEmptyScores) {
      return { valid: false, message: 'Please select winners and enter scores for all games.' };
    }

    const hasInvalidScores = gameScores.some(
      game => isNaN(parseInt(game.team1Score)) || isNaN(parseInt(game.team2Score))
    );
    if (hasInvalidScores) {
      return { valid: false, message: 'Please enter valid scores.' };
    }

    // Win-by-2 validation for each game
    for (let i = 0; i < gameScores.length; i++) {
      const t1 = parseInt(gameScores[i].team1Score);
      const t2 = parseInt(gameScores[i].team2Score);
      const winScore = Math.max(t1, t2);
      const loseScore = Math.min(t1, t2);

      if (t1 < 0 || t2 < 0) {
        return { valid: false, message: `Game ${i + 1}: Scores cannot be negative.` };
      }

      if (winScore < match.pointsToWin) {
        return { valid: false, message: `Game ${i + 1}: At least one team must reach ${match.pointsToWin} points.` };
      }

      if (winScore - loseScore < 2) {
        return { valid: false, message: `Game ${i + 1}: Must win by at least 2 points.` };
      }

      if (winScore > match.pointsToWin && winScore - loseScore !== 2) {
        return { valid: false, message: `Game ${i + 1}: When going past ${match.pointsToWin}, the winning score must be exactly 2 more than the losing score.` };
      }

      // Verify declared winner matches scores
      const declaredWinner = gameScores[i].winner;
      if (declaredWinner === 'team1' && t1 <= t2) {
        return { valid: false, message: `Game ${i + 1}: Team 1 is selected as winner but has a lower score.` };
      }
      if (declaredWinner === 'team2' && t2 <= t1) {
        return { valid: false, message: `Game ${i + 1}: Team 2 is selected as winner but has a lower score.` };
      }
    }

    return { valid: true };
  };

  const determineMatchWinner = (): 1 | 2 | null => {
    const team1Wins = gameScores.filter(g => g.winner === 'team1').length;
    const team2Wins = gameScores.filter(g => g.winner === 'team2').length;
    if (team1Wins > team2Wins) return 1;
    if (team2Wins > team1Wins) return 2;
    return null;
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
        winnerTeam: matchWinner,
        games: gameScores.map(g => ({
          team1Score: parseInt(g.team1Score),
          team2Score: parseInt(g.team2Score),
          winnerTeam: g.winner === 'team1' ? 1 as const : 2 as const,
        })),
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
                  accessibilityRole="radio"
                  accessibilityLabel="Email"
                  accessibilityState={{ selected: inviteMethod === 'email' }}
                  accessibilityHint="Select email as the invite method"
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
                  accessibilityRole="radio"
                  accessibilityLabel="SMS"
                  accessibilityState={{ selected: inviteMethod === 'sms' }}
                  accessibilityHint="Select SMS as the invite method"
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
                      accessibilityRole="radio"
                      accessibilityLabel={`${getTeamNames(1)} wins Game ${index + 1}`}
                      accessibilityState={{ selected: game.winner === 'team1' }}
                      accessibilityHint={`Select ${getTeamNames(1)} as the winner of Game ${index + 1}`}
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
                      accessibilityRole="radio"
                      accessibilityLabel={`${getTeamNames(2)} wins Game ${index + 1}`}
                      accessibilityState={{ selected: game.winner === 'team2' }}
                      accessibilityHint={`Select ${getTeamNames(2)} as the winner of Game ${index + 1}`}
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
                      accessibilityLabel={`Score for ${getTeamNames(1)}, Game ${index + 1}`}
                      accessibilityHint={`Enter the score for ${getTeamNames(1)} in Game ${index + 1}`}
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
                      accessibilityLabel={`Score for ${getTeamNames(2)}, Game ${index + 1}`}
                      accessibilityHint={`Enter the score for ${getTeamNames(2)} in Game ${index + 1}`}
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
            accessibilityLabel="Cancel"
            accessibilityRole="button"
            accessibilityHint="Go back without completing the match"
          >
            <Ionicons name="arrow-back" size={20} color="#666" />
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleCompleteMatch}
            accessibilityLabel="Complete Match"
            accessibilityRole="button"
            accessibilityHint="Submit the scores and complete the match"
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