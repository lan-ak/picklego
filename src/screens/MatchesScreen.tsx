import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Icon } from '../components/Icon';
import MatchCard from '../components/MatchCard';
import { useData } from '../context/DataContext';
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
  const { matches, players, currentUser, getPlayerName, refreshMatches } = useData();
  const [activeTab, setActiveTab] = useState<MatchesTab>('all');

  // Refresh matches from Firestore whenever this screen gains focus
  useFocusEffect(
    useCallback(() => {
      refreshMatches();
    }, [])
  );
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

  const renderMatch = (match: Match) => (
    <MatchCard
      key={match.id}
      match={match}
      currentUserId={currentUser?.id || ''}
      getPlayerName={getPlayerName}
      onPress={() => navigation.navigate('MatchDetails', { matchId: match.id })}
    />
  );

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
});

export default MatchesScreen;
