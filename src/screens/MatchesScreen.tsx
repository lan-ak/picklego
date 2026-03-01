import React, { useLayoutEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import { format } from 'date-fns';
import Layout from '../components/Layout';
import { FooterButton } from '../components/FooterButton';
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

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Matches',
      headerRight: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('AddMatch')}
          style={styles.headerButton}
        >
          <Ionicons name="add-circle-outline" size={24} color="#0D6B3E" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // Filter matches based on active tab
  const getFilteredMatches = (): typeof matches => {
    switch (activeTab) {
      case 'all':
        return [...matches].sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());
      
      case 'upcoming':
        return matches
          .filter(match => match.status === 'scheduled')
          .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
      
      case 'completed':
        return matches
          .filter(match => match.status === 'completed')
          .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());
      
      case 'won':
        return matches
          .filter(match => {
            if (!currentUser || match.status !== 'completed' || match.winnerTeam === null) return false;

            // First check if user participated in this match
            const participated = isUserInMatch(match, currentUser.id);
            if (!participated) return false;

            // Then check if user is in the winners
            return isUserWinner(match, currentUser.id);
          })
          .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());

      case 'lost':
        return matches
          .filter(match => {
            if (!currentUser || match.status !== 'completed' || match.winnerTeam === null) return false;

            // First check if user participated in this match
            const participated = isUserInMatch(match, currentUser.id);
            if (!participated) return false;

            // Then check if user is NOT in the winners
            return !isUserWinner(match, currentUser.id);
          })
          .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());
      
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
                  <Ionicons name="trophy" size={16} color="#0D6B3E" />
                  <Text style={styles.winStatusText}>Won</Text>
                </>
              )}
              {didUserLose && (
                <>
                  <Ionicons name="close-circle" size={16} color="#FF3B30" />
                  <Text style={styles.lossStatusText}>Lost</Text>
                </>
              )}
              {!isUserMatch && (
                <>
                  <Ionicons name="checkmark-circle" size={16} color="#0D6B3E" />
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
            <Ionicons name="location" size={14} color="#666" /> {match.location}
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
      rightComponent={
        <TouchableOpacity
          onPress={() => navigation.navigate('AddMatch')}
          style={styles.headerButton}
          accessibilityLabel="Add new match"
          accessibilityRole="button"
        >
          <Ionicons name="add-circle-outline" size={24} color="#0D6B3E" />
        </TouchableOpacity>
      }
    >
      <View style={styles.container}>
        {renderTabs()}
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {getFilteredMatches().length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={60} color="#ccc" />
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
  header: {
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2196F3',
    textAlign: 'center',
  },
  tabsContainer: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    marginBottom: 8,
  },
  tabsScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#f2f2f2',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#0D6B3E',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  activeTabText: {
    color: '#0D6B3E',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  matchCard: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  winMatchCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#0D6B3E',
  },
  lossMatchCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF3B30',
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  matchDate: {
    fontSize: 15,
    color: '#0D6B3E',
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  winStatusBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#0D6B3E',
  },
  lossStatusBadge: {
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
  },
  statusText: {
    fontSize: 12,
    color: '#0D6B3E',
    marginLeft: 4,
    fontWeight: '600',
  },
  winStatusText: {
    color: '#0D6B3E',
    fontWeight: '600',
    fontSize: 12,
  },
  lossStatusText: {
    fontSize: 12,
    color: '#FF3B30',
    marginLeft: 4,
    fontWeight: '600',
  },
  matchType: {
    fontSize: 15,
    color: '#0D6B3E',
    marginBottom: 10,
    fontWeight: '500',
  },
  teamsContainer: {
    marginVertical: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
  },
  teamName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginVertical: 4,
  },
  teamSeparator: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginVertical: 8,
    fontWeight: '500',
  },
  winningTeam: {
    color: '#0D6B3E',
    fontWeight: 'bold',
  },
  userTeam: {
    fontWeight: '700',
  },
  userWonTeam: {
    color: '#0D6B3E',
  },
  userLostTeam: {
    color: '#FF3B30',
  },
  matchLocation: {
    fontSize: 14,
    color: '#666',
    marginTop: 10,
  },
  matchScore: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginTop: 12,
    textAlign: 'center',
    backgroundColor: '#f0f7f4',
    paddingVertical: 8,
    borderRadius: 8,
  },
  headerButton: {
    padding: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
    marginBottom: 24,
  },
  addButton: {
    backgroundColor: '#0D6B3E',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0D6B3E',
    marginLeft: 8,
  },
  gameNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0D6B3E',
    marginBottom: 8,
  },
  activeTabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#0D6B3E',
  },
  playerNames: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  scoreText: {
    fontSize: 14,
    color: '#0D6B3E',
    fontWeight: '500',
  },
});

export default MatchesScreen; 