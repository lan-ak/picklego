import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Platform,
  Alert,
  Modal,
  Switch,
  Keyboard,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Icon } from '../components/Icon';
import { Chip } from '../components/Chip';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { colors, typography, spacing, borderRadius, shadows, layout } from '../theme';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainTabParamList, RootStackParamList, Coordinates, Player } from '../types';
import Layout from '../components/Layout';
import { DismissableModal } from '../components/DismissableModal';
import LocationPicker from '../components/LocationPicker';
import { useVenues } from '../hooks/useVenues';
import { shuffleTeams } from '../utils/shuffleTeams';
import { InvitePlayersModal } from '../components/InvitePlayersModal';
import { AnimatedPressable } from '../components/AnimatedPressable';
import Animated from 'react-native-reanimated';
import { useFadeIn } from '../hooks';

type AddMatchScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'AddMatch'>,
  NativeStackNavigationProp<RootStackParamList>
>;

function formatSmartDate(d: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const AddMatchScreen = () => {
  const fadeStyle = useFadeIn();
  const navigation = useNavigation<AddMatchScreenNavigationProp>();
  const route = useRoute();
  const { players, addMatch, currentUser, matches, updateMatch, sendMatchNotifications, sendMatchUpdateNotifications, refreshConnectedPlayers } = useData();
  const { showToast } = useToast();

  // Check if we're editing an existing match
  const isEditing = route.params && 'isEditing' in route.params ? route.params.isEditing : false;
  const matchId = route.params && 'matchId' in route.params ? route.params.matchId : undefined;
  const existingMatch = matchId ? matches.find(m => m.id === matchId) : null;
  const rematchData = route.params && 'rematch' in route.params
    ? (route.params as NonNullable<RootStackParamList['AddMatch']>).rematch
    : undefined;

  const [date, setDate] = useState(existingMatch ? new Date(existingMatch.scheduledDate) : new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [location, setLocation] = useState(rematchData?.location || existingMatch?.location || '');
  const [locationCoords, setLocationCoords] = useState<Coordinates | undefined>(
    rematchData?.locationCoords || existingMatch?.locationCoords
  );
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const { venues: savedVenues, saveVenue } = useVenues(currentUser?.id);
  const [team1Players, setTeam1Players] = useState<string[]>(
    rematchData ? rematchData.team1PlayerIds :
    existingMatch ? existingMatch.team1PlayerIds :
    (currentUser ? [currentUser.id] : [])
  );
  const [team2Players, setTeam2Players] = useState<string[]>(
    rematchData ? rematchData.team2PlayerIds :
    existingMatch ? existingMatch.team2PlayerIds :
    []
  );
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isDoubles, setIsDoubles] = useState(
    rematchData ? rematchData.isDoubles :
    existingMatch ? existingMatch.matchType === 'doubles' :
    true
  );
  const [pointsToWin, setPointsToWin] = useState(
    rematchData ? rematchData.pointsToWin.toString() :
    existingMatch ? existingMatch.pointsToWin.toString() :
    '11'
  );
  const [numberOfGames, setNumberOfGames] = useState(
    rematchData ? rematchData.numberOfGames.toString() :
    existingMatch ? existingMatch.numberOfGames.toString() :
    '3'
  );
  const [selectedTeam, setSelectedTeam] = useState<1 | 2 | null>(null);
  const [autoRandomize, setAutoRandomize] = useState(false);
  const [shufflePerGame, setShufflePerGame] = useState(
    rematchData?.randomizeTeamsPerGame ?? existingMatch?.randomizeTeamsPerGame ?? false
  );

  const pointsToWinInput = useRef<TextInput>(null);
  const numberOfGamesInput = useRef<TextInput>(null);

  // Refs so the useFocusEffect callback stays stable ([] deps) but reads latest values
  const paramsRef = useRef(route.params);
  paramsRef.current = route.params;
  const matchesRef = useRef(matches);
  matchesRef.current = matches;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  // Permission check: only the match creator can edit
  useEffect(() => {
    if (isEditing && existingMatch && currentUser?.id !== existingMatch.createdBy) {
      Alert.alert(
        'Permission Denied',
        'Only the match creator can edit this match.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    }
  }, [isEditing, existingMatch, currentUser, navigation]);

  // Reset form every time the tab gains focus
  useFocusEffect(
    React.useCallback(() => {
      const params = paramsRef.current as MainTabParamList['AddMatch'];
      const rematch = params?.rematch;
      const editing = params?.isEditing;
      const editMatchId = params?.matchId;
      const editMatch = editMatchId ? matchesRef.current.find(m => m.id === editMatchId) : null;

      if (rematch) {
        setDate(new Date());
        setLocation(rematch.location || '');
        setLocationCoords(rematch.locationCoords);
        setTeam1Players(rematch.team1PlayerIds);
        setTeam2Players(rematch.team2PlayerIds);
        setIsDoubles(rematch.isDoubles);
        setPointsToWin(rematch.pointsToWin.toString());
        setNumberOfGames(rematch.numberOfGames.toString());
        setShufflePerGame(rematch.randomizeTeamsPerGame ?? false);
        setAutoRandomize(false);
      } else if (editing && editMatch) {
        setDate(new Date(editMatch.scheduledDate));
        setLocation(editMatch.location || '');
        setLocationCoords(editMatch.locationCoords);
        setTeam1Players(editMatch.team1PlayerIds);
        setTeam2Players(editMatch.team2PlayerIds);
        setIsDoubles(editMatch.matchType === 'doubles');
        setPointsToWin(editMatch.pointsToWin.toString());
        setNumberOfGames(editMatch.numberOfGames.toString());
        setShufflePerGame(editMatch.randomizeTeamsPerGame ?? false);
        setAutoRandomize(false);
      } else {
        const user = currentUserRef.current;
        setDate(new Date());
        setLocation('');
        setLocationCoords(undefined);
        setTeam1Players(user ? [user.id] : []);
        setTeam2Players([]);
        setIsDoubles(true);
        setPointsToWin('11');
        setNumberOfGames('3');
        setShufflePerGame(false);
        setAutoRandomize(false);
      }

      // Reset transient UI state
      setSelectedTeam(null);
      setShowInviteModal(false);
      setShowDatePicker(false);
      setShowTimePicker(false);
      setShowLocationPicker(false);

      // Clear params so returning to this tab later doesn't re-apply
      navigation.setParams(undefined as any);

      // Refresh connected players to pick up newly accepted connections
      // and prune stale placeholders
      refreshConnectedPlayers();
    }, [])
  );

  const handleDateChange = (event: any, selectedDate?: Date) => {
    const currentDate = selectedDate || date;
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      const newDate = new Date(date);
      newDate.setFullYear(currentDate.getFullYear());
      newDate.setMonth(currentDate.getMonth());
      newDate.setDate(currentDate.getDate());
      setDate(newDate);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    const currentTime = selectedTime || date;
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    if (selectedTime) {
      const newDate = new Date(date);
      newDate.setHours(currentTime.getHours());
      newDate.setMinutes(currentTime.getMinutes());
      setDate(newDate);
    }
  };

  const dismissPicker = () => {
    setShowDatePicker(false);
    setShowTimePicker(false);
  };

  const togglePlayerTeamSelection = (playerId: string) => {
    if (currentUser && playerId === currentUser.id) return; // Prevent deselecting current user

    // REMOVAL
    if (team1Players.includes(playerId)) {
      if (autoRandomize && isDoubles && team2Players.length > 0) {
        // Post-shuffle removal: merge remaining back into pool
        const remaining = [...team1Players, ...team2Players].filter(id => id !== playerId);
        setTeam1Players(remaining);
        setTeam2Players([]);
      } else {
        setTeam1Players(prev => prev.filter(id => id !== playerId));
      }
      return;
    }

    if (team2Players.includes(playerId)) {
      if (autoRandomize && isDoubles) {
        // Post-shuffle removal: merge remaining back into pool
        const remaining = [...team1Players, ...team2Players].filter(id => id !== playerId);
        setTeam1Players(remaining);
        setTeam2Players([]);
      } else {
        setTeam2Players(prev => prev.filter(id => id !== playerId));
      }
      return;
    }

    // ADDITION
    if (autoRandomize && isDoubles) {
      const totalSelected = team1Players.length + team2Players.length;
      if (totalSelected < 4) {
        const newPool = [...team1Players, ...team2Players, playerId];
        if (newPool.length === 4 && currentUser) {
          const { team1, team2 } = shuffleTeams(newPool, currentUser.id);
          setTeam1Players(team1);
          setTeam2Players(team2);
        } else {
          setTeam1Players(newPool);
          setTeam2Players([]);
        }
      } else {
        Alert.alert('Full', 'You can only add 4 players for doubles.');
      }
    } else if (selectedTeam === 1) {
      const maxPlayersPerTeam = isDoubles ? 2 : 1;
      if (team1Players.length < maxPlayersPerTeam) {
        setTeam1Players(prev => [...prev, playerId]);
      } else {
        Alert.alert('Team Full', `You can only add ${maxPlayersPerTeam} player${maxPlayersPerTeam > 1 ? 's' : ''} to each team in ${isDoubles ? 'doubles' : 'singles'} mode.`);
      }
    } else if (selectedTeam === 2) {
      const maxPlayersPerTeam = isDoubles ? 2 : 1;
      if (team2Players.length < maxPlayersPerTeam) {
        setTeam2Players(prev => [...prev, playerId]);
      } else {
        Alert.alert('Team Full', `You can only add ${maxPlayersPerTeam} player${maxPlayersPerTeam > 1 ? 's' : ''} to each team in ${isDoubles ? 'doubles' : 'singles'} mode.`);
      }
    }

    setSelectedTeam(null);
  };

  const isShuffled = autoRandomize && isDoubles && team1Players.length === 2 && team2Players.length === 2;

  const handleShuffleTeams = () => {
    const allPlayers = [...team1Players, ...team2Players];
    if (allPlayers.length !== 4 || !currentUser) return;
    const { team1, team2 } = shuffleTeams(allPlayers, currentUser.id);
    setTeam1Players(team1);
    setTeam2Players(team2);
  };

  const handleToggleAutoRandomize = (value: boolean) => {
    if (value) {
      // ON: merge all players into pool (team1Players), clear team2
      const allPlayers = [...team1Players, ...team2Players];
      if (allPlayers.length === 4 && currentUser) {
        const { team1, team2 } = shuffleTeams(allPlayers, currentUser.id);
        setTeam1Players(team1);
        setTeam2Players(team2);
      } else {
        setTeam1Players(allPlayers);
        setTeam2Players([]);
      }
    } else {
      // OFF: if pool mode (all in team1), split into teams
      if (team2Players.length === 0 && team1Players.length > 2) {
        setTeam1Players(team1Players.slice(0, 2));
        setTeam2Players(team1Players.slice(2));
      }
      // If already shuffled (2+2), keep as-is
    }
    setAutoRandomize(value);
  };

  const openInviteModal = (teamNumber: 1 | 2) => {
    setSelectedTeam(teamNumber);
    setShowInviteModal(true);
  };

  const openInviteModalForPool = () => {
    setSelectedTeam(null);
    setShowInviteModal(true);
  };

  // Called from InvitePlayersModal when a contact already on PickleGo is selected
  const handleInviteExistingPlayer = (player: Player) => {
    addPlayerToTeam(player.id);
    setShowInviteModal(false);
  };

  // Called from InvitePlayersModal when a placeholder is created for a contact
  const handleInvitePlaceholderCreated = (player: Player) => {
    addPlayerToTeam(player.id);
    setShowInviteModal(false);
  };

  // Shared logic to add a player ID to the appropriate team
  const addPlayerToTeam = (playerId: string) => {
    // Don't add duplicates
    if (team1Players.includes(playerId) || team2Players.includes(playerId)) return;

    if (autoRandomize && isDoubles) {
      const totalSelected = team1Players.length + team2Players.length;
      if (totalSelected < 4) {
        const newPool = [...team1Players, ...team2Players, playerId];
        if (newPool.length === 4 && currentUser) {
          const { team1, team2 } = shuffleTeams(newPool, currentUser.id);
          setTeam1Players(team1);
          setTeam2Players(team2);
        } else {
          setTeam1Players(newPool);
          setTeam2Players([]);
        }
      }
    } else if (selectedTeam) {
      const maxPlayersPerTeam = isDoubles ? 2 : 1;
      if (selectedTeam === 1 && team1Players.length < maxPlayersPerTeam) {
        setTeam1Players(prev => [...prev, playerId]);
      } else if (selectedTeam === 2 && team2Players.length < maxPlayersPerTeam) {
        setTeam2Players(prev => [...prev, playerId]);
      }
    }
  };

  const validateMatchSettings = () => {
    const maxPlayersPerTeam = isDoubles ? 2 : 1;
    const errors = [];

    if (team1Players.length !== maxPlayersPerTeam) {
      errors.push(`Team 1 needs exactly ${maxPlayersPerTeam} player${maxPlayersPerTeam > 1 ? 's' : ''}`);
    }

    if (team2Players.length !== maxPlayersPerTeam) {
      errors.push(`Team 2 needs exactly ${maxPlayersPerTeam} player${maxPlayersPerTeam > 1 ? 's' : ''}`);
    }

    if (!pointsToWin || isNaN(parseInt(pointsToWin)) || parseInt(pointsToWin) < 1) {
      errors.push('Please enter a valid number of points to win');
    }

    if (!numberOfGames || isNaN(parseInt(numberOfGames)) || parseInt(numberOfGames) < 1) {
      errors.push('Please enter a valid number of games');
    }

    // Check if number of games is even
    if (numberOfGames && !isNaN(parseInt(numberOfGames)) && parseInt(numberOfGames) % 2 === 0) {
      errors.push('Number of games should be odd to prevent draws');
    }

    return errors;
  };

  const handleScheduleMatch = async (isInstantMatch = false) => {
    const errors = validateMatchSettings();

    // Only validate date for scheduled matches, not instant matches
    if (!isInstantMatch && date < new Date()) {
      errors.push('Please select a future date and time');
    }

    if (errors.length > 0) {
      Alert.alert(
        'Invalid Match Details',
        errors.join('\n'),
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }

    // For instant matches, use current date/time
    const matchDate = isInstantMatch ? new Date() : date;

    try {
      if (isEditing && matchId) {
        // Update existing match
        await updateMatch(String(matchId), {
          scheduledDate: matchDate.toISOString(),
          matchType: isDoubles ? 'doubles' : 'singles',
          team1PlayerIds: team1Players,
          team2PlayerIds: team2Players,
          team1PlayerNames: team1Players.map(id => players.find(p => p.id === id)?.name || 'Unknown'),
          team2PlayerNames: team2Players.map(id => players.find(p => p.id === id)?.name || 'Unknown'),
          allPlayerIds: [...team1Players, ...team2Players],
          location: location.trim() || undefined,
          locationCoords: locationCoords || undefined,
          pointsToWin: parseInt(pointsToWin),
          numberOfGames: parseInt(numberOfGames),
          randomizeTeamsPerGame: shufflePerGame,
        });

        // Send update notifications to all players
        const updatedMatch = matches.find(m => m.id === matchId);
        if (updatedMatch) {
          const result = await sendMatchUpdateNotifications({
            ...updatedMatch,
            scheduledDate: matchDate.toISOString(),
            matchType: isDoubles ? 'doubles' : 'singles',
            team1PlayerIds: team1Players,
            team2PlayerIds: team2Players,
            allPlayerIds: [...team1Players, ...team2Players],
            location: location.trim() || undefined,
          });
          if (result.failed > 0) {
            showToast(`Failed to notify ${result.failed} player${result.failed > 1 ? 's' : ''}`, 'error');
          }
        }

        Alert.alert(
          'Success',
          'Match updated successfully!',
          [
            {
              text: 'OK',
              onPress: () => {
                navigation.navigate('MatchDetails', { matchId: String(matchId) });
              }
            }
          ]
        );
      } else {
        // Create new match
        const newMatch = await addMatch({
          scheduledDate: matchDate.toISOString(),
          matchType: isDoubles ? 'doubles' : 'singles',
          createdBy: currentUser?.id || '',
          team1PlayerIds: team1Players,
          team2PlayerIds: team2Players,
          team1PlayerNames: team1Players.map(id => players.find(p => p.id === id)?.name || 'Unknown'),
          team2PlayerNames: team2Players.map(id => players.find(p => p.id === id)?.name || 'Unknown'),
          allPlayerIds: [...team1Players, ...team2Players],
          games: [],
          winnerTeam: null,
          location: location.trim() || undefined,
          locationCoords: locationCoords || undefined,
          status: 'scheduled',
          pointsToWin: parseInt(pointsToWin),
          numberOfGames: parseInt(numberOfGames),
          randomizeTeamsPerGame: shufflePerGame,
        });

        // Send notifications to all players in the match
        const notifResult = await sendMatchNotifications(newMatch);
        if (notifResult.failed > 0) {
          showToast(`Failed to notify ${notifResult.failed} player${notifResult.failed > 1 ? 's' : ''}`, 'error');
        }
        if (notifResult.sent > 0) {
          await updateMatch(newMatch.id, { notificationsSent: true });
        }

        Alert.alert(
          'Success',
          isInstantMatch ? 'Instant match created!' : 'Match scheduled successfully!',
          [
            {
              text: 'OK',
              onPress: () => {
                if (isInstantMatch) {
                  // For instant matches, navigate to complete the match
                  navigation.navigate('CompleteMatch', { matchId: newMatch.id });
                } else {
                  navigation.navigate('Matches');
                }
              }
            }
          ]
        );
      }
    } catch (error) {
      Alert.alert(
        'Error',
        'Failed to save match. Please try again.',
        [{ text: 'OK', style: 'default' }]
      );
    }
  };

  const renderDateTimePicker = () => {
    if (Platform.OS === 'android') {
      if (showDatePicker) {
        return (
          <DateTimePicker
            value={date}
            mode="date"
            onChange={handleDateChange}
          />
        );
      }
      if (showTimePicker) {
        return (
          <DateTimePicker
            value={date}
            mode="time"
            is24Hour={false}
            onChange={handleTimeChange}
          />
        );
      }
      return null;
    }

    // iOS: wrap spinner in a bottom-sheet Modal
    const isVisible = showDatePicker || showTimePicker;
    if (!isVisible) return null;

    return (
      <DismissableModal
        visible={isVisible}
        onClose={dismissPicker}
        overlayStyle={styles.pickerOverlay}
      >
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>
              {showDatePicker ? 'Select Date' : 'Select Time'}
            </Text>
            <AnimatedPressable
              style={styles.pickerDoneButton}
              onPress={dismissPicker}
              accessibilityLabel="Done"
              accessibilityRole="button"
            >
              <Text style={styles.pickerDoneText}>Done</Text>
            </AnimatedPressable>
          </View>
          <DateTimePicker
            value={date}
            mode={showDatePicker ? 'date' : 'time'}
            is24Hour={false}
            onChange={showDatePicker ? handleDateChange : handleTimeChange}
            display="spinner"
            style={styles.picker}
          />
        </View>
      </DismissableModal>
    );
  };

  const displayName = (playerId: string) => {
    if (currentUser && playerId === currentUser.id) return 'Me';
    return players.find(p => p.id === playerId)?.name || 'Unknown';
  };

  const getTeamLabel = (teamNumber: 1 | 2) => {
    const teamPlayers = teamNumber === 1 ? team1Players : team2Players;
    if (teamPlayers.length === 0) return `Team ${teamNumber}`;
    return teamPlayers.map(id => displayName(id)).join(' & ');
  };

  // Add a component to handle onboarding for first time users
  const OnboardingView = ({ onCreateProfile }: { onCreateProfile: () => void }) => {
    return (
      <View style={styles.onboardingContainer}>
        <View style={styles.onboardingContent}>
          <Icon name="circle-dot" size={80} color={colors.primary} />
          <Text style={styles.onboardingTitle}>Welcome to PickleGo!</Text>
          <Text style={styles.onboardingText}>
            Track your pickleball matches, players, and stats in one place.
          </Text>
          <Text style={styles.onboardingSubtext}>
            Create a profile to get started.
          </Text>

          <AnimatedPressable
            style={styles.onboardingButton}
            onPress={onCreateProfile}
          >
            <Text style={styles.onboardingButtonText}>Create Profile</Text>
            <Icon name="arrow-right" size={20} color={colors.white} />
          </AnimatedPressable>
        </View>
      </View>
    );
  };

  const renderManualMode = () => (
    <>
      <View style={styles.teamContainer}>
        <Text style={styles.teamLabel}>{getTeamLabel(1)}</Text>
        <View style={styles.selectedPlayersContainer}>
          {team1Players.map(playerId => (
            <Chip
              key={playerId}
              variant="primary"
              label={displayName(playerId)}
              onRemove={() => togglePlayerTeamSelection(playerId)}
              accessibilityLabel={`${displayName(playerId)}, Team 1 player`}
            />
          ))}

          {team1Players.length < (isDoubles ? 2 : 1) && (
            <AnimatedPressable
              style={styles.addPlayerButton}
              onPress={() => openInviteModal(1)}
              accessibilityLabel="Add player to Team 1"
              accessibilityRole="button"
              accessibilityHint="Opens player selection for Team 1"
            >
              <Icon name="plus-circle" size={24} color={colors.primary} />
              <Text style={styles.addPlayerButtonText}>Add</Text>
            </AnimatedPressable>
          )}
        </View>
      </View>

      <View style={styles.teamSeparator} />

      <View style={styles.teamContainer}>
        <Text style={styles.teamLabel}>{getTeamLabel(2)}</Text>
        <View style={styles.selectedPlayersContainer}>
          {team2Players.map(playerId => (
            <Chip
              key={playerId}
              variant="primary"
              label={displayName(playerId)}
              onRemove={() => togglePlayerTeamSelection(playerId)}
              accessibilityLabel={`${displayName(playerId)}, Team 2 player`}
            />
          ))}

          {team2Players.length < (isDoubles ? 2 : 1) && (
            <AnimatedPressable
              style={styles.addPlayerButton}
              onPress={() => openInviteModal(2)}
              accessibilityLabel="Add player to Team 2"
              accessibilityRole="button"
              accessibilityHint="Opens player selection for Team 2"
            >
              <Icon name="plus-circle" size={24} color={colors.primary} />
              <Text style={styles.addPlayerButtonText}>Add</Text>
            </AnimatedPressable>
          )}
        </View>
      </View>
    </>
  );

  const renderRandomizeMode = () => {
    const allPlayers = [...team1Players, ...team2Players];

    if (!isShuffled) {
      // Pool mode: show unified player list
      return (
        <View style={styles.teamContainer}>
          <Text style={styles.teamLabel}>Players ({allPlayers.length}/4)</Text>
          <View style={styles.selectedPlayersContainer}>
            {team1Players.map(playerId => (
              <Chip
                key={playerId}
                variant="primary"
                label={displayName(playerId)}
                onRemove={!(currentUser && playerId === currentUser.id) ? () => togglePlayerTeamSelection(playerId) : undefined}
                accessibilityLabel={`${displayName(playerId)}, selected player`}
              />
            ))}

            {allPlayers.length < 4 && (
              <AnimatedPressable
                style={styles.addPlayerButton}
                onPress={openInviteModalForPool}
                accessibilityLabel="Add player"
                accessibilityRole="button"
                accessibilityHint="Opens player selection"
              >
                <Icon name="plus-circle" size={24} color={colors.primary} />
                <Text style={styles.addPlayerButtonText}>Add</Text>
              </AnimatedPressable>
            )}
          </View>
        </View>
      );
    }

    // Post-shuffle: show team assignments with re-shuffle button
    return (
      <>
        <AnimatedPressable
          style={styles.shuffleButton}
          onPress={handleShuffleTeams}

          accessibilityLabel="Re-shuffle Teams"
          accessibilityRole="button"
          accessibilityHint="Randomly reassign the 4 players into new teams"
        >
          <Icon name="shuffle" size={18} color={colors.secondary} />
          <Text style={styles.shuffleButtonText}>Re-shuffle</Text>
        </AnimatedPressable>

        <View style={styles.teamContainer}>
          <Text style={styles.teamLabel}>{getTeamLabel(1)}</Text>
          <View style={styles.selectedPlayersContainer}>
            {team1Players.map(playerId => (
              <Chip
                key={playerId}
                variant="primary"
                label={displayName(playerId)}
                onRemove={() => togglePlayerTeamSelection(playerId)}
                accessibilityLabel={`${displayName(playerId)}, Team 1 player`}
              />
            ))}
          </View>
        </View>

        <View style={styles.teamSeparator} />

        <View style={styles.teamContainer}>
          <Text style={styles.teamLabel}>{getTeamLabel(2)}</Text>
          <View style={styles.selectedPlayersContainer}>
            {team2Players.map(playerId => (
              <Chip
                key={playerId}
                variant="primary"
                label={displayName(playerId)}
                onRemove={() => togglePlayerTeamSelection(playerId)}
                accessibilityLabel={`${displayName(playerId)}, Team 2 player`}
              />
            ))}
          </View>
        </View>
      </>
    );
  };

  // Update the team selection UI in the render method
  const renderTeamSelection = () => (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <Icon name="users" size={24} color={colors.primary} />
        <Text style={styles.sectionTitle}>Select Players</Text>
      </View>

      {isDoubles && (
        <View style={styles.randomizeToggleRow}>
          <View style={styles.randomizeToggleLabelRow}>
            <Icon name="shuffle" size={18} color={colors.secondary} />
            <Text style={styles.randomizeToggleLabel}>Randomize Teams</Text>
          </View>
          <Switch
            value={autoRandomize}
            onValueChange={handleToggleAutoRandomize}
            trackColor={{ false: "#767577", true: colors.secondary }}
            thumbColor="#f4f3f4"
            accessibilityLabel="Randomize teams"
            accessibilityHint="When enabled, players are randomly assigned to teams"
          />
        </View>
      )}

      {autoRandomize && isDoubles ? renderRandomizeMode() : renderManualMode()}
    </View>
  );

  return (
    <Layout title={isEditing ? "Edit Match" : "New Match"} isInTabNavigator={true}>
      <Animated.View style={[{ flex: 1 }, fadeStyle]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="settings" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Game Settings</Text>
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Match Type:</Text>
            <View style={styles.typeSelector}>
              <AnimatedPressable
                style={[styles.typeButton, !isDoubles && styles.typeButtonSelected]}
                onPress={() => {
                  setIsDoubles(false);
                  setAutoRandomize(false);
                  setShufflePerGame(false);
                  setTeam1Players(prev => prev.slice(0, 1));
                  setTeam2Players([]);
                }}
                accessibilityRole="button"
                accessibilityLabel="Singles"
                accessibilityState={{ selected: !isDoubles }}
                accessibilityHint="Select singles match type"
              >
                <Text style={[styles.typeButtonText, !isDoubles && styles.typeButtonTextSelected]}>
                  Singles
                </Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={[styles.typeButton, isDoubles && styles.typeButtonSelected]}
                onPress={() => setIsDoubles(true)}
                accessibilityRole="button"
                accessibilityLabel="Doubles"
                accessibilityState={{ selected: isDoubles }}
                accessibilityHint="Select doubles match type"
              >
                <Text style={[styles.typeButtonText, isDoubles && styles.typeButtonTextSelected]}>
                  Doubles
                </Text>
              </AnimatedPressable>
            </View>
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Points to Win:</Text>
            <TextInput
              style={styles.numberInput}
              value={pointsToWin}
              onChangeText={setPointsToWin}
              keyboardType="number-pad"
              maxLength={2}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => {
                numberOfGamesInput.current?.focus();
              }}
              ref={pointsToWinInput}
              accessibilityLabel="Points to win"
              accessibilityHint="Enter the number of points needed to win a game"
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Number of Games:</Text>
            <TextInput
              style={styles.numberInput}
              value={numberOfGames}
              onChangeText={setNumberOfGames}
              keyboardType="number-pad"
              maxLength={1}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => {
                Keyboard.dismiss();
              }}
              ref={numberOfGamesInput}
              accessibilityLabel="Number of games"
              accessibilityHint="Enter the number of games in the match"
            />
          </View>

          {isDoubles && parseInt(numberOfGames) > 1 && (
            <View style={styles.randomizeToggleRow}>
              <View style={styles.randomizeToggleLabelRow}>
                <Icon name="shuffle" size={18} color={colors.secondary} />
                <Text style={styles.randomizeToggleLabel}>Shuffle teams each game</Text>
              </View>
              <Switch
                value={shufflePerGame}
                onValueChange={setShufflePerGame}
                trackColor={{ false: "#767577", true: colors.secondary }}
                thumbColor="#f4f3f4"
                accessibilityLabel="Shuffle teams each game"
                accessibilityHint="When enabled, teams are randomly reshuffled before each game after the first"
              />
            </View>
          )}
        </View>

        {renderTeamSelection()}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="calendar" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Date & Time</Text>
          </View>

          <View style={styles.dateTimeContainer}>
            <Chip
              label={`${formatSmartDate(date)} ▾`}
              icon="calendar"
              variant="primary"
              onPress={() => {
                setShowTimePicker(false);
                setShowDatePicker(true);
              }}
              accessibilityLabel={`Match date: ${date.toLocaleDateString()}`}
            />
            <Chip
              label={`${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ▾`}
              icon="clock"
              variant="primary"
              onPress={() => {
                setShowDatePicker(false);
                setShowTimePicker(true);
              }}
              accessibilityLabel={`Match time: ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="map-pin" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Location</Text>
          </View>
          <AnimatedPressable
            style={styles.locationRow}
            onPress={() => setShowLocationPicker(true)}
  
            accessibilityLabel="Set match location"
            accessibilityHint="Opens a map to select the match location"
            accessibilityRole="button"
          >
            <Icon
              name="map-pin"
              size={18}
              color={location ? colors.primary : colors.gray400}
            />
            <Text
              style={[
                styles.locationRowText,
                !location && styles.locationRowPlaceholder,
              ]}
              numberOfLines={1}
            >
              {location || 'Tap to set location (optional)'}
            </Text>
            <Icon name="chevron-right" size={18} color={colors.gray400} />
          </AnimatedPressable>
          {location ? (
            <AnimatedPressable
              style={styles.locationClear}
              onPress={() => {
                setLocation('');
                setLocationCoords(undefined);
              }}
    
              accessibilityLabel="Clear location"
              accessibilityRole="button"
            >
              <Icon name="x" size={14} color={colors.gray400} />
              <Text style={styles.locationClearText}>Clear location</Text>
            </AnimatedPressable>
          ) : null}
        </View>

        <Modal
          visible={showLocationPicker}
          animationType="slide"
          presentationStyle="fullScreen"
        >
          <LocationPicker
            initialLocation={location}
            initialCoords={locationCoords}
            savedVenues={savedVenues}
            onLocationConfirmed={(loc, coords) => {
              setLocation(loc);
              setLocationCoords(coords);
              setShowLocationPicker(false);
              // Auto-save location if not already saved
              const alreadySaved = savedVenues.some((v) => v.name === loc);
              if (!alreadySaved) {
                saveVenue({ name: loc, address: loc, coords, isFavorite: false });
              }
            }}
            onCancel={() => setShowLocationPicker(false)}
          />
        </Modal>

        <View style={styles.buttonsContainer}>
          <AnimatedPressable
            style={styles.scheduleButton}
            onPress={() => handleScheduleMatch(false)}
  
            accessibilityLabel={isEditing ? "Save Changes" : "Schedule Game"}
            accessibilityRole="button"
            accessibilityHint={isEditing ? "Save the edited match details" : "Schedule the match for the selected date and time"}
          >
            <Icon name={isEditing ? "save" : "calendar"} size={24} color={colors.white} />
            <Text style={styles.scheduleButtonText}>
              {isEditing ? "Save Changes" : "Schedule Game"}
            </Text>
          </AnimatedPressable>

          {!isEditing && (
            <AnimatedPressable
              style={styles.playNowButton}
              onPress={() => handleScheduleMatch(true)}
    
              accessibilityLabel="Play Game Now"
              accessibilityRole="button"
              accessibilityHint="Create an instant match and start playing immediately"
            >
              <Icon name="play" size={24} color={colors.white} />
              <Text style={styles.playNowButtonText}>Play Game Now</Text>
            </AnimatedPressable>
          )}
        </View>
      </ScrollView>
      </Animated.View>
      {renderDateTimePicker()}
      <InvitePlayersModal
        visible={showInviteModal}
        onClose={() => { setShowInviteModal(false); setSelectedTeam(null); }}
        context="addMatch"
        teamLabel={selectedTeam ? `Select Player for Team ${selectedTeam}` : 'Add Player'}
        excludePlayerIds={[...team1Players, ...team2Players]}
        onSelectExistingPlayer={handleInviteExistingPlayer}
        onPlaceholderCreated={handleInvitePlaceholderCreated}
      />
    </Layout>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: layout.TAB_BAR_HEIGHT + spacing.xxxl,
  },
  section: {
    backgroundColor: colors.white,
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.md,
    ...shadows.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.primary,
    marginLeft: spacing.sm,
    textAlign: 'center',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  settingLabel: {
    ...typography.bodyLarge,
    color: colors.neutral,
  },
  typeSelector: {
    flexDirection: 'row',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    overflow: 'hidden',
  },
  typeButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
  },
  typeButtonSelected: {
    backgroundColor: colors.primary,
  },
  typeButtonText: {
    ...typography.button,
    color: colors.primary,
  },
  typeButtonTextSelected: {
    color: colors.white,
  },
  numberInput: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    width: 60,
    textAlign: 'center',
    fontSize: 16,
  },
  dateTimeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    gap: spacing.sm,
  },
  locationRowText: {
    ...typography.bodySmall,
    color: colors.neutral,
    flex: 1,
  },
  locationRowPlaceholder: {
    color: colors.gray400,
  },
  locationClear: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  locationClearText: {
    ...typography.caption,
    color: colors.gray400,
  },
  teamsContainer: {
    marginBottom: spacing.lg,
  },
  teamSection: {
    marginBottom: spacing.lg,
  },
  teamLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  selectedPlayers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  teamDivider: {
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  vsText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.gray500,
  },
  availablePlayers: {
    marginTop: spacing.lg,
  },
  availablePlayersLabel: {
    ...typography.bodySmall,
    color: colors.gray500,
    marginBottom: spacing.sm,
  },
  playerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  playerButton: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.gray100,
    minWidth: '48%',
    flexGrow: 1,
  },
  playerButtonText: {
    ...typography.bodySmall,
    color: colors.neutral,
    textAlign: 'center',
  },
  addPlayerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 44,
    backgroundColor: colors.primaryOverlay,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.primary,
    margin: spacing.xs,
  },
  addPlayerButtonText: {
    ...typography.label,
    color: colors.primary,
    marginLeft: spacing.xs,
    fontWeight: '600',
  },
  buttonsContainer: {
    margin: spacing.lg,
    marginTop: spacing.xxl,
    gap: spacing.lg,
  },
  scheduleButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  playNowButton: {
    backgroundColor: colors.action,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleButtonText: {
    ...typography.button,
    color: colors.white,
    fontSize: 18,
    marginLeft: spacing.md,
  },
  playNowButtonText: {
    ...typography.button,
    color: colors.white,
    fontSize: 18,
    marginLeft: spacing.md,
  },
  onboardingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  onboardingContent: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: spacing.xxxl,
    alignItems: 'center',
    width: '100%',
    ...shadows.lg,
  },
  onboardingTitle: {
    ...typography.h2,
    color: colors.neutral,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  onboardingText: {
    ...typography.bodyLarge,
    color: colors.gray500,
    marginBottom: spacing.md,
    textAlign: 'center',
    lineHeight: 24,
  },
  onboardingSubtext: {
    ...typography.bodyLarge,
    color: colors.gray500,
    marginBottom: spacing.md,
    textAlign: 'center',
    lineHeight: 24,
  },
  onboardingButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  onboardingButtonText: {
    ...typography.button,
    color: colors.white,
    fontSize: 18,
    marginRight: spacing.sm,
  },
  selectedPlayersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    padding: spacing.sm,
  },
  addPlayerText: {
    ...typography.bodySmall,
    color: colors.primary,
    marginLeft: spacing.xs,
  },
  teamSeparator: {
    height: 1,
    backgroundColor: colors.cardBorder,
    marginVertical: spacing.xl,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xxl,
    justifyContent: 'center',
  },
  teamContainer: {
    marginVertical: spacing.lg,
    alignItems: 'center',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: colors.backdrop,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  pickerContainer: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    width: '100%',
    maxWidth: 400,
    ...shadows.lg,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
  },
  pickerTitle: {
    ...typography.h3,
    color: colors.neutral,
  },
  pickerDoneButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  pickerDoneText: {
    ...typography.button,
    color: colors.primary,
    fontSize: 17,
  },
  picker: {
    height: 216,
  },
  shuffleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondaryOverlay,
    borderWidth: 1,
    borderColor: colors.secondary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignSelf: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  shuffleButtonText: {
    ...typography.button,
    color: colors.secondary,
    fontSize: 14,
  },
  randomizeToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.secondaryOverlay,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.secondary,
  },
  randomizeToggleLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  randomizeToggleLabel: {
    ...typography.bodySmall,
    color: colors.secondary,
    fontWeight: '600',
  },
});

export default AddMatchScreen;
