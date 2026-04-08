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
  Keyboard,
  Share,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect, CommonActions } from '@react-navigation/native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { formatSmartDate as formatSmartDateUtil, formatAccessibleDate, formatTime } from '../utils/dateFormat';
import { Icon } from '../components/Icon';

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
import { InvitePlayersModal } from '../components/InvitePlayersModal';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { PrimaryButton } from '../components/Button';
import { PlayerSlots } from '../components/PlayerSlots';
import { Section } from '../components/Section';
import { SegmentedControl } from '../components/SegmentedControl';
import { FormRow } from '../components/FormRow';
import { ToggleRow } from '../components/ToggleRow';
import Animated from 'react-native-reanimated';
import { useFadeIn } from '../hooks';
import { usePlacement } from 'expo-superwall';
import { generateOpenMatchLink } from '../services/appsflyer';
import { buildMatchShareMessage } from '../utils/shareMatch';
import { PLACEMENTS } from '../services/superwallPlacements';
import { shuffleTeams } from '../utils/shuffleTeams';

type AddMatchScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'AddMatch'>,
  NativeStackNavigationProp<RootStackParamList>
>;

function formatSmartDate(d: Date): string {
  return formatSmartDateUtil(d);
}

const AddMatchScreen = () => {
  const fadeStyle = useFadeIn();
  const navigation = useNavigation<AddMatchScreenNavigationProp>();
  const route = useRoute();
  const { players, addMatch, createOpenMatch, currentUser, matches, updateMatch, refreshConnectedPlayers, getPlayerName } = useData();
  const { showToast } = useToast();
  const { registerPlacement } = usePlacement();

  // Check if we're editing an existing match
  const isEditing = route.params && 'isEditing' in route.params ? route.params.isEditing : false;
  const matchId = route.params && 'matchId' in route.params ? route.params.matchId : undefined;
  const existingMatch = matchId ? matches.find(m => m.id === matchId) : null;
  const rematchData = route.params && 'rematch' in route.params
    ? (route.params as NonNullable<RootStackParamList['AddMatch']>).rematch
    : undefined;
  const onboardingMode = route.params && 'onboardingMode' in route.params
    ? (route.params as any).onboardingMode === true
    : false;

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
  type TeamMode = 'manual' | 'open';
  const [teamMode, setTeamMode] = useState<TeamMode>('manual');
  const isOpenMatch = teamMode === 'open';
  const [shufflePerGame, setShufflePerGame] = useState(
    rematchData?.randomizeTeamsPerGame ?? existingMatch?.randomizeTeamsPerGame ?? false
  );
  const [openMatchPool, setOpenMatchPool] = useState<string[]>(currentUser ? [currentUser.id] : []);

  const scrollRef = useRef<ScrollView>(null);
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
        setTeamMode('manual');
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
        setTeamMode('manual');
      } else {
        // Superwall: fire placement when user taps "New Match"
        registerPlacement({ placement: PLACEMENTS.ADD_MATCH_TAPPED });

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
        setTeamMode('manual');
      }

      // Reset transient UI state
      setSelectedTeam(null);
      setShowInviteModal(false);
      setShowDatePicker(false);
      setShowTimePicker(false);
      setShowLocationPicker(false);
      setOpenMatchPool(currentUserRef.current ? [currentUserRef.current.id] : []);

      // Clear params so returning to this tab later doesn't re-apply
      navigation.setParams(undefined as any);

      // Scroll to top when tab gains focus
      scrollRef.current?.scrollTo({ y: 0, animated: false });

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

  const handleTeamModeChange = (newMode: TeamMode) => {
    if (newMode === teamMode) return;

    if (newMode === 'open') {
      setOpenMatchPool(currentUser ? [currentUser.id] : []);
    }

    setTeamMode(newMode);
  };

  const openInviteModal = (teamNumber: 1 | 2) => {
    setSelectedTeam(teamNumber);
    setShowInviteModal(true);
  };

  const openInviteModalForOpenMatch = () => {
    setSelectedTeam(null);
    setShowInviteModal(true);
  };

  const addPlayerToOpenMatchPool = (playerId: string) => {
    if (openMatchPool.includes(playerId)) return;
    const maxPlayers = isDoubles ? 4 : 2;
    if (openMatchPool.length >= maxPlayers) {
      Alert.alert('Full', `You can only add ${maxPlayers} players.`);
      return;
    }
    setOpenMatchPool(prev => [...prev, playerId]);
  };

  const removePlayerFromOpenMatchPool = (playerId: string) => {
    if (currentUser && playerId === currentUser.id) return;
    setOpenMatchPool(prev => prev.filter(id => id !== playerId));
  };

  const handleCreateOpenMatch = async () => {
    const errors: string[] = [];

    if (date < new Date()) {
      errors.push('Please select a future date and time');
    }
    if (!pointsToWin || isNaN(parseInt(pointsToWin)) || parseInt(pointsToWin) < 1) {
      errors.push('Please enter a valid number of points to win');
    }
    if (!numberOfGames || isNaN(parseInt(numberOfGames)) || parseInt(numberOfGames) < 1) {
      errors.push('Please enter a valid number of games');
    }
    if (numberOfGames && !isNaN(parseInt(numberOfGames)) && parseInt(numberOfGames) % 2 === 0) {
      errors.push('Number of games should be odd to prevent draws');
    }

    if (errors.length > 0) {
      Alert.alert('Invalid Match Details', errors.join('\n'), [{ text: 'OK' }]);
      return;
    }

    const maxPlayers = isDoubles ? 4 : 2;
    const poolIsFull = openMatchPool.length >= maxPlayers;

    try {
      let team1PlayerIds: string[] = [];
      let team2PlayerIds: string[] = [];
      let team1PlayerNames: string[] = [];
      let team2PlayerNames: string[] = [];

      if (poolIsFull && currentUser) {
        const { team1, team2 } = shuffleTeams(openMatchPool, currentUser.id);
        team1PlayerIds = team1;
        team2PlayerIds = team2;
        team1PlayerNames = team1.map(id => getPlayerName(id));
        team2PlayerNames = team2.map(id => getPlayerName(id));
      }

      const newMatch = await createOpenMatch({
        scheduledDate: date.toISOString(),
        matchType: isDoubles ? 'doubles' : 'singles',
        createdBy: currentUser?.id || '',
        team1PlayerIds,
        team2PlayerIds,
        team1PlayerNames,
        team2PlayerNames,
        allPlayerIds: openMatchPool,
        games: [],
        winnerTeam: null,
        location: location.trim() || undefined,
        locationCoords: locationCoords || undefined,
        status: 'scheduled',
        pointsToWin: parseInt(pointsToWin),
        numberOfGames: parseInt(numberOfGames),
        randomizeTeamsPerGame: shufflePerGame,
        isOpenInvite: true,
        openInviteStatus: poolIsFull ? 'full' : 'open',
        playerPool: poolIsFull ? [] : openMatchPool,
        playerPoolNames: poolIsFull ? [] : openMatchPool.map(id => getPlayerName(id)),
        maxPlayers,
      });

      if (!poolIsFull) {
        // Generate deep link and share
        const link = await generateOpenMatchLink(newMatch.id);
        const message = buildMatchShareMessage({
          link,
          scheduledDate: date,
          location: location.trim() || undefined,
          matchType: isDoubles ? 'doubles' : 'singles',
          numberOfGames: parseInt(numberOfGames),
          pointsToWin: parseInt(pointsToWin),
          currentPlayers: openMatchPool.length,
          maxPlayers,
        });

        await Share.share({ message });
      }

      if (onboardingMode) {
        navigation.dispatch(
          CommonActions.navigate({ name: 'Celebration', params: { matchCreated: true } })
        );
      } else {
        navigation.navigate('MatchDetails', { matchId: newMatch.id });
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to create open match. Please try again.', [{ text: 'OK' }]);
    }
  };

  // Called from InvitePlayersModal when a contact already on PickleGo is selected
  const handleInviteExistingPlayer = (player: Player) => {
    if (isOpenMatch) {
      addPlayerToOpenMatchPool(player.id);
    } else {
      addPlayerToTeam(player.id);
    }
    setShowInviteModal(false);
  };

  // Called from InvitePlayersModal when a placeholder is created for a contact
  const handleInvitePlaceholderCreated = (player: Player) => {
    if (isOpenMatch) {
      addPlayerToOpenMatchPool(player.id);
    } else {
      addPlayerToTeam(player.id);
    }
    setShowInviteModal(false);
  };

  // Shared logic to add a player ID to the appropriate team
  const addPlayerToTeam = (playerId: string) => {
    if (team1Players.includes(playerId) || team2Players.includes(playerId)) return;

    if (selectedTeam) {
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
          team1PlayerNames: team1Players.map(id => getPlayerName(id)),
          team2PlayerNames: team2Players.map(id => getPlayerName(id)),
          allPlayerIds: [...team1Players, ...team2Players],
          location: location.trim() || undefined,
          locationCoords: locationCoords || undefined,
          pointsToWin: parseInt(pointsToWin),
          numberOfGames: parseInt(numberOfGames),
          randomizeTeamsPerGame: shufflePerGame,
        });

        // Notifications are now handled server-side via Firestore triggers

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
        // Superwall: fire placement for analytics (non-blocking)
        registerPlacement({
          placement: PLACEMENTS.MATCH_CREATE,
          params: { match_count: matches.length },
        });

        // Create new match
        const newMatch = await addMatch({
          scheduledDate: matchDate.toISOString(),
          matchType: isDoubles ? 'doubles' : 'singles',
          createdBy: currentUser?.id || '',
          team1PlayerIds: team1Players,
          team2PlayerIds: team2Players,
          team1PlayerNames: team1Players.map(id => getPlayerName(id)),
          team2PlayerNames: team2Players.map(id => getPlayerName(id)),
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

        // Notifications are now handled server-side via Firestore triggers

        if (onboardingMode) {
          // In onboarding, go to celebration screen
          navigation.dispatch(
            CommonActions.navigate({ name: 'Celebration', params: { matchCreated: true } })
          );
        } else {
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
    return getPlayerName(playerId);
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

          <PrimaryButton
            title="Create Profile"
            icon="arrow-right"
            onPress={onCreateProfile}
            style={styles.onboardingButton}
          />
        </View>
      </View>
    );
  };

  const toSlots = (ids: string[]) =>
    ids.map(id => {
      const player = players.find(p => p.id === id);
      return { id, name: player?.name || getPlayerName(id), profilePic: player?.profilePic };
    });

  const maxPerTeam = isDoubles ? 2 : 1;

  const renderManualMode = () => (
    <>
      <View style={styles.teamContainer}>
        <Text style={styles.teamLabel}>{getTeamLabel(1)}</Text>
        <PlayerSlots
          players={toSlots(team1Players)}
          maxSlots={maxPerTeam}
          currentUserId={currentUser?.id}
          onAddPlayer={team1Players.length < maxPerTeam ? () => openInviteModal(1) : undefined}
        />
      </View>

      <View style={styles.teamSeparator} />

      <View style={styles.teamContainer}>
        <Text style={styles.teamLabel}>{getTeamLabel(2)}</Text>
        <PlayerSlots
          players={toSlots(team2Players)}
          maxSlots={maxPerTeam}
          currentUserId={currentUser?.id}
          onAddPlayer={team2Players.length < maxPerTeam ? () => openInviteModal(2) : undefined}
        />
      </View>
    </>
  );

  const renderOpenMatchMode = () => {
    const maxPlayers = isDoubles ? 4 : 2;
    const poolSlots = openMatchPool.map(id => {
      const player = players.find(p => p.id === id);
      return {
        id,
        name: player?.name || getPlayerName(id),
        profilePic: player?.profilePic,
      };
    });

    return (
      <View style={styles.openMatchContainer}>
        <Text style={styles.openMatchHint}>
          Pick {maxPlayers} players and teams are assigned randomly, or create an open game and teams are assigned once the match is full.
        </Text>
        <PlayerSlots
          players={poolSlots}
          maxSlots={maxPlayers}
          currentUserId={currentUser?.id}
          onAddPlayer={openMatchPool.length < maxPlayers ? openInviteModalForOpenMatch : undefined}
          onRemovePlayer={removePlayerFromOpenMatchPool}
        />
      </View>
    );
  };

  // Update the team selection UI in the render method
  const renderTeamSelection = () => (
    <Section title="Select Players" icon="users">
      {!isEditing && (
        <SegmentedControl
          options={[
            { label: 'Pick Teams', value: 'manual' },
            { label: 'Open Match', value: 'open' },
          ]}
          selected={teamMode}
          onChange={handleTeamModeChange}
          accessibilityLabel="Team selection mode"
        />
      )}

      {isOpenMatch ? renderOpenMatchMode() : renderManualMode()}
    </Section>
  );

  return (
    <Layout title={isEditing ? "Edit Match" : "New Match"} isInTabNavigator={true}>
      <Animated.View style={[{ flex: 1 }, fadeStyle]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <Section title="Game Settings" icon="settings">
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Match Type:</Text>
            <SegmentedControl
              options={[
                { label: 'Singles', value: 'singles' },
                { label: 'Doubles', value: 'doubles' },
              ]}
              selected={isDoubles ? 'doubles' : 'singles'}
              size="small"
              onChange={(v) => {
                if (v === 'singles') {
                  setIsDoubles(false);
                  setShufflePerGame(false);
                  setTeam1Players(prev => prev.slice(0, 1));
                  setTeam2Players([]);
                  setOpenMatchPool(prev => prev.slice(0, 2));
                } else {
                  setIsDoubles(true);
                }
              }}
              accessibilityLabel="Match type"
            />
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

          {isDoubles && parseInt(numberOfGames) > 1 && teamMode === 'open' && (
            <ToggleRow
              label="Re-shuffle players between games"
              icon="shuffle"
              value={shufflePerGame}
              onValueChange={setShufflePerGame}
              tintColor={colors.secondary}
              tinted
              accessibilityHint="When enabled, teams are randomly reshuffled before each game after the first"
            />
          )}
        </Section>

        {renderTeamSelection()}

        <Section title="Date & Time" icon="calendar">
          <View style={styles.dateTimeContainer}>
            <FormRow
              icon="calendar"
              text={formatSmartDate(date)}
              onPress={() => { setShowTimePicker(false); setShowDatePicker(true); }}
              accessibilityLabel={`Match date: ${formatAccessibleDate(date)}`}
            />
            <FormRow
              icon="clock"
              text={formatTime(date)}
              onPress={() => { setShowDatePicker(false); setShowTimePicker(true); }}
              accessibilityLabel={`Match time: ${formatTime(date)}`}
            />
          </View>
        </Section>

        <Section title="Location" icon="map-pin">
          <FormRow
            icon="map-pin"
            iconColor={location ? colors.primary : colors.gray400}
            text={location || 'Tap to set location (optional)'}
            placeholder={!location}
            onPress={() => setShowLocationPicker(true)}
            accessibilityLabel="Set match location"
            accessibilityHint="Opens a map to select the match location"
          />
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
        </Section>

        <Modal
          visible={showLocationPicker}
          animationType="slide"
          presentationStyle="fullScreen"
        >
          <LocationPicker
            initialLocation={location}
            initialCoords={locationCoords}
            savedVenues={savedVenues}
            onLocationConfirmed={(loc, coords, placeId, isExistingVenue) => {
              setLocation(loc);
              setLocationCoords(coords);
              setShowLocationPicker(false);
              // Don't auto-save if user picked an already-saved venue
              if (isExistingVenue) return;
              // Check dedup: placeId match, or coords proximity (~50m)
              const alreadySaved = savedVenues.some((v) => {
                if (placeId && v.placeId && v.placeId === placeId) return true;
                const dlat = v.coords.latitude - coords.latitude;
                const dlng = v.coords.longitude - coords.longitude;
                return (dlat * dlat + dlng * dlng) < 0.00045 * 0.00045;
              });
              if (!alreadySaved) {
                saveVenue({ name: loc, address: loc, coords, placeId, isFavorite: false });
              }
            }}
            onCancel={() => setShowLocationPicker(false)}
          />
        </Modal>

        <View style={styles.buttonsContainer}>
          {isOpenMatch ? (
            <PrimaryButton
              title={openMatchPool.length >= (isDoubles ? 4 : 2) ? "Shuffle & Create" : "Create & Share"}
              icon={openMatchPool.length >= (isDoubles ? 4 : 2) ? "shuffle" : "share-2"}
              onPress={handleCreateOpenMatch}
              accessibilityHint={openMatchPool.length >= (isDoubles ? 4 : 2) ? "Randomize teams and create the match" : "Create an open match and share a link for others to join"}
            />
          ) : (
            <PrimaryButton
              title={isEditing ? "Save Changes" : "Create"}
              icon={isEditing ? "save" : "plus"}
              onPress={() => handleScheduleMatch(false)}
              accessibilityHint={isEditing ? "Save the edited match details" : "Create the match"}
            />
          )}
        </View>
      </ScrollView>
      </Animated.View>
      {renderDateTimePicker()}
      <InvitePlayersModal
        visible={showInviteModal}
        onClose={() => { setShowInviteModal(false); setSelectedTeam(null); }}
        context="addMatch"
        teamLabel={isOpenMatch ? 'Add Player' : selectedTeam ? `Select Player for Team ${selectedTeam}` : 'Add Player'}
        excludePlayerIds={isOpenMatch ? openMatchPool : [...team1Players, ...team2Players]}
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
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  settingLabel: {
    ...typography.bodyLarge,
    color: colors.neutral,
    flexShrink: 0,
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
    gap: spacing.sm,
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
    borderRadius: borderRadius.pill,
    marginTop: spacing.sm,
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
  openMatchContainer: {
    marginTop: spacing.md,
  },
  openMatchHint: {
    ...typography.bodySmall,
    color: colors.gray500,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
});

export default AddMatchScreen;
