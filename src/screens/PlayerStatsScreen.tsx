import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import Layout from '../components/Layout';
import { Match } from '../types';

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
  const [matchesSinceLastWin, setMatchesSinceLastWin] = useState<Record<StatsMode, number>>({
    overall: 0,
    singles: 0,
    doubles: 0
  });

  // Helper function to determine which team a user is on in a match
  const getUserTeamNumber = (match: Match, userId: string): number | null => {
    if (match.teams) {
      if (match.teams.team1.includes(userId)) return 1;
      if (match.teams.team2.includes(userId)) return 2;
      return null;
    } else {
      // For older format
      const playerIndex = match.players.indexOf(userId);
      if (playerIndex === -1) return null;
      
      // For singles: player 0 is team 1, player 1 is team 2
      if (!match.isDoubles) {
        return playerIndex === 0 ? 1 : 2;
      }
      
      // For doubles: first half is team 1, second half is team 2
      const midPoint = Math.floor(match.players.length / 2);
      return playerIndex < midPoint ? 1 : 2;
    }
  };

  // Helper function to determine if a user won a match
  const isUserWinner = (match: Match, userId: string): boolean => {
    if (!match.winner) return false;
    
    if (Array.isArray(match.winner)) {
      return match.winner.includes(userId);
    } else if (typeof match.winner === 'number') {
      const userTeam = getUserTeamNumber(match, userId);
      return userTeam === match.winner;
    }
    
    return false;
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
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Sort by date, oldest first
    
    completedMatches.forEach(match => {
      // Get all player IDs involved in the match
      const playerIds = match.teams 
        ? [...match.teams.team1, ...match.teams.team2] 
        : match.players;
      
      // Skip if current user is not in this match
      if (!playerIds.includes(currentUser.id)) return;

      // Determine the match type (singles or doubles)
      const matchType = match.isDoubles ? 'doubles' : 'singles';
      
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
      if (match.score && typeof match.score === 'string') {
        const gameScores = match.score.split(', ').map(score => {
          const [team1Score, team2Score] = score.split('-').map(Number);
          return { team1Score, team2Score };
        });
        
        // Get the user's team number
        const userTeamNumber = getUserTeamNumber(match, currentUser.id);
        if (!userTeamNumber) return;
        
        // Process each game in the match
        gameScores.forEach((game) => {
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
      
      const playerIds = match.teams 
        ? [...match.teams.team1, ...match.teams.team2] 
        : match.players;
      
      if (!playerIds.includes(currentUser.id)) return false;
      
      // Filter by match type if needed
      if (statsMode !== 'overall' && ((statsMode === 'singles' && match.isDoubles) || 
          (statsMode === 'doubles' && !match.isDoubles))) {
        return false;
      }
      
      // Filter by time if needed
      if (timeFilter === 'recent') {
        const matchDate = new Date(match.date);
        return matchDate >= recentCutoff;
      }
      
      return true;
    });

    // Calculate opponent stats
    const opponentMap: Record<string, OpponentStats> = {};
    
    filteredMatches.forEach(match => {
      // Skip matches without proper score format
      if (!match.score || typeof match.score !== 'object' || !match.score.team1 || !match.score.team2) {
        return;
      }
      
      // Get the user's team number
      const userTeamNumber = getUserTeamNumber(match, currentUser.id);
      if (!userTeamNumber) return;
      
      // Get opponent IDs
      const opponents = match.teams ? 
        (userTeamNumber === 1 ? match.teams.team2 : match.teams.team1) : 
        (userTeamNumber === 1 ? [match.players[1]] : [match.players[0]]);
      
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
        const playerIds = match.teams
          ? [...match.teams.team1, ...match.teams.team2]
          : match.players;
        return match.status === 'completed' && playerIds.includes(currentUser.id);
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Sort newest first
    
    // Calculate streaks for each mode
    const newWinStreak = { overall: 0, singles: 0, doubles: 0 };
    const newMatchesSinceLastWin = { overall: 0, singles: 0, doubles: 0 };
    
    // Overall streak
    for (const match of userMatches) {
      const isWin = isUserWinner(match, currentUser.id);
      
      if (isWin) {
        if (newMatchesSinceLastWin.overall === 0) {
          newWinStreak.overall++;
        } else {
          // Win streak is broken
          break;
        }
      } else {
        newMatchesSinceLastWin.overall++;
        // Once we hit a loss, we can stop counting for win streak
        break;
      }
    }
    
    // Singles streak
    const singleMatches = userMatches.filter(match => !match.isDoubles);
    for (const match of singleMatches) {
      const isWin = isUserWinner(match, currentUser.id);
      
      if (isWin) {
        if (newMatchesSinceLastWin.singles === 0) {
          newWinStreak.singles++;
        } else {
          break;
        }
      } else {
        newMatchesSinceLastWin.singles++;
        break;
      }
    }
    
    // Doubles streak
    const doubleMatches = userMatches.filter(match => match.isDoubles);
    for (const match of doubleMatches) {
      const isWin = isUserWinner(match, currentUser.id);
      
      if (isWin) {
        if (newMatchesSinceLastWin.doubles === 0) {
          newWinStreak.doubles++;
        } else {
          break;
        }
      } else {
        newMatchesSinceLastWin.doubles++;
        break;
      }
    }
    
    setWinStreak(newWinStreak);
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
      if (match.status !== 'completed' || !match.isDoubles) return false;
      
      const playerIds = match.teams 
        ? [...match.teams.team1, ...match.teams.team2] 
        : match.players;
      
      if (!playerIds.includes(currentUser.id)) return false;
      
      // Filter by time if needed
      if (timeFilter === 'recent') {
        const matchDate = new Date(match.date);
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
      const team = match.teams
        ? (userTeamNumber === 1 ? match.teams.team1 : match.teams.team2)
        : (userTeamNumber === 1 
           ? match.players.slice(0, 2) // Team 1: first half of players array
           : match.players.slice(2));  // Team 2: second half of players array
      
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
      <TouchableOpacity 
        style={[styles.tab, statsMode === 'overall' && styles.activeTab]}
        onPress={() => setStatsMode('overall')}
      >
        <Text style={[styles.tabText, statsMode === 'overall' && styles.activeTabText]}>
          Overall
        </Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.tab, statsMode === 'singles' && styles.activeTab]}
        onPress={() => setStatsMode('singles')}
      >
        <Text style={[styles.tabText, statsMode === 'singles' && styles.activeTabText]}>
          Singles
        </Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.tab, statsMode === 'doubles' && styles.activeTab]}
        onPress={() => setStatsMode('doubles')}
      >
        <Text style={[styles.tabText, statsMode === 'doubles' && styles.activeTabText]}>
          Doubles
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Render the stats card for the current user
  const renderStatsCard = () => {
    if (!currentUser || !extendedStats[currentUser.id]) {
      return (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyStateText}>No stats available</Text>
        </View>
      );
    }

    const stats = extendedStats[currentUser.id][statsMode];
    
    return (
      <View style={styles.statsCard}>
        {/* Match Statistics */}
        <View style={styles.sectionHeader}>
          <Ionicons name="trophy" size={22} color="#0D6B3E" />
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
        const playerIds = match.teams 
          ? [...match.teams.team1, ...match.teams.team2] 
          : match.players;
        
        if (!playerIds.includes(currentUser.id)) return false;
        
        // Filter based on selected stats mode
        if (statsMode !== 'overall' && 
           ((statsMode === 'singles' && match.isDoubles) || 
            (statsMode === 'doubles' && !match.isDoubles))) {
          return false;
        }
        
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Sort by date, newest first
  };

  // Add a function to get opponent names for a match
  const getOpponentNames = (match: Match) => {
    if (!currentUser || !match.teams) return 'Unknown opponents';
    
    // Check which team the current user is on
    const isInTeam1 = match.teams.team1.includes(currentUser.id);
    
    // Get the opponent team players
    const opponentTeam = isInTeam1 ? match.teams.team2 : match.teams.team1;
    
    // Convert opponent IDs to names
    return opponentTeam.map((playerId: string) => {
      const player = players.find(p => p.id === playerId);
      return player ? player.name : 'Unknown';
    }).join(' & ');
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
      >
        <Text style={[styles.timeFilterText, timeFilter === 'all' && styles.activeTimeFilterText]}>
          All Time
        </Text>
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.timeFilterTab, timeFilter === 'recent' && styles.activeTimeFilter]}
        onPress={() => setTimeFilter('recent')}
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
        <Ionicons name="people" size={24} color="#0D6B3E" />
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
            <Text style={styles.opponentStatHeader}>W-L</Text>
            <Text style={styles.opponentStatHeader}>Win %</Text>
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
          <Ionicons name="people-circle" size={24} color="#0D6B3E" />
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
              <Text style={styles.partnerStatHeader}>Matches</Text>
              <Text style={styles.partnerStatHeader}>W-L</Text>
              <Text style={styles.partnerStatHeader}>Win %</Text>
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
    <Layout title="My Stats">
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {renderStatsTabs()}
        {renderTimeFilters()}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="analytics" size={24} color="#0D6B3E" />
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
            <Ionicons name="trending-up" size={24} color="#0D6B3E" />
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
                    <Ionicons name="flame" size={28} color="#FF9500" />
                  </View>
                  <Text style={styles.streakValue}>{winStreak[statsMode]}</Text>
                  <Text style={styles.streakLabel}>CURRENT WIN STREAK</Text>
                </View>
                
                <View style={styles.streakCard}>
                  <View style={styles.streakIconBackground}>
                    <Ionicons name="time" size={28} color="#FF3B30" />
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
                <Ionicons name="stats-chart" size={18} color="#0D6B3E" style={styles.winRateIcon} />
                <Text style={styles.winRateText}>
                  WIN RATE: {extendedStats[currentUser.id][statsMode].winPercentage.toFixed(1)}%
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="list" size={24} color="#0D6B3E" />
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
                    <Text style={styles.matchDate}>{formatMatchDate(match.date)}</Text>
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
                      vs {getOpponentNames(match)}
                    </Text>
                    <Text style={styles.matchType}>
                      {match.isDoubles ? 'Doubles' : 'Singles'}
                    </Text>
                  </View>
                  
                  {match.score && (
                    <View style={styles.scoreContainer}>
                      <Text style={styles.scoreLabel}>Score:</Text>
                      <Text style={styles.matchScore}>{
                        typeof match.score === 'object' && match.score !== null && 
                        'team1' in match.score && 'team2' in match.score ? 
                          `${match.score.team1} - ${match.score.team2}` 
                          : String(match.score)
                      }</Text>
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
    paddingBottom: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 8,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#0D6B3E',
    backgroundColor: '#f0fff4',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 0.5,
  },
  activeTabText: {
    color: '#0D6B3E',
    fontWeight: '700',
  },
  section: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 20,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 4,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: '#f0f0f0',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0D6B3E',
    marginLeft: 10,
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0D6B3E',
    marginVertical: 12,
  },
  statsCard: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    borderLeftWidth: 2,
    borderLeftColor: '#0D6B3E',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statItem: {
    alignItems: 'center',
    minWidth: 65,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0D6B3E',
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 16,
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  performanceSummary: {
    padding: 20,
    backgroundColor: '#f5f7fa',
    borderRadius: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#0D6B3E',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  summaryText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
    marginBottom: 8,
  },
  matchItem: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#ddd',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  matchDate: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0D6B3E',
  },
  resultBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  winBadge: {
    backgroundColor: 'rgba(13, 107, 62, 0.15)',
    borderWidth: 1,
    borderColor: '#0D6B3E',
  },
  lossBadge: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    borderWidth: 1,
    borderColor: '#FF3B30',
  },
  resultText: {
    fontSize: 13,
    fontWeight: '700',
  },
  winText: {
    color: '#0D6B3E',
  },
  lossText: {
    color: '#FF3B30',
  },
  matchDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  matchOpponents: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  matchType: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  scoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
    marginRight: 6,
  },
  matchScore: {
    fontSize: 15,
    color: '#0D6B3E',
    fontWeight: '600',
  },
  timeFiltersContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  timeFilterTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTimeFilter: {
    borderBottomColor: '#0D6B3E',
    backgroundColor: '#f0f9ff',
  },
  timeFilterText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  activeTimeFilterText: {
    color: '#0D6B3E',
  },
  opponentListContainer: {
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 12,
  },
  opponentHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 4,
  },
  opponentNameHeader: {
    flex: 3,
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  opponentStatHeader: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
    textAlign: 'center',
  },
  opponentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  opponentName: {
    flex: 3,
    fontSize: 16,
    color: '#333',
  },
  opponentRecord: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  winRateBadge: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#0D6B3E',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  goodWinRate: {
    backgroundColor: 'rgba(13, 107, 62, 0.2)',
  },
  badWinRate: {
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
  },
  winRateText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0D6B3E',
    letterSpacing: 0.5,
  },
  winRateIcon: {
    marginRight: 8,
  },
  moreOpponentsText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
  scoreSpreadContainer: {
    flexDirection: 'row',
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    padding: 12,
    justifyContent: 'space-between',
  },
  spreadStat: {
    alignItems: 'center',
    flex: 1,
  },
  spreadValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  spreadLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  positiveMargin: {
    color: '#0D6B3E',
  },
  negativeMargin: {
    color: '#F44336',
  },
  scoreExtremes: {
    flexDirection: 'row',
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    marginTop: 8,
    padding: 12,
  },
  extremeStat: {
    flex: 1,
    alignItems: 'center',
  },
  extremeLabel: {
    fontSize: 14,
    color: '#666',
  },
  extremeValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 4,
  },
  emptyStateContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
  },
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    paddingHorizontal: 16,
  },
  dividerLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#ddd',
    borderRadius: 1,
  },
  dividerText: {
    paddingHorizontal: 12,
    color: '#0D6B3E',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  positiveValue: {
    color: '#4CAF50',  // Green color for positive values
  },
  negativeValue: {
    color: '#F44336',  // Red color for negative values
  },
  streakContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  streakCard: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    margin: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  streakIconBackground: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  streakValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#0D6B3E',
    marginVertical: 6,
  },
  streakLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
    letterSpacing: 0.7,
  },
  partnerListContainer: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    borderLeftWidth: 2,
    borderLeftColor: '#0D6B3E',
  },
  partnerHeader: {
    flexDirection: 'row',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    marginBottom: 8,
  },
  partnerNameHeader: {
    flex: 3,
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  partnerStatHeader: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
    textAlign: 'center',
  },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  partnerName: {
    flex: 3,
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  partnerMatches: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  partnerRecord: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  partnerWinRate: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0D6B3E',
    textAlign: 'center',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  morePartnersText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
    marginTop: 12,
    fontWeight: '500',
  },
});

export default MyStatsScreen; 