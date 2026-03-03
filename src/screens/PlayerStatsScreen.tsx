import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Icon } from '../components/Icon';
import { useData } from '../context/DataContext';
import Layout from '../components/Layout';
import { Match, Game } from '../types';
import { colors, typography, spacing, borderRadius, shadows } from '../theme';
import PicklePete from '../components/PicklePete';

type PlayerStats = {
  totalMatches: number;
  wins: number;
  losses: number;
  winPercentage: number;
  // Game statistics
  totalGames?: number;
  gameWins?: number;
  gameLosses?: number;
  gameWinPercentage?: number;
};

type ExtendedPlayerStats = {
  overall: PlayerStats;
  singles: PlayerStats;
  doubles: PlayerStats;
};

type StatsMode = 'overall' | 'singles' | 'doubles';

// New types for opponent analysis and score spread
type OpponentStats = {
  playerId: string;
  playerName: string;
  totalMatches: number;
  wins: number;
  losses: number;
  winPercentage: number;
};

// New type for partner stats
type PartnerStats = {
  partnerId: string;
  partnerName: string;
  totalMatches: number;
  wins: number;
  losses: number;
  winPercentage: number;
};

type TimeFilter = 'all' | 'recent';

const MyStatsScreen = () => {
  const { players, matches, currentUser } = useData();
  const [statsMode, setStatsMode] = useState<StatsMode>('overall');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [extendedStats, setExtendedStats] = useState<Record<string, ExtendedPlayerStats>>({});
  const [opponentStats, setOpponentStats] = useState<OpponentStats[]>([]);
  const [partnerStats, setPartnerStats] = useState<PartnerStats[]>([]);
  const [winStreak, setWinStreak] = useState<Record<StatsMode, number>>({
    overall: 0,
    singles: 0,
    doubles: 0
  });
  const [lossStreak, setLossStreak] = useState<Record<StatsMode, number>>({
    overall: 0,
    singles: 0,
    doubles: 0
  });
  const [matchesSinceLastWin, setMatchesSinceLastWin] = useState<Record<StatsMode, number>>({
    overall: 0,
    singles: 0,
    doubles: 0
  });

  // Helper function to determine which team a user is on in a match
  const getUserTeamNumber = (match: Match, userId: string): number | null => {
    if (match.team1PlayerIds.includes(userId)) return 1;
    if (match.team2PlayerIds.includes(userId)) return 2;
    return null;
  };

  // Helper function to determine if a user won a match
  const isUserWinner = (match: Match, userId: string): boolean => {
    if (!match.winnerTeam) return false;
    const userTeam = getUserTeamNumber(match, userId);
    return userTeam === match.winnerTeam;
  };

  // Calculate extended stats (overall, singles, doubles) for each player
  useEffect(() => {
    if (!currentUser) return;

    const newExtendedStats: Record<string, ExtendedPlayerStats> = {};

    // Initialize stats for current user
    newExtendedStats[currentUser.id] = {
      overall: {
        totalMatches: 0,
        wins: 0,
        losses: 0,
        winPercentage: 0,
        totalGames: 0,
        gameWins: 0,
        gameLosses: 0,
        gameWinPercentage: 0,
      },
      singles: {
        totalMatches: 0,
        wins: 0,
        losses: 0,
        winPercentage: 0,
        totalGames: 0,
        gameWins: 0,
        gameLosses: 0,
        gameWinPercentage: 0,
      },
      doubles: {
        totalMatches: 0,
        wins: 0,
        losses: 0,
        winPercentage: 0,
        totalGames: 0,
        gameWins: 0,
        gameLosses: 0,
        gameWinPercentage: 0,
      },
    };

    // Process each completed match
    const completedMatches = matches
      .filter(match => match.status === 'completed')
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()); // Sort by date, oldest first

    completedMatches.forEach(match => {
      // Skip if current user is not in this match
      if (!match.allPlayerIds.includes(currentUser.id)) return;

      // Determine the match type (singles or doubles)
      const matchType = match.matchType;

      // Determine if player won the match
      const isWinner = isUserWinner(match, currentUser.id);

      // Update overall stats
      newExtendedStats[currentUser.id].overall.totalMatches++;
      if (isWinner) {
        newExtendedStats[currentUser.id].overall.wins++;
      } else {
        newExtendedStats[currentUser.id].overall.losses++;
      }

      // Update match type specific stats (singles or doubles)
      newExtendedStats[currentUser.id][matchType].totalMatches++;
      if (isWinner) {
        newExtendedStats[currentUser.id][matchType].wins++;
      } else {
        newExtendedStats[currentUser.id][matchType].losses++;
      }

      // Process game-level statistics if available
      if (match.games && match.games.length > 0) {
        // Get the user's team number
        const userTeamNumber = getUserTeamNumber(match, currentUser.id);
        if (!userTeamNumber) return;

        // Process each game in the match
        match.games.forEach((game) => {
          // Update overall game stats
          newExtendedStats[currentUser.id].overall.totalGames!++;

          // Update match type specific game stats
          newExtendedStats[currentUser.id][matchType].totalGames!++;

          // Determine user's score and opponent's score
          const userScore = userTeamNumber === 1 ? game.team1Score : game.team2Score;
          const opponentScore = userTeamNumber === 1 ? game.team2Score : game.team1Score;
          const userWonGame = userScore > opponentScore;

          // Update win/loss counts
          if (userWonGame) {
            newExtendedStats[currentUser.id].overall.gameWins!++;
            newExtendedStats[currentUser.id][matchType].gameWins!++;
          } else {
            newExtendedStats[currentUser.id].overall.gameLosses!++;
            newExtendedStats[currentUser.id][matchType].gameLosses!++;
          }
        });
      }
    });

    // Calculate win percentages
    Object.keys(newExtendedStats).forEach(playerId => {
      ['overall', 'singles', 'doubles'].forEach(type => {
        const stats = newExtendedStats[playerId][type as keyof ExtendedPlayerStats];
        const total = stats.wins + stats.losses;
        stats.winPercentage = total > 0 ? (stats.wins / total) * 100 : 0;

        // Calculate game win percentage
        const totalGames = stats.gameWins! + stats.gameLosses!;
        stats.gameWinPercentage = totalGames > 0 ? (stats.gameWins! / totalGames) * 100 : 0;
      });
    });

    setExtendedStats(newExtendedStats);
  }, [currentUser, matches]);

  // Calculate opponent analytics
  useEffect(() => {
    if (!currentUser || !matches.length) return;

    const recentCutoff = new Date();
    recentCutoff.setDate(recentCutoff.getDate() - 30); // 30 days ago

    // Get relevant matches based on time filter
    const filteredMatches = matches.filter(match => {
      // Only completed matches with the current user
      if (match.status !== 'completed') return false;

      if (!match.allPlayerIds.includes(currentUser.id)) return false;

      // Filter by match type if needed
      if (statsMode !== 'overall' && match.matchType !== statsMode) {
        return false;
      }

      // Filter by time if needed
      if (timeFilter === 'recent') {
        const matchDate = new Date(match.scheduledDate);
        return matchDate >= recentCutoff;
      }

      return true;
    });

    // Calculate opponent stats
    const opponentMap: Record<string, OpponentStats> = {};

    filteredMatches.forEach(match => {
      // Skip matches without games data
      if (!match.games || match.games.length === 0) {
        return;
      }

      // Get the user's team number
      const userTeamNumber = getUserTeamNumber(match, currentUser.id);
      if (!userTeamNumber) return;

      // Get opponent IDs
      const opponents = userTeamNumber === 1 ? match.team2PlayerIds : match.team1PlayerIds;

      // For each opponent, update their stats
      opponents.forEach(opponentId => {
        if (!opponentId || opponentId === currentUser.id) return;

        const opponent = players.find(p => p.id === opponentId);
        if (!opponent) return;

        if (!opponentMap[opponentId]) {
          opponentMap[opponentId] = {
            playerId: opponentId,
            playerName: opponent.name,
            totalMatches: 0,
            wins: 0,
            losses: 0,
            winPercentage: 0
          };
        }

        // Update opponent stats
        opponentMap[opponentId].totalMatches++;

        // Determine if the user won against this opponent
        const userWon = isUserWinner(match, currentUser.id);

        if (userWon) {
          opponentMap[opponentId].wins++;
        } else {
          opponentMap[opponentId].losses++;
        }
      });
    });

    // Calculate win percentage for opponents
    Object.values(opponentMap).forEach(stat => {
      stat.winPercentage = stat.totalMatches > 0 ?
        (stat.wins / stat.totalMatches) * 100 : 0;
    });

    // Sort opponents by number of matches played together
    const sortedOpponents = Object.values(opponentMap)
      .sort((a, b) => b.totalMatches - a.totalMatches);

    setOpponentStats(sortedOpponents);
  }, [currentUser, matches, players, statsMode, timeFilter]);

  // Calculate win streak and matches since last win
  useEffect(() => {
    if (!currentUser || !matches.length) return;

    // Get completed matches involving the current user
    const userMatches = matches
      .filter(match => {
        return match.status === 'completed' && match.allPlayerIds.includes(currentUser.id);
      })
      .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime()); // Sort newest first

    // Calculate streaks for each mode
    const newWinStreak = { overall: 0, singles: 0, doubles: 0 };
    const newLossStreak = { overall: 0, singles: 0, doubles: 0 };
    const newMatchesSinceLastWin = { overall: 0, singles: 0, doubles: 0 };

    // Helper to compute current streak (win or loss) from a list of matches
    const computeStreaks = (matchList: typeof userMatches, mode: 'overall' | 'singles' | 'doubles') => {
      for (const match of matchList) {
        const isWin = isUserWinner(match, currentUser.id);
        if (isWin) {
          if (newLossStreak[mode] === 0) {
            newWinStreak[mode]++;
          } else {
            break;
          }
        } else {
          if (newWinStreak[mode] === 0) {
            newLossStreak[mode]++;
          } else {
            break;
          }
          newMatchesSinceLastWin[mode]++;
        }
      }
    };

    computeStreaks(userMatches, 'overall');
    computeStreaks(userMatches.filter(m => m.matchType === 'singles'), 'singles');
    computeStreaks(userMatches.filter(m => m.matchType === 'doubles'), 'doubles');

    setWinStreak(newWinStreak);
    setLossStreak(newLossStreak);
    setMatchesSinceLastWin(newMatchesSinceLastWin);
  }, [currentUser, matches]);

  // Calculate partner stats
  useEffect(() => {
    if (!currentUser || !matches.length) return;

    // Get relevant doubles matches based on time filter
    const recentCutoff = new Date();
    recentCutoff.setDate(recentCutoff.getDate() - 30); // 30 days ago

    const filteredMatches = matches.filter(match => {
      // Only include completed doubles matches with the current user
      if (match.status !== 'completed' || match.matchType !== 'doubles') return false;

      if (!match.allPlayerIds.includes(currentUser.id)) return false;

      // Filter by time if needed
      if (timeFilter === 'recent') {
        const matchDate = new Date(match.scheduledDate);
        return matchDate >= recentCutoff;
      }

      return true;
    });

    // Track partner stats
    const partnerMap: Record<string, PartnerStats> = {};

    filteredMatches.forEach(match => {
      // Get the user's team number
      const userTeamNumber = getUserTeamNumber(match, currentUser.id);
      if (!userTeamNumber) return;

      // Get the team members
      const team = userTeamNumber === 1 ? match.team1PlayerIds : match.team2PlayerIds;

      // Find partners (skip if user is not in a team of 2)
      if (team.length !== 2) return;

      // Get partner ID (the other player in the team)
      const partnerId = team.find(id => id !== currentUser.id);
      if (!partnerId) return;

      // Find partner in players list
      const partner = players.find(p => p.id === partnerId);
      if (!partner) return;

      // Initialize partner stats if needed
      if (!partnerMap[partnerId]) {
        partnerMap[partnerId] = {
          partnerId,
          partnerName: partner.name,
          totalMatches: 0,
          wins: 0,
          losses: 0,
          winPercentage: 0
        };
      }

      // Update partner stats
      partnerMap[partnerId].totalMatches++;

      // Check if user's team won
      const didUserWin = isUserWinner(match, currentUser.id);
      if (didUserWin) {
        partnerMap[partnerId].wins++;
      } else {
        partnerMap[partnerId].losses++;
      }
    });

    // Calculate win percentages
    Object.values(partnerMap).forEach(stat => {
      stat.winPercentage = stat.totalMatches > 0
        ? (stat.wins / stat.totalMatches) * 100
        : 0;
    });

    // Sort partners by most matches played together
    const sortedPartners = Object.values(partnerMap)
      .sort((a, b) => b.totalMatches - a.totalMatches);

    setPartnerStats(sortedPartners);
  }, [currentUser, matches, players, timeFilter]);

  const renderStatsTabs = () => (
    <View style={styles.tabContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsScrollContent}
      >
        <TouchableOpacity
          style={[styles.tab, statsMode === 'overall' && styles.activeTab]}
          onPress={() => setStatsMode('overall')}
          accessibilityRole="tab"
          accessibilityState={{ selected: statsMode === 'overall' }}
        >
          <Text style={[styles.tabText, statsMode === 'overall' && styles.activeTabText]}>
            Overall
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, statsMode === 'singles' && styles.activeTab]}
          onPress={() => setStatsMode('singles')}
          accessibilityRole="tab"
          accessibilityState={{ selected: statsMode === 'singles' }}
        >
          <Text style={[styles.tabText, statsMode === 'singles' && styles.activeTabText]}>
            Singles
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, statsMode === 'doubles' && styles.activeTab]}
          onPress={() => setStatsMode('doubles')}
          accessibilityRole="tab"
          accessibilityState={{ selected: statsMode === 'doubles' }}
        >
          <Text style={[styles.tabText, statsMode === 'doubles' && styles.activeTabText]}>
            Doubles
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  // Render the stats card for the current user
  const renderStatsCard = () => {
    if (!currentUser || !extendedStats[currentUser.id]) {
      return (
        <View style={styles.emptyStateContainer}>
          <PicklePete pose="error" size="sm" message="No stats yet — go play!" />
        </View>
      );
    }

    const stats = extendedStats[currentUser.id][statsMode];

    return (
      <View style={styles.statsCard}>
        {/* Match Statistics */}
        <View style={styles.sectionHeader}>
          <Icon name="trophy" size={22} color={colors.primary} />
          <Text style={styles.sectionTitle}>Match Statistics</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.totalMatches}</Text>
            <Text style={styles.statLabel}>Matches</Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.wins}</Text>
            <Text style={styles.statLabel}>Wins</Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.losses}</Text>
            <Text style={styles.statLabel}>Losses</Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.winPercentage.toFixed(1)}%</Text>
            <Text style={styles.statLabel}>Win Rate</Text>
          </View>
        </View>

        {/* Game-level statistics */}
        <View style={styles.sectionDivider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Game Statistics</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.totalGames || 0}</Text>
            <Text style={styles.statLabel}>Games</Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.gameWins || 0}</Text>
            <Text style={styles.statLabel}>Wins</Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.gameLosses || 0}</Text>
            <Text style={styles.statLabel}>Losses</Text>
          </View>

          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.gameWinPercentage ? stats.gameWinPercentage.toFixed(1) : '0.0'}%</Text>
            <Text style={styles.statLabel}>Win Rate</Text>
          </View>
        </View>
      </View>
    );
  };

  // Function to get the filtered matches based on statsMode
  const getFilteredMatches = () => {
    if (!currentUser) return [];

    return matches
      .filter(match => {
        // Filter for completed matches
        if (match.status !== 'completed') return false;

        // Check if current user participated in this match
        if (!match.allPlayerIds.includes(currentUser.id)) return false;

        // Filter based on selected stats mode
        if (statsMode !== 'overall' && match.matchType !== statsMode) {
          return false;
        }

        return true;
      })
      .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime()); // Sort by date, newest first
  };

  // Helper to format names with first name and last initial
  const formatPlayerNameWithInitial = (fullName: string) => {
    const parts = fullName.trim().split(' ');
    if (parts.length < 2) return fullName;
    return `${parts[0]} ${parts[parts.length - 1][0]}.`;
  };

  // Get formatted team label for a match
  const getMatchTeamLabel = (match: Match, teamNumber: 1 | 2) => {
    if (!currentUser) return 'Unknown';
    const playerIds = teamNumber === 1 ? match.team1PlayerIds : match.team2PlayerIds;
    return playerIds
      .map((id: string) => {
        if (id === currentUser.id) return 'Me';
        const player = players.find(p => p.id === id);
        return player ? formatPlayerNameWithInitial(player.name) : 'Unknown';
      })
      .join(' & ');
  };

  // Get both team names formatted for display
  const getMatchTeamsDisplay = (match: Match) => {
    if (!currentUser) return 'Unknown vs Unknown';
    const isInTeam1 = match.team1PlayerIds.includes(currentUser.id);
    const userTeamNum: 1 | 2 = isInTeam1 ? 1 : 2;
    const opponentTeamNum: 1 | 2 = isInTeam1 ? 2 : 1;
    return `${getMatchTeamLabel(match, userTeamNum)} vs ${getMatchTeamLabel(match, opponentTeamNum)}`;
  };

  // Add a function to format the match date
  const formatMatchDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Add a function to render time filters
  const renderTimeFilters = () => (
    <View style={styles.timeFiltersContainer}>
      <TouchableOpacity
        style={[styles.timeFilterTab, timeFilter === 'all' && styles.activeTimeFilter]}
        onPress={() => setTimeFilter('all')}
        accessibilityRole="tab"
        accessibilityState={{ selected: timeFilter === 'all' }}
      >
        <Text style={[styles.timeFilterText, timeFilter === 'all' && styles.activeTimeFilterText]}>
          All Time
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.timeFilterTab, timeFilter === 'recent' && styles.activeTimeFilter]}
        onPress={() => setTimeFilter('recent')}
        accessibilityRole="tab"
        accessibilityState={{ selected: timeFilter === 'recent' }}
      >
        <Text style={[styles.timeFilterText, timeFilter === 'recent' && styles.activeTimeFilterText]}>
          Last 30 Days
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Render the opponent analytics section
  const renderOpponentAnalytics = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Icon name="users" size={24} color={colors.primary} />
        <Text style={styles.sectionTitle}>Opponent Analysis</Text>
      </View>

      {opponentStats.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>
            No opponent data available for the selected mode and time period.
          </Text>
        </View>
      ) : (
        <View style={styles.opponentListContainer}>
          <View style={styles.opponentHeader}>
            <Text style={styles.opponentNameHeader}>Opponent</Text>
            <Text style={styles.opponentStatHeader} numberOfLines={1}>W-L</Text>
            <Text style={styles.opponentStatHeader} numberOfLines={1}>Win %</Text>
          </View>

          {opponentStats.slice(0, 5).map((opponent) => (
            <View key={opponent.playerId} style={styles.opponentRow}>
              <Text style={styles.opponentName}>{opponent.playerName}</Text>
              <Text style={styles.opponentRecord}>
                {opponent.wins}-{opponent.losses}
              </Text>
              <View style={[
                styles.winRateBadge,
                opponent.winPercentage >= 50 ? styles.goodWinRate : styles.badWinRate
              ]}>
                <Text style={styles.winRateText}>
                  {opponent.winPercentage.toFixed(0)}%
                </Text>
              </View>
            </View>
          ))}

          {opponentStats.length > 5 && (
            <Text style={styles.moreOpponentsText}>
              +{opponentStats.length - 5} more opponents
            </Text>
          )}
        </View>
      )}
    </View>
  );

  // Render partner stats section
  const renderPartnerStats = () => {
    // Only show for doubles or overall modes
    if (statsMode === 'singles') return null;

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Icon name="users" size={24} color={colors.primary} />
          <Text style={styles.sectionTitle}>Doubles Partners</Text>
        </View>

        {partnerStats.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No doubles partner data available for the selected time period.
            </Text>
          </View>
        ) : (
          <View style={styles.partnerListContainer}>
            <View style={styles.partnerHeader}>
              <Text style={styles.partnerNameHeader}>Partner</Text>
              <Text style={styles.partnerStatHeader} numberOfLines={1}>Matches</Text>
              <Text style={styles.partnerStatHeader} numberOfLines={1}>W-L</Text>
              <Text style={styles.partnerStatHeader} numberOfLines={1}>Win %</Text>
            </View>

            {partnerStats.slice(0, 5).map((partner) => (
              <View key={partner.partnerId} style={styles.partnerRow}>
                <Text style={styles.partnerName}>{partner.partnerName}</Text>
                <Text style={styles.partnerMatches}>{partner.totalMatches}</Text>
                <Text style={styles.partnerRecord}>
                  {partner.wins}-{partner.losses}
                </Text>
                <Text style={[
                  styles.partnerWinRate,
                  partner.winPercentage >= 50 ? styles.goodWinRate : styles.badWinRate
                ]}>
                  {partner.winPercentage.toFixed(0)}%
                </Text>
              </View>
            ))}

            {partnerStats.length > 5 && (
              <Text style={styles.morePartnersText}>
                +{partnerStats.length - 5} more partners
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <Layout title="My Stats" isInTabNavigator={true}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {renderStatsTabs()}
        {renderTimeFilters()}

        {winStreak[statsMode] > 3 && (
          <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
            <PicklePete pose="win" message={`${winStreak[statsMode]} win streak! You're on fire!`} />
          </View>
        )}
        {lossStreak[statsMode] > 3 && (
          <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
            <PicklePete pose="loss" size="sm" message="Keep your head up, you'll bounce back!" />
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="bar-chart" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>
              {statsMode === 'overall' ? 'Overall Performance' :
               statsMode === 'singles' ? 'Singles Performance' : 'Doubles Performance'}
            </Text>
          </View>

          {renderStatsCard()}
        </View>

        {renderOpponentAnalytics()}
        {renderPartnerStats()}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="trending-up" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Performance Summary</Text>
          </View>

          {(!currentUser || !extendedStats[currentUser.id]) ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No performance data available yet.
              </Text>
            </View>
          ) : (
            <View style={styles.performanceSummary}>
              <View style={styles.streakContainer}>
                <View style={styles.streakCard}>
                  <View style={styles.streakIconBackground}>
                    <Icon name="flame" size={28} color={colors.action} />
                  </View>
                  <Text style={styles.streakValue}>{winStreak[statsMode]}</Text>
                  <Text style={styles.streakLabel}>CURRENT WIN STREAK</Text>
                </View>

                <View style={styles.streakCard}>
                  <View style={styles.streakIconBackground}>
                    <Icon name="clock" size={28} color={colors.loss} />
                  </View>
                  <Text style={styles.streakValue}>
                    {matchesSinceLastWin[statsMode] > 0
                      ? matchesSinceLastWin[statsMode]
                      : '-'}
                  </Text>
                  <Text style={styles.streakLabel}>
                    {matchesSinceLastWin[statsMode] > 0
                      ? 'MATCHES SINCE WIN'
                      : 'ON A WINNING STREAK!'}
                  </Text>
                </View>
              </View>

              <View style={styles.winRateBadge}>
                <Icon name="bar-chart-2" size={18} color={colors.primary} style={styles.winRateIcon} />
                <Text style={styles.winRateText}>
                  WIN RATE: {extendedStats[currentUser.id][statsMode].winPercentage.toFixed(1)}%
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="list" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Match History</Text>
          </View>

          {getFilteredMatches().length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No matches found for the selected mode.
              </Text>
            </View>
          ) : (
            <View>
              {getFilteredMatches().map(match => (
                <View key={match.id} style={styles.matchItem}>
                  <View style={styles.matchHeader}>
                    <Text style={styles.matchDate}>{formatMatchDate(match.scheduledDate)}</Text>
                    <View style={[
                      styles.resultBadge,
                      currentUser && isUserWinner(match, currentUser.id) ? styles.winBadge : styles.lossBadge
                    ]}>
                      <Text style={[
                        styles.resultText,
                        currentUser && isUserWinner(match, currentUser.id) ? styles.winText : styles.lossText
                      ]}>
                        {currentUser && isUserWinner(match, currentUser.id) ? 'Win' : 'Loss'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.matchDetails}>
                    <Text style={styles.matchOpponents}>
                      {getMatchTeamsDisplay(match)}
                    </Text>
                    <Text style={styles.matchType}>
                      {match.matchType === 'doubles' ? 'Doubles' : 'Singles'}
                    </Text>
                  </View>

                  {match.games && match.games.length > 0 && (
                    <View style={styles.scoreContainer}>
                      <Text style={styles.scoreLabel}>Score:</Text>
                      <Text style={styles.matchScore}>
                        {match.games.map(g => `${g.team1Score}-${g.team2Score}`).join(', ')}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </Layout>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.lg,
  },
  tabContainer: {
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
    backgroundColor: colors.primaryOverlay,
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
  section: {
    backgroundColor: colors.white,
    margin: spacing.lg,
    marginBottom: spacing.xl,
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
    ...shadows.md,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: colors.surface,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.primary,
    marginLeft: spacing.sm,
  },
  sectionSubtitle: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.primary,
    marginVertical: spacing.md,
  },
  statsCard: {
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.md,
    padding: spacing.xl,
    ...shadows.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  statItem: {
    alignItems: 'center',
    minWidth: 65,
  },
  statValue: {
    ...typography.stats,
    color: colors.primary,
  },
  statLabel: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.gray500,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: colors.gray200,
    marginVertical: spacing.lg,
  },
  emptyState: {
    padding: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.sm,
  },
  emptyStateText: {
    ...typography.bodyLarge,
    color: colors.gray500,
    textAlign: 'center',
    lineHeight: 24,
  },
  performanceSummary: {
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    borderTopWidth: 1,
    borderTopColor: colors.gray200,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  summaryText: {
    ...typography.bodyLarge,
    color: colors.neutral,
    lineHeight: 24,
    marginBottom: spacing.sm,
  },
  matchItem: {
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.inputBorder,
    ...shadows.sm,
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  matchDate: {
    ...typography.label,
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  resultBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  winBadge: {
    backgroundColor: colors.winOverlay,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  lossBadge: {
    backgroundColor: colors.lossOverlay,
    borderWidth: 1,
    borderColor: colors.loss,
  },
  resultText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '700',
  },
  winText: {
    color: colors.win,
  },
  lossText: {
    color: colors.loss,
  },
  matchDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  matchOpponents: {
    ...typography.bodyLarge,
    fontWeight: '600',
    color: colors.neutral,
    flex: 1,
  },
  matchType: {
    ...typography.bodySmall,
    color: colors.gray500,
    fontWeight: '500',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreLabel: {
    ...typography.bodySmall,
    color: colors.gray500,
    fontWeight: '500',
    marginRight: spacing.xs,
  },
  matchScore: {
    ...typography.label,
    fontSize: 15,
    color: colors.primary,
    fontWeight: '600',
  },
  timeFiltersContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  timeFilterTab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.gray100,
  },
  activeTimeFilter: {
    backgroundColor: colors.primaryOverlay,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  timeFilterText: {
    ...typography.label,
    color: colors.gray500,
  },
  activeTimeFilterText: {
    ...typography.button,
    color: colors.primary,
  },
  opponentListContainer: {
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
  },
  opponentHeader: {
    flexDirection: 'row',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.cardBorder,
    marginBottom: spacing.xs,
  },
  opponentNameHeader: {
    flex: 2,
    ...typography.bodySmall,
    color: colors.gray500,
    fontWeight: '500',
  },
  opponentStatHeader: {
    flex: 1,
    ...typography.bodySmall,
    color: colors.gray500,
    fontWeight: '500',
    textAlign: 'center',
  },
  opponentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  opponentName: {
    flex: 2,
    ...typography.bodyLarge,
    color: colors.neutral,
  },
  opponentRecord: {
    flex: 1,
    ...typography.bodySmall,
    color: colors.gray500,
    textAlign: 'center',
  },
  winRateBadge: {
    backgroundColor: colors.primaryOverlay,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    ...shadows.sm,
  },
  goodWinRate: {
    backgroundColor: colors.winOverlay,
  },
  badWinRate: {
    backgroundColor: colors.lossOverlay,
  },
  winRateText: {
    ...typography.bodyLarge,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  winRateIcon: {
    marginRight: spacing.sm,
  },
  moreOpponentsText: {
    textAlign: 'center',
    color: colors.gray500,
    ...typography.bodySmall,
    marginTop: spacing.sm,
  },
  scoreSpreadContainer: {
    flexDirection: 'row',
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  spreadStat: {
    alignItems: 'center',
    flex: 1,
  },
  spreadValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.neutral,
  },
  spreadLabel: {
    ...typography.caption,
    color: colors.gray500,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  positiveMargin: {
    color: colors.primary,
  },
  negativeMargin: {
    color: colors.error,
  },
  scoreExtremes: {
    flexDirection: 'row',
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  extremeStat: {
    flex: 1,
    alignItems: 'center',
  },
  extremeLabel: {
    ...typography.bodySmall,
    color: colors.gray500,
  },
  extremeValue: {
    ...typography.bodyLarge,
    fontWeight: 'bold',
    color: colors.neutral,
    marginTop: spacing.xs,
  },
  emptyStateContainer: {
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.sm,
  },
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.inputBorder,
    borderRadius: 1,
  },
  dividerText: {
    ...typography.caption,
    paddingHorizontal: spacing.md,
    color: colors.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  positiveValue: {
    color: colors.primary,
  },
  negativeValue: {
    color: colors.error,
  },
  streakContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  streakCard: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    margin: spacing.sm,
    ...shadows.md,
  },
  streakIconBackground: {
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 18,
    ...shadows.sm,
  },
  streakValue: {
    ...typography.stats,
    fontSize: 36,
    color: colors.primary,
    marginVertical: spacing.xs,
  },
  streakLabel: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.gray500,
    textAlign: 'center',
    letterSpacing: 0.7,
  },
  partnerListContainer: {
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    ...shadows.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
  },
  partnerHeader: {
    flexDirection: 'row',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray200,
    marginBottom: spacing.sm,
  },
  partnerNameHeader: {
    flex: 2,
    ...typography.bodySmall,
    color: colors.gray500,
    fontWeight: '600',
  },
  partnerStatHeader: {
    flex: 1,
    ...typography.bodySmall,
    color: colors.gray500,
    fontWeight: '600',
    textAlign: 'center',
  },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  partnerName: {
    flex: 2,
    ...typography.bodyLarge,
    fontWeight: '500',
    color: colors.neutral,
  },
  partnerMatches: {
    flex: 1,
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.gray500,
    textAlign: 'center',
  },
  partnerRecord: {
    flex: 1,
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.gray500,
    textAlign: 'center',
  },
  partnerWinRate: {
    flex: 1,
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  morePartnersText: {
    textAlign: 'center',
    color: colors.gray500,
    ...typography.bodySmall,
    marginTop: spacing.md,
    fontWeight: '500',
  },
});

export default MyStatsScreen;
