import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../components/Icon';
import { useData } from '../context/DataContext';
import { format } from 'date-fns';
import Layout from '../components/Layout';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainTabParamList, RootStackParamList, Match } from '../types';

type MatchesScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Matches'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type MatchesTab = 'all' | 'upcoming' | 'completed' | 'won' | 'lost';

const MatchesScreen = () => {
  const navigation = useNavigation<MatchesScreenNavigationProp>();
  const { matches, players, currentUser, getPlayerName } = useData();
  const [activeTab, setActiveTab] = useState<MatchesTab>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Sort comparator based on sort order
  const sortByDate = (a: Match, b: Match) => {
    const timeA = new Date(a.scheduledDate).getTime();
    const timeB = new Date(b.scheduledDate).getTime();
    return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
  };

  // Filter matches based on active tab
  const getFilteredMatches = (): typeof matches => {
    switch (activeTab) {
      case 'all':
        return [...matches].sort(sortByDate);

      case 'upcoming':
        return matches
          .filter(match => match.status === 'scheduled')
          .sort(sortByDate);

      case 'completed':
        return matches
          .filter(match => match.status === 'completed')
          .sort(sortByDate);

      case 'won':
        return matches
          .filter(match => {
            if (!currentUser || match.status !== 'completed' || match.winnerTeam === null) return false;
            const participated = isUserInMatch(match, currentUser.id);
            if (!participated) return false;
            return isUserWinner(match, currentUser.id);
          })
          .sort(sortByDate);

      case 'lost':
        return matches
          .filter(match => {
            if (!currentUser || match.status !== 'completed' || match.winnerTeam === null) return false;
            const participated = isUserInMatch(match, currentUser.id);
            if (!participated) return false;
            return !isUserWinner(match, currentUser.id);
          })
          .sort(sortByDate);

      default:
        return matches;
    }
  };

  // Helper function to check if a user is in a match
  const isUserInMatch = (match: Match, userId: string): boolean => {
    return match.allPlayerIds.includes(userId);
  };

  // Helper function to check if a user is a winner of a match
  const isUserWinner = (match: Match, userId: string): boolean => {
    if (match.winnerTeam === null) return false;
    const userTeam = match.team1PlayerIds.includes(userId) ? 1 : match.team2PlayerIds.includes(userId) ? 2 : null;
    return match.winnerTeam === userTeam;
  };

  const filteredMatches = getFilteredMatches();

  const getTeamNames = (match: Match, teamNumber: 1 | 2) => {
    const teamPlayerIds = teamNumber === 1 ? match.team1PlayerIds : match.team2PlayerIds;
    if (match.matchType !== 'doubles') {
      // For singles, just return the single player name
      const playerId = teamPlayerIds[0];
      const fullName = getPlayerName(playerId);
      return formatPlayerNameWithInitial(fullName);
    }
    return teamPlayerIds.map(id => formatPlayerNameWithInitial(getPlayerName(id))).join(' & ');
  };

  const isTeamWinner = (match: Match, teamNumber: 1 | 2) => {
    return match.winnerTeam === teamNumber;
  };

  // Helper function to determine which team the user is on
  const getUserTeamNumber = (match: Match, userId: string): 1 | 2 | null => {
    if (!userId) return null;
    if (match.team1PlayerIds.includes(userId)) return 1;
    if (match.team2PlayerIds.includes(userId)) return 2;
    return null;
  };

  // Add this helper function for formatting names with first name and last initial
  const formatPlayerNameWithInitial = (fullName: string) => {
    const parts = fullName.trim().split(' ');
    if (parts.length < 2) return fullName; // Return as is if no space found

    const firstName = parts[0];
    const lastInitial = parts[parts.length - 1][0]; // First character of last name

    return `${firstName} ${lastInitial}.`;
  };

  const renderTabs = () => (
    <View style={styles.tabsContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsScrollContent}
      >
        <TouchableOpacity
          style={[styles.tab, activeTab === 'all' && styles.activeTab]}
          onPress={() => setActiveTab('all')}
          accessibilityRole="tab"
          accessibilityLabel="All"
          accessibilityState={{ selected: activeTab === 'all' }}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText]}>All</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'upcoming' && styles.activeTab]}
          onPress={() => setActiveTab('upcoming')}
          accessibilityRole="tab"
          accessibilityLabel="Upcoming"
          accessibilityState={{ selected: activeTab === 'upcoming' }}
        >
          <Text style={[styles.tabText, activeTab === 'upcoming' && styles.activeTabText]}>Upcoming</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'completed' && styles.activeTab]}
          onPress={() => setActiveTab('completed')}
          accessibilityRole="tab"
          accessibilityLabel="Completed"
          accessibilityState={{ selected: activeTab === 'completed' }}
        >
          <Text style={[styles.tabText, activeTab === 'completed' && styles.activeTabText]}>Completed</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'won' && styles.activeTab]}
          onPress={() => setActiveTab('won')}
          accessibilityRole="tab"
          accessibilityLabel="Won"
          accessibilityState={{ selected: activeTab === 'won' }}
        >
          <Text style={[styles.tabText, activeTab === 'won' && styles.activeTabText]}>Won</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'lost' && styles.activeTab]}
          onPress={() => setActiveTab('lost')}
          accessibilityRole="tab"
          accessibilityLabel="Lost"
          accessibilityState={{ selected: activeTab === 'lost' }}
        >
          <Text style={[styles.tabText, activeTab === 'lost' && styles.activeTabText]}>Lost</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  const renderMatch = (match: typeof matches[0]) => {
    const userTeam = currentUser ? getUserTeamNumber(match, currentUser.id) : null;
    const isUserMatch = userTeam !== null;
    const didUserWin = isUserMatch && match.status === 'completed' && isUserWinner(match, currentUser!.id);
    const didUserLose = isUserMatch && match.status === 'completed' && !isUserWinner(match, currentUser!.id);

    return (
      <TouchableOpacity
        key={match.id}
        style={[
          styles.matchCard,
          didUserWin && styles.winMatchCard,
          didUserLose && styles.lossMatchCard
        ]}
        onPress={() => {
          navigation.navigate('MatchDetails', { matchId: match.id });
        }}
        accessibilityRole="button"
        accessibilityLabel={`${getTeamNames(match, 1)} vs ${getTeamNames(match, 2)}, ${format(new Date(match.scheduledDate), 'MMM d, yyyy')}`}
        accessibilityHint="View match details"
      >
        <View style={styles.matchHeader}>
          <Text style={styles.matchDate}>
            {format(new Date(match.scheduledDate), 'MMM d, yyyy - h:mm a')}
          </Text>
          {match.status === 'completed' && (
            <View style={[
              styles.statusBadge,
              didUserWin && styles.winStatusBadge,
              didUserLose && styles.lossStatusBadge
            ]}>
              {didUserWin && (
                <>
                  <Icon name="trophy" size={16} color={colors.primary} />
                  <Text style={styles.winStatusText}>Won</Text>
                </>
              )}
              {didUserLose && (
                <>
                  <Icon name="x-circle" size={16} color={colors.loss} />
                  <Text style={styles.lossStatusText}>Lost</Text>
                </>
              )}
              {!isUserMatch && (
                <>
                  <Icon name="check-circle" size={16} color={colors.primary} />
                  <Text style={styles.statusText}>Completed</Text>
                </>
              )}
            </View>
          )}
        </View>

        <Text style={styles.matchType}>
          {match.matchType === 'doubles' ? 'Doubles' : 'Singles'} • {match.pointsToWin} pts • Best of {match.numberOfGames}
        </Text>

        <View style={styles.teamsContainer}>
          <Text style={[
            styles.teamName,
            match.status === 'completed' && isTeamWinner(match, 1) && styles.winningTeam,
            userTeam === 1 && styles.userTeam,
            userTeam === 1 && didUserWin && styles.userWonTeam,
            userTeam === 1 && didUserLose && styles.userLostTeam
          ]}>
            {getTeamNames(match, 1)}
            {match.status === 'completed' && isTeamWinner(match, 1) && ' (Winner)'}
            {userTeam === 1 && ' (You)'}
          </Text>
          <Text style={styles.teamSeparator}>vs</Text>
          <Text style={[
            styles.teamName,
            match.status === 'completed' && isTeamWinner(match, 2) && styles.winningTeam,
            userTeam === 2 && styles.userTeam,
            userTeam === 2 && didUserWin && styles.userWonTeam,
            userTeam === 2 && didUserLose && styles.userLostTeam
          ]}>
            {getTeamNames(match, 2)}
            {match.status === 'completed' && isTeamWinner(match, 2) && ' (Winner)'}
            {userTeam === 2 && ' (You)'}
          </Text>
        </View>

        {match.location && (
          <Text style={styles.matchLocation}>
            <Icon name="map-pin" size={14} color={colors.gray500} /> {match.location}
          </Text>
        )}

        {match.status === 'completed' && match.games.length > 0 && (
          <Text style={styles.matchScore}>
            {match.games.map(game => `${game.team1Score}-${game.team2Score}`).join(', ')}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Layout
      title="Matches"
      showBackButton={true}
      isInTabNavigator={true}
      rightComponent={
        <TouchableOpacity
          onPress={() => navigation.navigate('AddMatch')}
          style={styles.headerButton}
          accessibilityLabel="Add new match"
          accessibilityRole="button"
        >
          <Icon name="plus-circle" size={24} color={colors.primary} />
        </TouchableOpacity>
      }
    >
      <View style={styles.container}>
        {renderTabs()}
        <View style={styles.sortContainer}>
          <TouchableOpacity
            style={[styles.sortTab, sortOrder === 'newest' && styles.activeSortTab]}
            onPress={() => setSortOrder('newest')}
            accessibilityRole="tab"
            accessibilityLabel="Sort newest first"
            accessibilityState={{ selected: sortOrder === 'newest' }}
          >
            <Text style={[styles.sortTabText, sortOrder === 'newest' && styles.activeSortTabText]}>Newest</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sortTab, sortOrder === 'oldest' && styles.activeSortTab]}
            onPress={() => setSortOrder('oldest')}
            accessibilityRole="tab"
            accessibilityLabel="Sort oldest first"
            accessibilityState={{ selected: sortOrder === 'oldest' }}
          >
            <Text style={[styles.sortTabText, sortOrder === 'oldest' && styles.activeSortTabText]}>Oldest</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {getFilteredMatches().length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="calendar" size={60} color={colors.gray300} />
              <Text style={styles.emptyStateText}>No matches found</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => navigation.navigate('AddMatch')}
                accessibilityLabel="Schedule a Match"
                accessibilityRole="button"
              >
                <Text style={styles.addButtonText}>Schedule a Match</Text>
              </TouchableOpacity>
            </View>
          ) : (
            getFilteredMatches().map(match => renderMatch(match))
          )}
        </ScrollView>
      </View>
    </Layout>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabsContainer: {
    backgroundColor: colors.white,
    ...shadows.sm,
    marginBottom: spacing.sm,
  },
  tabsScrollContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  tab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.gray100,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  tabText: {
    ...typography.label,
    color: colors.gray500,
  },
  activeTabText: {
    ...typography.button,
    color: colors.primary,
  },
  sortContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  sortTab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.gray100,
  },
  activeSortTab: {
    backgroundColor: colors.primaryOverlay,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  sortTabText: {
    ...typography.label,
    color: colors.gray500,
  },
  activeSortTabText: {
    ...typography.button,
    color: colors.primary,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  matchCard: {
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    marginBottom: spacing.lg,
    ...shadows.md,
  },
  winMatchCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  lossMatchCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.loss,
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  matchDate: {
    ...typography.label,
    color: colors.primary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.winOverlay,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  winStatusBadge: {
    backgroundColor: colors.winOverlay,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.xs,
    marginLeft: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  lossStatusBadge: {
    backgroundColor: colors.lossOverlay,
  },
  statusText: {
    ...typography.caption,
    color: colors.primary,
    marginLeft: spacing.xs,
    fontWeight: '600',
  },
  winStatusText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  lossStatusText: {
    ...typography.caption,
    color: colors.loss,
    marginLeft: spacing.xs,
    fontWeight: '600',
  },
  matchType: {
    ...typography.label,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  teamsContainer: {
    marginVertical: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
  },
  teamName: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.neutral,
    textAlign: 'center',
    marginVertical: spacing.xs,
  },
  teamSeparator: {
    ...typography.bodySmall,
    color: colors.gray500,
    textAlign: 'center',
    marginVertical: spacing.sm,
    fontWeight: '500',
  },
  winningTeam: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  userTeam: {
    fontWeight: '700',
  },
  userWonTeam: {
    color: colors.primary,
  },
  userLostTeam: {
    color: colors.loss,
  },
  matchLocation: {
    ...typography.bodySmall,
    color: colors.gray500,
    marginTop: spacing.sm,
  },
  matchScore: {
    ...typography.scoreDisplay,
    color: colors.neutral,
    marginTop: spacing.md,
    textAlign: 'center',
    backgroundColor: colors.primaryOverlay,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  headerButton: {
    padding: spacing.sm,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxxl,
  },
  emptyStateText: {
    ...typography.bodyLarge,
    color: colors.gray500,
    marginTop: spacing.lg,
    marginBottom: spacing.xxl,
  },
  addButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.sm,
  },
  addButtonText: {
    ...typography.button,
    color: colors.white,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.primary,
    marginLeft: spacing.sm,
  },
  gameNumber: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  activeTabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.primary,
  },
  playerNames: {
    ...typography.bodyLarge,
    color: colors.neutral,
    marginBottom: spacing.xs,
  },
  scoreText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '500',
  },
});

export default MatchesScreen;
