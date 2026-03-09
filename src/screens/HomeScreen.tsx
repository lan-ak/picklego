import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, RefreshControl } from 'react-native';
import Animated from 'react-native-reanimated';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, MainTabParamList, Match } from '../types';
import { Icon } from '../components/Icon';
import { NotificationBell } from '../components/NotificationBell';
import { useData } from '../context/DataContext';
import Layout from '../components/Layout';
import MatchCard from '../components/MatchCard';
import { useFadeIn, useHaptic, staggeredEntrance } from '../hooks';
import { usePlacement } from 'expo-superwall';
import { PLACEMENTS } from '../services/superwallPlacements';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';

type HomeScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Home'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const HomeScreen = () => {
  const navigation = useNavigation<HomeScreenNavigationProp>();
  const { matches, players, currentUser, getPlayerName, refreshMatches } = useData();
  const [refreshing, setRefreshing] = useState(false);
  const triggerHaptic = useHaptic();

  // Reanimated fade-in
  const fadeStyle = useFadeIn();

  // Superwall: fire session start placement (non-blocking lifecycle event)
  const { registerPlacement } = usePlacement();
  const sessionFiredRef = useRef(false);
  useEffect(() => {
    if (!sessionFiredRef.current) {
      sessionFiredRef.current = true;
      registerPlacement({ placement: PLACEMENTS.SESSION_START });
    }
  }, []);

  const onRefresh = useCallback(async () => {
    triggerHaptic('light');
    setRefreshing(true);
    await refreshMatches();
    setRefreshing(false);
  }, []);

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

  // Get profile photo for the user
  const profilePhoto = currentUser?.profilePic || 'https://via.placeholder.com/150';

  const navigateToSettings = () => {
    navigation.navigate('Settings');
  };

  return (
    <Layout
      title="PickleGo"
      showBackButton={false}
      isHomeScreen={true}
      isInTabNavigator={true}
      leftComponent={<NotificationBell />}
      rightComponent={
        <AnimatedPressable
          onPress={navigateToSettings}
          style={styles.profileButton}
          accessibilityLabel="View settings"
          accessibilityRole="button"
        >
          {currentUser?.profilePic ? (
            <Image
              source={{ uri: currentUser.profilePic }}
              style={styles.headerProfilePic}
            />
          ) : (
            <Icon name="circle-user" size={32} color={colors.primary} />
          )}
        </AnimatedPressable>
      }
    >
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <Animated.View style={[styles.container, fadeStyle]}>
          {/* Next Match Section */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Icon name="calendar" size={24} color={colors.primary} />
              <Text style={styles.sectionTitle}>Next Match</Text>
            </View>

            {nextMatch ? (
              <>
                <MatchCard
                  match={nextMatch}
                  currentUserId={currentUser?.id || ''}
                  getPlayerName={getPlayerName}
                  onPress={() => goToMatchDetails(nextMatch.id)}
                  formatPlayerNameWithInitial={formatPlayerNameWithInitial}
                />
              </>
            ) : (
              <View style={styles.emptyStateCard}>
                <Text style={styles.emptyStateText}>No upcoming matches scheduled</Text>
                <AnimatedPressable
                  style={styles.actionButton}
                  onPress={() => navigation.navigate('AddMatch')}
                  accessibilityLabel="Schedule a Match"
                  accessibilityRole="button"
                >
                  <Text style={styles.actionButtonText}>Schedule a Match</Text>
                </AnimatedPressable>
              </View>
            )}
          </View>

          {/* Quick Stats Section */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Icon name="bar-chart-2" size={24} color={colors.primary} />
              <Text style={styles.sectionTitle}>Quick Stats</Text>
              <AnimatedPressable
                style={styles.viewAllButton}
                onPress={viewAllStats}
                accessibilityLabel="View all stats"
                accessibilityRole="button"
              >
                <Text style={styles.viewAllText}>View All</Text>
                <Icon name="chevron-right" size={14} color={colors.primary} />
              </AnimatedPressable>
            </View>

            <View style={styles.statsContainerCard}>
              <View style={styles.statItem} accessibilityLabel={`${userStats.totalMatches} Matches`}>
                <Text style={[styles.statValue, { color: colors.primary }]}>{userStats.totalMatches}</Text>
                <Text style={styles.statLabel}>Matches</Text>
              </View>
              <View style={styles.statItem} accessibilityLabel={`${userStats.wins} Wins`}>
                <Text style={[styles.statValue, { color: colors.primary }]}>{userStats.wins}</Text>
                <Text style={styles.statLabel}>Wins</Text>
              </View>
              <View style={styles.statItem} accessibilityLabel={`${userStats.losses} Losses`}>
                <Text style={[styles.statValue, { color: colors.primary }]}>{userStats.losses}</Text>
                <Text style={styles.statLabel}>Losses</Text>
              </View>
              <View style={styles.statItem} accessibilityLabel={`${userStats.winRate}% Win Rate`}>
                <Text style={[styles.statValue, { color: colors.primary }]}>{userStats.winRate}%</Text>
                <Text style={styles.statLabel}>Win Rate</Text>
              </View>
            </View>
          </View>

          {/* Recent Matches Section */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Icon name="clock" size={24} color={colors.primary} />
              <Text style={styles.sectionTitle}>Recent Matches</Text>
              <AnimatedPressable
                style={styles.viewAllButton}
                onPress={() => navigation.navigate('Matches')}
                accessibilityLabel="View all matches"
                accessibilityRole="button"
              >
                <Text style={styles.viewAllText}>View All</Text>
                <Icon name="chevron-right" size={14} color={colors.primary} />
              </AnimatedPressable>
            </View>

            {recentMatches.length > 0 ? (
              <View style={styles.matchesContainer}>
                {recentMatches.map((match, index) => (
                  <Animated.View key={match.id} entering={staggeredEntrance(index)}>
                    <MatchCard
                      match={match}
                      currentUserId={currentUser?.id || ''}
                      getPlayerName={getPlayerName}
                      onPress={() => goToMatchDetails(match.id)}
                      formatPlayerNameWithInitial={formatPlayerNameWithInitial}
                    />
                  </Animated.View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyStateCard}>
                <Text style={styles.emptyStateText}>No recent matches</Text>
                <AnimatedPressable
                  style={styles.actionButton}
                  onPress={() => navigation.navigate('AddMatch')}
                  accessibilityLabel="New Match"
                  accessibilityRole="button"
                >
                  <Text style={styles.actionButtonText}>New Match</Text>
                </AnimatedPressable>
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
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    justifyContent: 'space-between',
  },
  logoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  logoImage: {
    width: 40,
    height: 40,
    marginRight: spacing.sm,
  },
  logoText: {
    ...typography.h2,
    color: colors.primary,
  },
  profilePhotoContainer: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
  },
  profilePhoto: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  headerContainer: {
    backgroundColor: colors.white,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: borderRadius.md,
    ...shadows.md,
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.h2,
    color: colors.primary,
  },
  // Section styles
  sectionContainer: {
    flex: 1,
    marginBottom: spacing.xl,
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
    flex: 1,
  },
  statsContainerCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.xxl,
    ...shadows.md,
    flex: 1,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    ...typography.stats,
    color: colors.primary,
  },
  statLabel: {
    ...typography.bodySmall,
    color: colors.gray500,
    marginTop: spacing.xs,
  },
  viewAllButton: {
    backgroundColor: colors.primaryOverlay,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewAllText: {
    ...typography.bodySmall,
    color: colors.primary,
    marginRight: spacing.xs,
  },
  emptyStateCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
    minHeight: 150,
  },
  emptyStateText: {
    ...typography.bodyLarge,
    fontSize: 18,
    color: colors.gray500,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  actionButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
  },
  actionButtonText: {
    ...typography.button,
    color: colors.white,
  },
  matchesContainer: {
    flex: 1,
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  matchDate: {
    ...typography.bodyLarge,
    color: colors.gray500,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  winStatusBadge: {
    backgroundColor: colors.winOverlay,
  },
  lossStatusBadge: {
    backgroundColor: colors.lossOverlay,
  },
  statusText: {
    ...typography.caption,
    fontWeight: 'bold',
  },
  winText: {
    color: colors.win,
  },
  lossText: {
    color: colors.loss,
  },
  matchDetails: {
    marginBottom: spacing.xs,
  },
  playerNames: {
    ...typography.bodyLarge,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  scoreText: {
    ...typography.scoreDisplay,
    color: colors.gray500,
  },
  locationText: {
    ...typography.bodySmall,
    color: colors.gray500,
    marginTop: spacing.xs,
  },
  nextMatchCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    ...shadows.sm,
    borderLeftWidth: 4,
    borderLeftColor: colors.secondary,
  },
  scheduledBadge: {
    backgroundColor: colors.secondaryOverlay,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  scheduledText: {
    ...typography.caption,
    fontWeight: 'bold',
    color: colors.secondary,
  },
  vsText: {
    ...typography.bodyLarge,
    fontWeight: 'bold',
    color: colors.gray500,
    marginHorizontal: spacing.sm,
  },
  matchFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  profileButton: {
    padding: spacing.xs,
  },
  headerProfilePic: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
  },
});

export default HomeScreen;
