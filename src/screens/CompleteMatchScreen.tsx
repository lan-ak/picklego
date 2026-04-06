import React, { useState, useEffect } from 'react';
import { isValidEmail } from '../utils/validation';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../types';
import { useData } from '../context/DataContext';
import { Icon } from '../components/Icon';
import { Section } from '../components/Section';
import { ToggleRow } from '../components/ToggleRow';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { PrimaryButton, SecondaryButton } from '../components/Button';
import { DismissableModal } from '../components/DismissableModal';
import Layout from '../components/Layout';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import { isValidPhone, formatPhoneInput } from '../utils/phone';
import PicklePete from '../components/PicklePete';
import { useToast } from '../context/ToastContext';
import Animated from 'react-native-reanimated';
import { useFadeIn } from '../hooks';
import { usePlacement } from 'expo-superwall';
import { PLACEMENTS } from '../services/superwallPlacements';
import { shuffleTeams } from '../utils/shuffleTeams';

type CompleteMatchRouteProp = RouteProp<RootStackParamList, 'CompleteMatch'>;

type GameScore = {
  team1Score: string;
  team2Score: string;
  winner: 'team1' | 'team2' | null;
};

const CompleteMatchScreen = () => {
  const fadeStyle = useFadeIn();
  const route = useRoute<CompleteMatchRouteProp>();
  const navigation = useNavigation();
  const { matches, players, updateMatch, invitePlayer, addPlayer, currentUser, getPlayerName } = useData();
  const { showToast } = useToast();
  const { registerPlacement } = usePlacement();
  const match = matches.find(m => m.id === route.params.matchId);

  // Initialize match state
  const [gameScores, setGameScores] = useState<GameScore[]>([]);
  const [gameTeams, setGameTeams] = useState<Array<{
    team1PlayerIds: string[];
    team2PlayerIds: string[];
  }>>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerEmail, setNewPlayerEmail] = useState('');
  const [sendInvite, setSendInvite] = useState(true);
  const [inviteMethod, setInviteMethod] = useState<'email' | 'sms'>('email');
  const [phoneNumber, setPhoneNumber] = useState('');

  // Superwall: fire placement when user taps to complete a match
  useEffect(() => {
    registerPlacement({ placement: PLACEMENTS.COMPLETE_MATCH_TAPPED });
  }, []);

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

      // Initialize per-game teams
      const teams: Array<{ team1PlayerIds: string[]; team2PlayerIds: string[] }> = [];
      for (let i = 0; i < (match.numberOfGames || 0); i++) {
        if (i === 0 || !match.randomizeTeamsPerGame || match.matchType !== 'doubles' || !currentUser) {
          // Game 1 always uses original teams; non-shuffle matches use original teams
          teams.push({
            team1PlayerIds: match.team1PlayerIds,
            team2PlayerIds: match.team2PlayerIds,
          });
        } else {
          // Games 2+ with shuffle enabled: randomize
          const { team1, team2 } = shuffleTeams(match.allPlayerIds, currentUser.id);
          teams.push({ team1PlayerIds: team1, team2PlayerIds: team2 });
        }
      }
      setGameTeams(teams);

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
          <PicklePete pose="error" size="sm" message="Match not found" />
        </View>
      </Layout>
    );
  }

  const getTeamNames = (teamNumber: 1 | 2, gameIndex?: number) => {
    try {
      const gameSpecific = gameIndex !== undefined ? gameTeams[gameIndex] : null;
      const playerIds = gameSpecific
        ? (teamNumber === 1 ? gameSpecific.team1PlayerIds : gameSpecific.team2PlayerIds)
        : (teamNumber === 1 ? match.team1PlayerIds : match.team2PlayerIds);

      const snapshotNames = teamNumber === 1
        ? match.team1PlayerNames
        : match.team2PlayerNames;

      const getName = (id: string, idx: number) => {
        if (currentUser && id === currentUser.id) return 'Me';
        return getPlayerName(id, snapshotNames?.[idx]);
      };

      if (match.matchType !== 'doubles') {
        return getName(playerIds[0], 0);
      }
      return playerIds.map((id, idx) => getName(id, idx)).join(' & ');
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

    // Superwall: fire placement for analytics (non-blocking)
    registerPlacement({ placement: PLACEMENTS.MATCH_COMPLETE });

    try {
      console.log('Completing match with winner:', matchWinner);
      await updateMatch(match.id, {
        status: 'completed',
        winnerTeam: matchWinner,
        games: gameScores.map((g, i) => ({
          team1Score: parseInt(g.team1Score),
          team2Score: parseInt(g.team2Score),
          winnerTeam: g.winner === 'team1' ? 1 as const : 2 as const,
          ...(gameTeams[i] && match.randomizeTeamsPerGame && {
            team1PlayerIds: gameTeams[i].team1PlayerIds,
            team2PlayerIds: gameTeams[i].team2PlayerIds,
          }),
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
        if (!isValidPhone(phoneNumber)) {
          Alert.alert('Error', 'Please enter a valid phone number');
          return;
        }

        // Create placeholder via unified invitePlayer
        await invitePlayer(newPlayerName.trim(), { phone: phoneNumber.trim() });

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
        if (!isValidEmail(newPlayerEmail)) {
          Alert.alert('Error', 'Please enter a valid email address');
          return;
        }

        const result = await invitePlayer(newPlayerName.trim(), { email: newPlayerEmail.trim() });

        if (result.type === 'invited' && result.player) {
          Alert.alert(
            'Success',
            `${newPlayerName} has been added and invited. They will receive an email to join the app.`,
            [{ text: 'OK' }]
          );
          setNewPlayerName('');
          setNewPlayerEmail('');
          setShowInviteModal(false);
        } else if (result.type === 'invite_sent') {
          Alert.alert('Player Invite Sent', `${newPlayerName} already has an account. A player invite has been sent.`);
          setNewPlayerName('');
          setNewPlayerEmail('');
          setShowInviteModal(false);
        } else if (result.type === 'already_connected') {
          Alert.alert('Already Connected', `${result.player?.name || newPlayerName} is already in your players.`);
        } else if (result.type === 'request_pending') {
          Alert.alert('Invite Pending', `A player invite to ${result.player?.name || newPlayerName} is already pending.`);
        } else {
          Alert.alert('Error', 'There was an error sending the invitation.');
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
        showToast(`${newPlayerName} has been added.`, 'success');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to add player');
    }
  };

  const renderInvitePlayerModal = () => (
    <DismissableModal
      visible={showInviteModal}
      onClose={() => setShowInviteModal(false)}
      overlayStyle={styles.modalOverlay}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invite Player</Text>
              <AnimatedPressable
                style={styles.closeButton}
                onPress={() => setShowInviteModal(false)}
              >
                <Icon name="x" size={24} color={colors.primary} />
              </AnimatedPressable>
            </View>

            <PicklePete pose="invite" size="sm" message="Bring someone new to the court!" />

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
                <AnimatedPressable
                  style={[
                    styles.methodButton,
                    inviteMethod === 'email' && styles.activeMethodButton
                  ]}
                  onPress={() => setInviteMethod('email')}
                  accessibilityRole="button"
                  accessibilityLabel="Email"
                  accessibilityState={{ selected: inviteMethod === 'email' }}
                  accessibilityHint="Select email as the invite method"
                >
                  <Icon
                    name="mail"
                    size={18}
                    color={inviteMethod === 'email' ? colors.white : colors.primary}
                  />
                  <Text
                    style={[
                      styles.methodButtonText,
                      inviteMethod === 'email' && styles.activeMethodButtonText
                    ]}
                  >
                    Email
                  </Text>
                </AnimatedPressable>

                <AnimatedPressable
                  style={[
                    styles.methodButton,
                    inviteMethod === 'sms' && styles.activeMethodButton
                  ]}
                  onPress={() => setInviteMethod('sms')}
                  accessibilityRole="button"
                  accessibilityLabel="SMS"
                  accessibilityState={{ selected: inviteMethod === 'sms' }}
                  accessibilityHint="Select SMS as the invite method"
                >
                  <Icon
                    name="message-circle"
                    size={18}
                    color={inviteMethod === 'sms' ? colors.white : colors.primary}
                  />
                  <Text
                    style={[
                      styles.methodButtonText,
                      inviteMethod === 'sms' && styles.activeMethodButtonText
                    ]}
                  >
                    SMS
                  </Text>
                </AnimatedPressable>
              </View>
            </View>

            {inviteMethod === 'email' ? (
              <>
                <ToggleRow
                  label="Send email invitation"
                  value={sendInvite}
                  onValueChange={setSendInvite}
                  icon="mail"
                />

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
                  onChangeText={(text) => setPhoneNumber(formatPhoneInput(text))}
                  placeholder="(555) 123-4567"
                  keyboardType="phone-pad"
                />
              </View>
            )}

            <View style={styles.modalFooter}>
              <SecondaryButton
                title="Cancel"
                onPress={() => setShowInviteModal(false)}
                style={styles.modalButton}
              />
              <PrimaryButton
                title="Add Player"
                onPress={handleInvitePlayer}
                style={styles.modalButton}
              />
            </View>
          </View>
      </KeyboardAvoidingView>
    </DismissableModal>
  );

  return (
    <Layout title="Complete Match">
      <Animated.View style={[{ flex: 1 }, fadeStyle]}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <Section title="Game Scores" icon="trophy" style={{ margin: spacing.lg }}>
            {gameScores.map((game, index) => (
              <View key={index} style={styles.gameScoreContainer}>
                <Text style={styles.gameNumber}>Game {index + 1}</Text>
                {match.randomizeTeamsPerGame && index > 0 && (
                  <Text style={styles.shuffledIndicator}>Shuffled teams</Text>
                )}

                <View style={styles.winnerSelector}>
                  <Text style={styles.winnerLabel}>Select Winner:</Text>
                  <View style={styles.winnerButtons}>
                    <AnimatedPressable
                      style={[
                        styles.winnerButton,
                        game.winner === 'team1' && styles.winnerButtonSelected
                      ]}
                      onPress={() => handleGameWinnerSelect(index, 'team1')}
                      accessibilityRole="button"
                      accessibilityLabel={`${getTeamNames(1, index)} wins Game ${index + 1}`}
                      accessibilityState={{ selected: game.winner === 'team1' }}
                      accessibilityHint={`Select ${getTeamNames(1, index)} as the winner of Game ${index + 1}`}
                    >
                      <Text style={[
                        styles.winnerButtonText,
                        game.winner === 'team1' && styles.winnerButtonTextSelected
                      ]}>
                        {getTeamNames(1, index)}
                      </Text>
                    </AnimatedPressable>

                    <AnimatedPressable
                      style={[
                        styles.winnerButton,
                        game.winner === 'team2' && styles.winnerButtonSelected
                      ]}
                      onPress={() => handleGameWinnerSelect(index, 'team2')}
                      accessibilityRole="button"
                      accessibilityLabel={`${getTeamNames(2, index)} wins Game ${index + 1}`}
                      accessibilityState={{ selected: game.winner === 'team2' }}
                      accessibilityHint={`Select ${getTeamNames(2, index)} as the winner of Game ${index + 1}`}
                    >
                      <Text style={[
                        styles.winnerButtonText,
                        game.winner === 'team2' && styles.winnerButtonTextSelected
                      ]}>
                        {getTeamNames(2, index)}
                      </Text>
                    </AnimatedPressable>
                  </View>
                </View>

                <View style={styles.scoreInputRow}>
                  <View style={styles.teamScoreContainer}>
                    <Text style={styles.teamName}>{getTeamNames(1, index)}</Text>
                    <TextInput
                      style={styles.scoreInput}
                      value={game.team1Score}
                      onChangeText={(value) => handleScoreChange(index, 'team1Score', value)}
                      keyboardType="number-pad"
                      placeholder="0"
                      accessibilityLabel={`Score for ${getTeamNames(1, index)}, Game ${index + 1}`}
                      accessibilityHint={`Enter the score for ${getTeamNames(1, index)} in Game ${index + 1}`}
                    />
                  </View>

                  <Text style={styles.scoreSeparator}>vs</Text>

                  <View style={styles.teamScoreContainer}>
                    <Text style={styles.teamName}>{getTeamNames(2, index)}</Text>
                    <TextInput
                      style={styles.scoreInput}
                      value={game.team2Score}
                      onChangeText={(value) => handleScoreChange(index, 'team2Score', value)}
                      keyboardType="number-pad"
                      placeholder="0"
                      accessibilityLabel={`Score for ${getTeamNames(2, index)}, Game ${index + 1}`}
                      accessibilityHint={`Enter the score for ${getTeamNames(2, index)} in Game ${index + 1}`}
                    />
                  </View>
                </View>
              </View>
            ))}
            <Text style={styles.pointsToWinText}>
              First to {match.pointsToWin} points wins each game
            </Text>
          </Section>
        </ScrollView>

        <View style={styles.footer}>
          <SecondaryButton
            title="Cancel"
            icon="arrow-left"
            onPress={() => navigation.goBack()}
            style={styles.footerButton}
            accessibilityHint="Go back without completing the match"
          />
          <PrimaryButton
            title="Complete Match"
            icon="check-circle"
            onPress={handleCompleteMatch}
            style={styles.footerButton}
            accessibilityHint="Submit the scores and complete the match"
          />
        </View>
      </Animated.View>

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
    paddingBottom: spacing.xxl,
  },
  gameScoreContainer: {
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  gameNumber: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  shuffledIndicator: {
    ...typography.caption,
    color: colors.secondary,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
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
    ...typography.bodySmall,
    color: colors.gray500,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  scoreInput: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    width: 60,
    fontSize: 18,
    textAlign: 'center',
    backgroundColor: colors.white,
  },
  scoreSeparator: {
    ...typography.bodyLarge,
    color: colors.gray500,
    marginHorizontal: spacing.md,
    fontWeight: '600',
  },
  pointsToWinText: {
    ...typography.bodySmall,
    color: colors.gray500,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    justifyContent: 'space-between',
    ...shadows.md,
  },
  footerButton: {
    flex: 1,
    marginHorizontal: spacing.xs,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    ...typography.bodyLarge,
    color: colors.error,
    textAlign: 'center',
  },
  winnerSelector: {
    marginBottom: spacing.md,
  },
  winnerLabel: {
    ...typography.bodySmall,
    color: colors.gray500,
    marginBottom: spacing.xs,
  },
  winnerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  winnerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray100,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  winnerButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  winnerButtonText: {
    ...typography.bodySmall,
    color: colors.neutral,
    textAlign: 'center',
    flex: 1,
  },
  winnerButtonTextSelected: {
    color: colors.white,
    fontWeight: '600',
  },
  inviteContainer: {
    marginTop: spacing.lg,
    marginBottom: spacing.xxl,
    alignItems: 'center',
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.sm,
  },
  inviteButtonText: {
    ...typography.button,
    color: colors.white,
    marginLeft: spacing.sm,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.backdrop,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.xl,
    width: '100%',
    maxWidth: 500,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.primary,
  },
  closeButton: {
    padding: spacing.xs,
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    ...typography.label,
    marginBottom: spacing.sm,
    color: colors.neutral,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    ...typography.bodyLarge,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xxl,
    gap: spacing.sm,
  },
  modalButton: {
    flex: 1,
  },
  inviteMethodContainer: {
    marginBottom: spacing.lg,
  },
  inviteMethodButtons: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  methodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    marginRight: spacing.md,
    flex: 1,
  },
  activeMethodButton: {
    backgroundColor: colors.primary,
  },
  methodButtonText: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.primary,
    marginLeft: spacing.sm,
  },
  activeMethodButtonText: {
    color: colors.white,
  },
});

export default CompleteMatchScreen;
