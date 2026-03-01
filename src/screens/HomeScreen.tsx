import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, MainTabParamList, Match, Game } from '../types';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import { format } from 'date-fns';
import { Animated } from 'react-native';
import Layout from '../components/Layout';

type HomeScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const OnboardingView = ({ onComplete }: { onComplete: () => void }) => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  
  return (
    <View style={styles.onboardingContainer}>
      <View style={styles.onboardingContent}>
        <Ionicons name="tennisball-outline" size={80} color="#0D6B3E" />
        <Text style={styles.onboardingTitle}>Welcome to PickleGo!</Text>
        <Text style={styles.onboardingText}>
          Track your pickleball matches, players, and stats in one place.
        </Text>
        <Text style={styles.onboardingSubtext}>
          Create an account to get started.
        </Text>
        
        <TouchableOpacity 
          style={styles.onboardingButton}
          onPress={() => navigation.navigate('Auth')}
        >
          <Text style={styles.onboardingButtonText}>Create Account</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const HomeScreen = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { matches, players, currentUser, getPlayerName } = useData();
  const [showOnboarding, setShowOnboarding] = useState(players.length === 0);

  // Local animation values for fade-in effects
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  // Check if the app is a new install
  const isFirstInstall = () => {
    return players.length === 0;
  };

  // Format player names for display with "you" labeling
  const formatPlayerNames = (match: Match) => {
    if (!currentUser) return { team1: '', team2: '' };

    const getTeamNames = (team: string[]) => {
      return team
        .map((playerId) => {
          if (playerId === currentUser.id) return 'You';
          const fullName = getPlayerName(playerId);
          return formatPlayerNameWithInitial(fullName);
        })
        .join(' & ');
    };

    const team1 = getTeamNames(match.team1PlayerIds || []);
    const team2 = getTeamNames(match.team2PlayerIds || []);

    return { team1, team2 };
  };

  // Helper function for formatting names with first name and last initial
  const formatPlayerNameWithInitial = (fullName: string) => {
    const parts = fullName.trim().split(' ');
    if (parts.length < 2) return fullName; // Return as is if no space found
    
    const firstName = parts[0];
    const lastInitial = parts[parts.length - 1][0]; // First character of last name
    
    return `${firstName} ${lastInitial}.`;
  };

  // Navigate to match details
  const goToMatchDetails = (matchId: string) => {
    navigation.navigate('MatchDetails', { matchId });
  };

  // Navigate to user stats
  const viewAllStats = () => {
    navigation.navigate('Players');
  };

  // Calculate user statistics
  const userStats = useMemo(() => {
    if (!currentUser || !matches) {
      return { totalMatches: 0, wins: 0, losses: 0, winRate: 0 };
    }

    let totalMatches = 0;
    let wins = 0;
    let losses = 0;

    // Process each completed match
    matches
      .filter(match => match.status === 'completed')
      .forEach(match => {
        // Skip if current user is not in this match
        if (!match.allPlayerIds.includes(currentUser.id)) return;

        // Determine which team the user is on
        const userTeam = match.team1PlayerIds.includes(currentUser.id) ? 1 : 2;

        // Check if user's team won
        const isWinner = match.winnerTeam === userTeam;

        // Update stats
        totalMatches++;
        if (isWinner) {
          wins++;
        } else {
          losses++;
        }
      });

    const winRate = totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

    return { totalMatches, wins, losses, winRate };
  }, [currentUser, matches]);

  // Get recent matches for the user
  const recentMatches = useMemo(() => {
    if (!currentUser || !matches) return [];
    
    return matches
      .filter(
        (match) =>
          match.allPlayerIds.includes(currentUser.id) &&
          match.status === 'completed'
      )
      .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime())
      .slice(0, 3); // Show only the last 3 matches
  }, [currentUser, matches]);

  // Get upcoming matches
  const nextMatch = useMemo(() => {
    if (!currentUser || !matches) return null;
    
    const upcoming = matches
      .filter(
        (match) =>
          match.allPlayerIds.includes(currentUser.id) &&
          match.status === 'scheduled'
      )
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
    
    return upcoming.length > 0 ? upcoming[0] : null;
  }, [currentUser, matches]);

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  // If it's a new install, show the onboarding screen
  if (showOnboarding && isFirstInstall()) {
    return <OnboardingView onComplete={() => setShowOnboarding(false)} />;
  }

  // Get profile photo for the user
  const profilePhoto = currentUser?.profilePic || 'https://via.placeholder.com/150';

  const navigateToProfile = () => {
    if (currentUser) {
      navigation.navigate('PlayerStats', { playerId: currentUser.id });
    } else {
      navigation.navigate('Auth');
    }
  };

  return (
    <Layout 
      title="PickleGo" 
      showBackButton={false}
      isHomeScreen={true}
      rightComponent={
        <TouchableOpacity
          onPress={navigateToProfile}
          style={styles.profileButton}
          accessibilityLabel="View profile"
          accessibilityRole="button"
        >
          {currentUser?.profilePic ? (
            <Image
              source={{ uri: currentUser.profilePic }}
              style={styles.headerProfilePic}
            />
          ) : (
            <Ionicons name="person-circle" size={32} color="#0D6B3E" />
          )}
        </TouchableOpacity>
      }
    >
      <ScrollView style={styles.scrollView}>
        <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
          {/* Next Match Section */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Ionicons name="calendar-outline" size={24} color="#0D6B3E" />
              <Text style={styles.sectionTitle}>Next Match</Text>
            </View>
            
            {nextMatch ? (
              <TouchableOpacity
                style={styles.nextMatchCard}
                onPress={() => goToMatchDetails(nextMatch.id)}
                accessibilityRole="button"
                accessibilityLabel={`Next match: ${formatPlayerNames(nextMatch).team1} vs ${formatPlayerNames(nextMatch).team2}, ${formatDate(nextMatch.scheduledDate)}`}
                accessibilityHint="View match details"
              >
                <View style={styles.matchHeader}>
                  <Text style={styles.matchDate}>{formatDate(nextMatch.scheduledDate)}</Text>
                  <View style={styles.scheduledBadge}>
                    <Text style={styles.scheduledText}>Scheduled</Text>
                  </View>
                </View>
                <View style={styles.matchDetails}>
                  <Text style={styles.playerNames}>
                    {formatPlayerNames(nextMatch).team1}
                  </Text>
                  <Text style={styles.vsText}>vs</Text>
                  <Text style={styles.playerNames}>
                    {formatPlayerNames(nextMatch).team2}
                  </Text>
                </View>
                <View style={styles.matchFooter}>
                  <Ionicons name="location-outline" size={16} color="#666" />
                  <Text style={styles.locationText}>
                    {nextMatch.location || 'No location set'}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.emptyStateCard}>
                <Text style={styles.emptyStateText}>No upcoming matches scheduled</Text>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: '#0D6B3E' }]}
                  onPress={() => navigation.navigate('AddMatch')}
                  accessibilityLabel="Schedule a Match"
                  accessibilityRole="button"
                >
                  <Text style={styles.actionButtonText}>Schedule a Match</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Quick Stats Section */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Ionicons name="stats-chart-outline" size={24} color="#0D6B3E" />
              <Text style={styles.sectionTitle}>Quick Stats</Text>
              <TouchableOpacity
                style={styles.viewAllButton}
                onPress={viewAllStats}
                accessibilityLabel="View all stats"
                accessibilityRole="button"
              >
                <Text style={styles.viewAllText}>View All</Text>
                <Ionicons name="chevron-forward" size={14} color="#0D6B3E" />
              </TouchableOpacity>
            </View>

            <View style={styles.statsContainerCard}>
              <View style={styles.statItem} accessibilityLabel={`${userStats.totalMatches} Matches`}>
                <Text style={[styles.statValue, { color: '#0D6B3E' }]}>{userStats.totalMatches}</Text>
                <Text style={styles.statLabel}>Matches</Text>
              </View>
              <View style={styles.statItem} accessibilityLabel={`${userStats.wins} Wins`}>
                <Text style={[styles.statValue, { color: '#0D6B3E' }]}>{userStats.wins}</Text>
                <Text style={styles.statLabel}>Wins</Text>
              </View>
              <View style={styles.statItem} accessibilityLabel={`${userStats.losses} Losses`}>
                <Text style={[styles.statValue, { color: '#0D6B3E' }]}>{userStats.losses}</Text>
                <Text style={styles.statLabel}>Losses</Text>
              </View>
              <View style={styles.statItem} accessibilityLabel={`${userStats.winRate}% Win Rate`}>
                <Text style={[styles.statValue, { color: '#0D6B3E' }]}>{userStats.winRate}%</Text>
                <Text style={styles.statLabel}>Win Rate</Text>
              </View>
            </View>
          </View>

          {/* Recent Matches Section */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Ionicons name="time-outline" size={24} color="#0D6B3E" />
              <Text style={styles.sectionTitle}>Recent Matches</Text>
              <TouchableOpacity
                style={styles.viewAllButton}
                onPress={() => navigation.navigate('Matches')}
                accessibilityLabel="View all matches"
                accessibilityRole="button"
              >
                <Text style={styles.viewAllText}>View All</Text>
                <Ionicons name="chevron-forward" size={14} color="#0D6B3E" />
              </TouchableOpacity>
            </View>
            
            {recentMatches.length > 0 ? (
              <View style={styles.matchesContainer}>
                {recentMatches.map((match) => {
                  const { team1, team2 } = formatPlayerNames(match);
                  
                  // Determine which team the user is on and check if they won
                  const userTeam = match.team1PlayerIds.includes(currentUser?.id || '') ? 1 : 2;
                  const isWinner = match.winnerTeam === userTeam;

                  return (
                    <TouchableOpacity
                      key={match.id}
                      style={[
                        styles.matchCard,
                        isWinner ? styles.winMatchCard : styles.lossMatchCard,
                      ]}
                      onPress={() => goToMatchDetails(match.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`${team1} vs ${team2}, ${formatDate(match.scheduledDate)}, ${isWinner ? 'Won' : 'Lost'}`}
                      accessibilityHint="View match details"
                    >
                      <View style={styles.matchHeader}>
                        <Text style={styles.matchDate}>{formatDate(match.scheduledDate)}</Text>
                        <View
                          style={[
                            styles.statusBadge,
                            isWinner ? styles.winStatusBadge : styles.lossStatusBadge,
                          ]}
                        >
                          <Text style={styles.statusText}>
                            {isWinner ? 'Won' : 'Lost'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.matchDetails}>
                        <Text style={[styles.playerNames, isWinner ? styles.winText : styles.lossText]}>
                          {team1} vs {team2}
                        </Text>
                        <Text style={styles.scoreText}>
                          {match.games.length > 0
                            ? match.games.map((game: Game) => `${game.team1Score}-${game.team2Score}`).join(', ')
                            : 'No score'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyStateCard}>
                <Text style={styles.emptyStateText}>No recent matches</Text>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => navigation.navigate('AddMatch')}
                  accessibilityLabel="New Match"
                  accessibilityRole="button"
                >
                  <Text style={styles.actionButtonText}>New Match</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </Animated.View>
      </ScrollView>
    </Layout>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 20,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  logoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  logoImage: {
    width: 40,
    height: 40,
    marginRight: 8,
  },
  logoText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0D6B3E', // Green color from the logo
  },
  profilePhotoContainer: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
  },
  profilePhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#0D6B3E', // Updated to match logo color
  },
  headerContainer: {
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0D6B3E',
  },
  // Onboarding styles
  onboardingContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  onboardingContent: {
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 16,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  onboardingTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#0D6B3E',
    marginTop: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  onboardingText: {
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 26,
  },
  onboardingSubtext: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  onboardingButton: {
    backgroundColor: '#0D6B3E',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  onboardingButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginRight: 8,
  },
  // Section styles
  sectionContainer: {
    flex: 1,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0D6B3E',
    marginLeft: 8,
  },
  statsContainerCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    flex: 1,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4A80F0',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  viewAllButton: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0D6B3E', // Updated to match logo color
    marginRight: 4,
  },
  emptyStateCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 150,
  },
  emptyStateText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  actionButton: {
    backgroundColor: '#0D6B3E',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  matchesContainer: {
    flex: 1,
  },
  matchCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderLeftWidth: 4,
  },
  winMatchCard: {
    borderLeftColor: '#4CD964',
  },
  lossMatchCard: {
    borderLeftColor: '#FF3B30',
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  matchDate: {
    fontSize: 16,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  winStatusBadge: {
    backgroundColor: 'rgba(76, 217, 100, 0.2)',
  },
  lossStatusBadge: {
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  winText: {
    color: '#4CD964',
  },
  lossText: {
    color: '#FF3B30',
  },
  matchDetails: {
    marginBottom: 5,
  },
  playerNames: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  scoreText: {
    fontSize: 16,
    color: '#666',
  },
  locationText: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  nextMatchCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#4A80F0',
  },
  scheduledBadge: {
    backgroundColor: 'rgba(74, 128, 240, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  scheduledText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4A80F0',
  },
  vsText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
    marginHorizontal: 8,
  },
  matchFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  profileButton: {
    padding: 4,
  },
  headerProfilePic: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#0D6B3E',
  },
});

export default HomeScreen; 