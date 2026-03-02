import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Match, Game, LegacyMatch, Player, PlayerStats, DataContextType, MatchNotification } from '../types';
import { calculatePlayerStats } from '../utils/statsCalculator';
import {
  signUpWithEmail,
  signInWithEmail,
  signOut,
  onAuthStateChanged,
  createPlayerDocument,
  updatePlayerDocument,
  getPlayerDocument,
  getPlayerByEmail,
  createMatchDocument,
  updateMatchDocument,
  deleteMatchDocument,
  deletePlayerDocument,
  getMatchesForPlayer,
  sendPasswordReset,
  signInWithGoogle,
  signInWithApple,
  getCurrentUser,
  createNotificationDocument,
  updateNotificationDocument,
  getNotificationsForPlayer,
  getNotificationsBySender,
} from '../config/firebase';
import { registerPushToken, removePushToken } from '../services/pushNotifications';

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [deletedPlayers, setDeletedPlayers] = useState<Player[]>([]);
  const [currentUser, setCurrentUser] = useState<Player | null>(null);
  const [notifications, setNotifications] = useState<MatchNotification[]>([]);

  // Load data from AsyncStorage on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const storedMatches = await AsyncStorage.getItem('matches');
        const storedPlayers = await AsyncStorage.getItem('players');
        const storedDeletedPlayers = await AsyncStorage.getItem('deletedPlayers');
        const storedCurrentUser = await AsyncStorage.getItem('currentUser');
        
        if (storedMatches) setMatches(JSON.parse(storedMatches));
        if (storedPlayers) setPlayers(JSON.parse(storedPlayers));
        if (storedDeletedPlayers) setDeletedPlayers(JSON.parse(storedDeletedPlayers));
        if (storedCurrentUser) setCurrentUser(JSON.parse(storedCurrentUser));
        else if (storedPlayers) {
          // Set first player as current user if none is set
          const parsedPlayers = JSON.parse(storedPlayers);
          if (parsedPlayers.length > 0) {
            setCurrentUser(parsedPlayers[0]);
            await AsyncStorage.setItem('currentUser', JSON.stringify(parsedPlayers[0]));
          }
        }
      } catch (error) {
        console.error('Error loading data:', error);
      }
    };
    
    loadData();
  }, []);

  // Save data to AsyncStorage whenever it changes
  useEffect(() => {
    const saveData = async () => {
      try {
        await AsyncStorage.setItem('matches', JSON.stringify(matches));
        await AsyncStorage.setItem('players', JSON.stringify(players));
        await AsyncStorage.setItem('deletedPlayers', JSON.stringify(deletedPlayers));
        if (currentUser) {
          await AsyncStorage.setItem('currentUser', JSON.stringify(currentUser));
        }
      } catch (error) {
        console.error('Error saving data:', error);
      }
    };
    
    saveData();
  }, [matches, players, deletedPlayers, currentUser]);

  // Check for stale/expired matches
  useEffect(() => {
    const now = new Date();
    const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours

    const expiredMatches = matches.filter(match => {
      if (match.status !== 'scheduled') return false;
      const scheduledTime = new Date(match.scheduledDate).getTime();
      return now.getTime() - scheduledTime > staleThreshold;
    });

    if (expiredMatches.length > 0) {
      setMatches(prev => prev.map(match => {
        if (expiredMatches.some(e => e.id === match.id)) {
          return { ...match, status: 'expired' as const };
        }
        return match;
      }));

      // Update expired status in Firestore
      expiredMatches.forEach(async (match) => {
        try {
          await updateMatchDocument(match.id, { status: 'expired' });
        } catch (error) {
          console.error('Error marking match as expired in Firestore:', error);
        }
      });
    }
  }, [matches.length]);

  // Expire notifications for matches that are past their date + 24 hours
  useEffect(() => {
    if (notifications.length === 0) return;

    const now = Date.now();
    const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours

    const expiredIds = new Set<string>();
    for (const notif of notifications) {
      if (!notif.matchDate) continue;
      const matchTime = new Date(notif.matchDate).getTime();
      if (now - matchTime > staleThreshold) {
        expiredIds.add(notif.id);
      }
    }

    if (expiredIds.size > 0) {
      setNotifications(prev => prev.filter(n => !expiredIds.has(n.id)));
    }
  }, [notifications.length]);

  // Claim a placeholder profile created before the user signed up.
  // When Player A creates a match and adds Player B by email before B has
  // an account, a placeholder player doc is stored with pendingClaim: true.
  // Once B signs up / signs in with that email we transfer the match history
  // from the placeholder to the real user and delete the placeholder doc.
  const claimPlaceholderProfile = async (
    realUid: string,
    realName: string,
    email: string,
  ) => {
    try {
      const placeholder = await getPlayerByEmail(email);

      if (!placeholder || !placeholder.pendingClaim || placeholder.id === realUid) {
        return; // nothing to claim
      }

      const placeholderId = placeholder.id;

      // 1. Fetch every match that references the placeholder
      const placeholderMatches = await getMatchesForPlayer(placeholderId);

      // 2. Re-point each match from the placeholder ID to the real UID
      for (const match of placeholderMatches) {
        const replaceId = (ids: string[]) =>
          ids.map(id => (id === placeholderId ? realUid : id));

        const replaceName = (ids: string[], names: string[]) =>
          ids.map((id, i) => (id === placeholderId ? realName : names[i]));

        const updatedFields: Partial<Match> = {
          allPlayerIds: replaceId(match.allPlayerIds),
          team1PlayerIds: replaceId(match.team1PlayerIds),
          team2PlayerIds: replaceId(match.team2PlayerIds),
          team1PlayerNames: replaceName(match.team1PlayerIds, match.team1PlayerNames),
          team2PlayerNames: replaceName(match.team2PlayerIds, match.team2PlayerNames),
        };

        await updateMatchDocument(match.id, updatedFields);

        // Also update local state so the UI reflects the change immediately
        setMatches(prev =>
          prev.map(m =>
            m.id === match.id ? { ...m, ...updatedFields } : m,
          ),
        );
      }

      // 3. Merge any stats from the placeholder into the real player doc
      if (placeholder.stats && placeholder.stats.totalMatches > 0) {
        const realPlayer = await getPlayerDocument(realUid);
        if (realPlayer) {
          const mergedStats: PlayerStats = {
            totalMatches: (realPlayer.stats?.totalMatches ?? 0) + placeholder.stats.totalMatches,
            wins: (realPlayer.stats?.wins ?? 0) + placeholder.stats.wins,
            losses: (realPlayer.stats?.losses ?? 0) + placeholder.stats.losses,
            winPercentage: 0,
            totalGames: (realPlayer.stats?.totalGames ?? 0) + (placeholder.stats.totalGames ?? 0),
            gameWins: (realPlayer.stats?.gameWins ?? 0) + (placeholder.stats.gameWins ?? 0),
            gameLosses: (realPlayer.stats?.gameLosses ?? 0) + (placeholder.stats.gameLosses ?? 0),
          };
          mergedStats.winPercentage =
            mergedStats.totalMatches > 0
              ? Math.round((mergedStats.wins / mergedStats.totalMatches) * 1000) / 10
              : 0;

          await updatePlayerDocument(realUid, { stats: mergedStats });

          setPlayers(prev =>
            prev.map(p => (p.id === realUid ? { ...p, stats: mergedStats } : p)),
          );
          setCurrentUser(prev =>
            prev && prev.id === realUid ? { ...prev, stats: mergedStats } : prev,
          );
        }
      }

      // 4. Delete the placeholder player document from Firestore
      await deletePlayerDocument(placeholderId);

      // 5. Remove the placeholder from local state
      setPlayers(prev => prev.filter(p => p.id !== placeholderId));

      console.log(
        `Claimed placeholder profile ${placeholderId} for user ${realUid}`,
      );
    } catch (error) {
      console.error('Error claiming placeholder profile:', error);
    }
  };

  // Initialize Firebase auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        // Get the player document from Firestore
        const playerDoc = await getPlayerDocument(firebaseUser.uid);
        if (playerDoc) {
          setCurrentUser(playerDoc);
          setPlayers(prev => {
            const filtered = prev.filter(p => p.id !== playerDoc.id);
            return [...filtered, playerDoc];
          });

          // Load matches from Firestore
          try {
            const firestoreMatches = await getMatchesForPlayer(firebaseUser.uid);
            if (firestoreMatches.length > 0) {
              setMatches(prev => {
                // Merge: Firestore matches take precedence, keep local-only matches
                const firestoreIds = new Set(firestoreMatches.map(m => m.id));
                const localOnly = prev.filter(m => !firestoreIds.has(m.id));
                return [...firestoreMatches, ...localOnly];
              });
            }
          } catch (error) {
            console.error('Error loading matches from Firestore:', error);
          }

          // Migrate legacy AsyncStorage matches to Firestore
          await migrateLocalMatchesToFirestore(firebaseUser.uid);

          // Load notifications for this user
          await loadNotifications(firebaseUser.uid);

          // Register for push notifications
          registerPushToken(firebaseUser.uid);

          // After loading the player doc and matches, check for a placeholder
          // profile that should be claimed by this user.
          if (firebaseUser.email) {
            await claimPlaceholderProfile(
              firebaseUser.uid,
              playerDoc.name,
              firebaseUser.email,
            );
          }
        }
      } else {
        setCurrentUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  // Migrate legacy AsyncStorage matches to Firestore on first sign-in
  const migrateLocalMatchesToFirestore = async (currentUserId: string) => {
    try {
      const alreadyMigrated = await AsyncStorage.getItem('matchesMigrated');
      if (alreadyMigrated === 'true') return;

      const storedMatches = await AsyncStorage.getItem('matches');
      if (!storedMatches) {
        await AsyncStorage.setItem('matchesMigrated', 'true');
        return;
      }

      const parsedMatches: any[] = JSON.parse(storedMatches);
      if (!Array.isArray(parsedMatches) || parsedMatches.length === 0) {
        await AsyncStorage.setItem('matchesMigrated', 'true');
        return;
      }

      const migratedMatches: Match[] = [];

      for (const raw of parsedMatches) {
        // Detect if this is a LegacyMatch by checking for legacy-only fields
        const isLegacy = 'isDoubles' in raw || ('teams' in raw && !('matchType' in raw));

        if (isLegacy) {
          const legacy = raw as LegacyMatch;
          const now = Date.now();

          const team1Ids = legacy.teams?.team1 ?? [];
          const team2Ids = legacy.teams?.team2 ?? [];
          const allPlayerIds = [...team1Ids, ...team2Ids];

          // Parse score into games array
          const games: Game[] = [];
          if (legacy.score) {
            if (typeof legacy.score === 'string') {
              // Format: "11-9"
              const parts = legacy.score.split('-').map(s => parseInt(s.trim(), 10));
              if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                const team1Score = parts[0];
                const team2Score = parts[1];
                games.push({
                  team1Score,
                  team2Score,
                  winnerTeam: team1Score > team2Score ? 1 : 2,
                });
              }
            } else if (typeof legacy.score === 'object' && legacy.score !== null) {
              const team1Score = typeof legacy.score.team1 === 'string'
                ? parseInt(legacy.score.team1, 10)
                : legacy.score.team1;
              const team2Score = typeof legacy.score.team2 === 'string'
                ? parseInt(legacy.score.team2, 10)
                : legacy.score.team2;
              if (!isNaN(team1Score) && !isNaN(team2Score)) {
                games.push({
                  team1Score,
                  team2Score,
                  winnerTeam: team1Score > team2Score ? 1 : 2,
                });
              }
            }
          }

          // Determine winnerTeam
          let winnerTeam: 1 | 2 | null = null;
          if (legacy.winner != null) {
            if (typeof legacy.winner === 'number' && (legacy.winner === 1 || legacy.winner === 2)) {
              winnerTeam = legacy.winner;
            } else if (Array.isArray(legacy.winner)) {
              const winnerArr = legacy.winner as string[];
              const matchesTeam1 =
                winnerArr.length === team1Ids.length &&
                winnerArr.every(id => team1Ids.includes(id));
              const matchesTeam2 =
                winnerArr.length === team2Ids.length &&
                winnerArr.every(id => team2Ids.includes(id));
              if (matchesTeam1) {
                winnerTeam = 1;
              } else if (matchesTeam2) {
                winnerTeam = 2;
              }
            }
          }

          const migratedMatch: Match = {
            id: legacy.id,
            createdBy: currentUserId,
            createdAt: now,
            lastModifiedAt: now,
            lastModifiedBy: currentUserId,
            matchType: legacy.isDoubles ? 'doubles' : 'singles',
            pointsToWin: legacy.pointsToWin,
            numberOfGames: legacy.numberOfGames,
            scheduledDate: legacy.date,
            location: legacy.location,
            status: legacy.status === 'completed' ? 'completed' : 'scheduled',
            team1PlayerIds: team1Ids,
            team2PlayerIds: team2Ids,
            team1PlayerNames: team1Ids.map(id => getPlayerName(id)),
            team2PlayerNames: team2Ids.map(id => getPlayerName(id)),
            games,
            winnerTeam,
            allPlayerIds,
          };

          migratedMatches.push(migratedMatch);
        } else {
          // Already in new schema — just push through to Firestore
          migratedMatches.push(raw as Match);
        }
      }

      // Write each migrated match to Firestore
      for (const match of migratedMatches) {
        try {
          await createMatchDocument(match);
        } catch (error) {
          console.error(`Error migrating match ${match.id} to Firestore:`, error);
        }
      }

      await AsyncStorage.setItem('matchesMigrated', 'true');
      console.log(`Migration complete: ${migratedMatches.length} match(es) migrated to Firestore.`);
    } catch (error) {
      console.error('Error during match migration:', error);
    }
  };

  const addMatch = async (matchData: Omit<Match, 'id' | 'createdAt' | 'lastModifiedAt' | 'lastModifiedBy'>): Promise<Match> => {
    const now = Date.now();
    const newMatch: Match = {
      ...matchData,
      id: now.toString(),
      createdAt: now,
      lastModifiedAt: now,
      lastModifiedBy: matchData.createdBy,
    };
    setMatches(prev => [...prev, newMatch]);

    // Persist to Firestore
    try {
      await createMatchDocument(newMatch);
    } catch (error) {
      console.error('Error saving match to Firestore:', error);
    }

    return newMatch;
  };

  const updateMatch = async (matchId: string, updates: Partial<Match>): Promise<void> => {
    const matchToUpdate = matches.find(m => m.id === matchId);
    if (!matchToUpdate) return;

    const updatedMatch: Match = {
      ...matchToUpdate,
      ...updates,
      lastModifiedAt: Date.now(),
      lastModifiedBy: currentUser?.id || matchToUpdate.lastModifiedBy,
    };

    setMatches(prev => prev.map(match =>
      match.id === matchId ? updatedMatch : match
    ));

    // Persist to Firestore
    try {
      await updateMatchDocument(matchId, {
        ...updates,
        lastModifiedAt: updatedMatch.lastModifiedAt,
        lastModifiedBy: updatedMatch.lastModifiedBy,
      });
    } catch (error) {
      console.error('Error updating match in Firestore:', error);
    }

    // Recalculate stats when a match is completed or a completed match is edited
    if (updates.status === 'completed' || (matchToUpdate.status === 'completed' && (updates.games || updates.winnerTeam))) {
      const updatedMatches = matches.map(m => m.id === matchId ? updatedMatch : m);
      await recalculateStatsForPlayers(updatedMatch.allPlayerIds, updatedMatches);
    }
  };

  const addPlayer = async (playerData: Omit<Player, 'id' | 'createdAt' | 'updatedAt'>): Promise<Player> => {
    try {
      let playerId: string;

      if (playerData.email && playerData.password) {
        // Create Firebase auth user for players with credentials
        const firebaseUser = await signUpWithEmail(playerData.email, playerData.password);
        playerId = firebaseUser.uid;
      } else {
        // Generate a local ID for invited/placeholder players
        playerId = Date.now().toString();
      }

      const newPlayer: Player = {
        ...playerData,
        id: playerId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        stats: {
          totalMatches: 0,
          wins: 0,
          losses: 0,
          winPercentage: 0,
          totalGames: 0,
          gameWins: 0,
          gameLosses: 0
        }
      };

      await createPlayerDocument(newPlayer);
      setPlayers(prev => [...prev, newPlayer]);

      // Only set as current user for auth signups
      if (playerData.email && playerData.password) {
        setCurrentUser(newPlayer);
      }

      return newPlayer;
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const getUpcomingMatch = () => {
    const now = new Date();
    return matches
      .filter(match => match.status === 'scheduled' && new Date(match.scheduledDate) > now)
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())[0] || null;
  };

  const getRecentMatches = (limit = 5) => {
    return matches
      .filter(match => match.status === 'completed')
      .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime())
      .slice(0, limit);
  };

  const getPlayerStats = (playerId: string) => {
    return players.find(player => player.id === playerId) || null;
  };

  const deleteMatch = async (matchId: string) => {
    const matchToDelete = matches.find(m => m.id === matchId);
    setMatches(prev => prev.filter(match => match.id !== matchId));

    // Delete from Firestore
    try {
      await deleteMatchDocument(matchId);
    } catch (error) {
      console.error('Error deleting match from Firestore:', error);
    }

    // Recalculate stats for all players in a deleted completed match
    if (matchToDelete && matchToDelete.status === 'completed') {
      const remainingMatches = matches.filter(m => m.id !== matchId);
      await recalculateStatsForPlayers(matchToDelete.allPlayerIds, remainingMatches);
    }
  };

  const updatePlayer = async (playerId: string, data: Partial<Player>) => {
    try {
      await updatePlayerDocument(playerId, data);
      const updatedDoc = await getPlayerDocument(playerId);
      if (updatedDoc) {
        setPlayers(prev => {
          const filtered = prev.filter(p => p.id !== playerId);
          return [...filtered, updatedDoc];
        });
        if (currentUser?.id === playerId) {
          setCurrentUser(updatedDoc);
        }
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const recalculateStatsForPlayers = async (playerIds: string[], currentMatches: Match[]) => {
    for (const playerId of playerIds) {
      const derived = calculatePlayerStats(currentMatches, playerId);
      const statsUpdate: PlayerStats = {
        totalMatches: derived.overall.totalMatches,
        wins: derived.overall.wins,
        losses: derived.overall.losses,
        winPercentage: derived.overall.winPercentage,
        totalGames: derived.overall.totalGames,
        gameWins: derived.overall.gameWins,
        gameLosses: derived.overall.gameLosses,
        currentWinStreak: derived.overall.currentWinStreak,
        bestWinStreak: derived.overall.bestWinStreak,
      };
      try {
        await updatePlayerDocument(playerId, { stats: statsUpdate });
      } catch (error) {
        console.error(`Error updating stats for player ${playerId}:`, error);
      }
      setPlayers(prev => prev.map(p =>
        p.id === playerId ? { ...p, stats: statsUpdate } : p
      ));
      if (currentUser?.id === playerId) {
        setCurrentUser(prev => prev ? { ...prev, stats: statsUpdate } : prev);
      }
    }
  };

  const resetAllData = async () => {
    try {
      // Delete user's matches from Firestore
      if (currentUser) {
        const userMatches = matches.filter(m => m.createdBy === currentUser.id);
        for (const match of userMatches) {
          try {
            await deleteMatchDocument(match.id);
          } catch (e) {
            console.error('Error deleting match from Firestore:', e);
          }
        }
      }

      // Clear all data in AsyncStorage
      await AsyncStorage.removeItem('matches');
      await AsyncStorage.removeItem('players');
      await AsyncStorage.removeItem('deletedPlayers');
      await AsyncStorage.removeItem('currentUser');
      await AsyncStorage.removeItem('matchesMigrated');

      // Reset state
      setMatches([]);
      setPlayers([]);
      setDeletedPlayers([]);
      setCurrentUser(null);

      console.log('All data has been reset');
      return true;
    } catch (error) {
      console.error('Error resetting data:', error);
      return false;
    }
  };

  // Check if email is available (not already used)
  const isEmailAvailable = async (email: string): Promise<boolean> => {
    try {
      const existingPlayer = await getPlayerByEmail(email);
      return !existingPlayer;
    } catch (error) {
      console.error('Error checking email availability:', error);
      return false;
    }
  };
  
  // Invite a player by creating a placeholder account
  const invitePlayer = async (name: string, email: string): Promise<Player | null> => {
    if (!name || !email) return null;

    // Check if email is already in use
    if (!await isEmailAvailable(email)) return null;

    const createdPlayer = await addPlayer({
      name,
      email,
    });

    return createdPlayer;
  };

  // Get all players invited by the current user
  const getInvitedPlayers = (): Player[] => {
    if (!currentUser) return [];
    return players.filter(player => player.invitedBy === currentUser.id);
  };

  // Claim an invitation - used when a new player registers from an invitation
  const claimInvitation = async (email: string, playerData: Partial<Player>): Promise<boolean> => {
    const invitedPlayer = players.find(p => p.email === email && p.pendingClaim);
    
    if (!invitedPlayer) return false;
    
    // Update the invited player with the provided data
    await updatePlayer(invitedPlayer.id, {
      ...playerData,
      pendingClaim: false,
    });
    
    return true;
  };

  // Get player name even if they've been deleted
  const getPlayerName = (playerId: string): string => {
    // First check active players
    const activePlayer = players.find(p => p.id === playerId);
    if (activePlayer) return activePlayer.name;
    
    // Then check deleted players
    const deletedPlayer = deletedPlayers.find(p => p.id === playerId);
    if (deletedPlayer) return `${deletedPlayer.name} (Removed)`;
    
    // If not found anywhere
    return 'Unknown Player';
  };

  // Remove a player from contacts
  const removePlayer = async (playerId: string): Promise<boolean> => {
    try {
      // Don't allow removing the current user
      if (currentUser && playerId === currentUser.id) {
        return false;
      }
      
      // Find the player to be removed
      const playerToRemove = players.find(player => player.id === playerId);
      if (!playerToRemove) {
        return false;
      }
      
      // Add the player to deletedPlayers array
      setDeletedPlayers(prev => [...prev, playerToRemove]);
      
      // Remove the player from the active players list
      setPlayers(prev => prev.filter(player => player.id !== playerId));
      
      // Return success
      return true;
    } catch (error) {
      console.error('Error removing player:', error);
      return false;
    }
  };

  // Add this function to insert dummy data
  const insertDummyData = async () => {
    try {
      const dummyPlayers: Player[] = [
        {
          id: 'player1',
          name: 'John Smith',
          email: 'john@example.com',
          phoneNumber: '555-123-4567',
          rating: 4.2,
          profilePic: 'https://randomuser.me/api/portraits/men/32.jpg',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          stats: {
            totalMatches: 15,
            wins: 10,
            losses: 5,
            winPercentage: 66.7,
            totalGames: 45,
            gameWins: 30,
            gameLosses: 15
          }
        },
        {
          id: 'player2',
          name: 'Sarah Johnson',
          email: 'sarah@example.com',
          phoneNumber: '555-987-6543',
          rating: 3.8,
          profilePic: 'https://randomuser.me/api/portraits/women/44.jpg',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          stats: {
            totalMatches: 12,
            wins: 7,
            losses: 5,
            winPercentage: 58.3,
            totalGames: 36,
            gameWins: 22,
            gameLosses: 14
          }
        },
        {
          id: 'player3',
          name: 'Mike Williams',
          email: 'mike@example.com',
          phoneNumber: '555-456-7890',
          rating: 4.5,
          profilePic: 'https://randomuser.me/api/portraits/men/67.jpg',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          stats: {
            totalMatches: 20,
            wins: 15,
            losses: 5,
            winPercentage: 75.0,
            totalGames: 60,
            gameWins: 45,
            gameLosses: 15
          }
        },
        {
          id: 'player4',
          name: 'Emily Davis',
          email: 'emily@example.com',
          phoneNumber: '555-789-0123',
          rating: 3.5,
          profilePic: 'https://randomuser.me/api/portraits/women/17.jpg',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          stats: {
            totalMatches: 8,
            wins: 3,
            losses: 5,
            winPercentage: 37.5,
            totalGames: 24,
            gameWins: 10,
            gameLosses: 14
          }
        },
        {
          id: 'player5',
          name: 'Alex Rodriguez',
          email: 'alex@example.com',
          phoneNumber: '555-321-6547',
          rating: 4.0,
          isInvited: true,
          invitedBy: 'player1',
          pendingClaim: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          profilePic: 'https://randomuser.me/api/portraits/men/92.jpg',
          stats: {
            totalMatches: 5,
            wins: 3,
            losses: 2,
            winPercentage: 60.0,
            totalGames: 15,
            gameWins: 9,
            gameLosses: 6
          }
        }
      ];

      // Create dummy matches
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayAfterTomorrow = new Date(today);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

      const now = Date.now();
      const dummyMatches: Match[] = [
        {
          id: 'match1',
          createdBy: 'player1',
          createdAt: now,
          lastModifiedAt: now,
          lastModifiedBy: 'player1',
          scheduledDate: twoDaysAgo.toISOString(),
          matchType: 'doubles',
          team1PlayerIds: ['player1', 'player2'],
          team2PlayerIds: ['player3', 'player4'],
          team1PlayerNames: ['John Smith', 'Sarah Johnson'],
          team2PlayerNames: ['Mike Williams', 'Emily Davis'],
          allPlayerIds: ['player1', 'player2', 'player3', 'player4'],
          location: 'Central Park Courts',
          status: 'completed',
          winnerTeam: 1,
          games: [{ team1Score: 11, team2Score: 7, winnerTeam: 1 }],
          pointsToWin: 11,
          numberOfGames: 1
        },
        {
          id: 'match2',
          createdBy: 'player1',
          createdAt: now,
          lastModifiedAt: now,
          lastModifiedBy: 'player1',
          scheduledDate: yesterday.toISOString(),
          matchType: 'singles',
          team1PlayerIds: ['player1'],
          team2PlayerIds: ['player3'],
          team1PlayerNames: ['John Smith'],
          team2PlayerNames: ['Mike Williams'],
          allPlayerIds: ['player1', 'player3'],
          location: 'Community Center',
          status: 'completed',
          winnerTeam: 2,
          games: [{ team1Score: 9, team2Score: 11, winnerTeam: 2 }],
          pointsToWin: 11,
          numberOfGames: 1
        },
        {
          id: 'match3',
          createdBy: 'player2',
          createdAt: now,
          lastModifiedAt: now,
          lastModifiedBy: 'player2',
          scheduledDate: threeDaysAgo.toISOString(),
          matchType: 'doubles',
          team1PlayerIds: ['player2', 'player4'],
          team2PlayerIds: ['player1', 'player5'],
          team1PlayerNames: ['Sarah Johnson', 'Emily Davis'],
          team2PlayerNames: ['John Smith', 'Alex Rodriguez'],
          allPlayerIds: ['player2', 'player4', 'player1', 'player5'],
          location: 'Riverside Courts',
          status: 'completed',
          winnerTeam: 2,
          games: [{ team1Score: 8, team2Score: 11, winnerTeam: 2 }],
          pointsToWin: 11,
          numberOfGames: 1
        },
        {
          id: 'match4',
          createdBy: 'player1',
          createdAt: now,
          lastModifiedAt: now,
          lastModifiedBy: 'player1',
          scheduledDate: today.toISOString(),
          matchType: 'doubles',
          team1PlayerIds: ['player1', 'player4'],
          team2PlayerIds: ['player2', 'player3'],
          team1PlayerNames: ['John Smith', 'Emily Davis'],
          team2PlayerNames: ['Sarah Johnson', 'Mike Williams'],
          allPlayerIds: ['player1', 'player2', 'player3', 'player4'],
          location: 'Downtown Recreation Center',
          status: 'scheduled',
          winnerTeam: null,
          games: [],
          pointsToWin: 11,
          numberOfGames: 3
        },
        {
          id: 'match5',
          createdBy: 'player1',
          createdAt: now,
          lastModifiedAt: now,
          lastModifiedBy: 'player1',
          scheduledDate: tomorrow.toISOString(),
          matchType: 'singles',
          team1PlayerIds: ['player1'],
          team2PlayerIds: ['player3'],
          team1PlayerNames: ['John Smith'],
          team2PlayerNames: ['Mike Williams'],
          allPlayerIds: ['player1', 'player3'],
          location: 'Tennis Club',
          status: 'scheduled',
          winnerTeam: null,
          games: [],
          pointsToWin: 11,
          numberOfGames: 3
        },
        {
          id: 'match6',
          createdBy: 'player2',
          createdAt: now,
          lastModifiedAt: now,
          lastModifiedBy: 'player2',
          scheduledDate: dayAfterTomorrow.toISOString(),
          matchType: 'doubles',
          team1PlayerIds: ['player2', 'player5'],
          team2PlayerIds: ['player3', 'player4'],
          team1PlayerNames: ['Sarah Johnson', 'Alex Rodriguez'],
          team2PlayerNames: ['Mike Williams', 'Emily Davis'],
          allPlayerIds: ['player2', 'player5', 'player3', 'player4'],
          location: 'Sports Complex',
          status: 'scheduled',
          winnerTeam: null,
          games: [],
          pointsToWin: 11,
          numberOfGames: 3
        }
      ];

      // Set the current user to the first player
      const currentUserData = dummyPlayers[0];

      // Save all the dummy data
      setPlayers(dummyPlayers);
      setMatches(dummyMatches);
      setCurrentUser(currentUserData);

      // Save to AsyncStorage
      await AsyncStorage.setItem('players', JSON.stringify(dummyPlayers));
      await AsyncStorage.setItem('matches', JSON.stringify(dummyMatches));
      await AsyncStorage.setItem('currentUser', JSON.stringify(currentUserData));

      return true;
    } catch (error) {
      console.error('Error inserting dummy data:', error);
      return false;
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const firebaseUser = await signInWithEmail(email, password);
      const playerDoc = await getPlayerDocument(firebaseUser.uid);
      if (playerDoc) {
        setCurrentUser(playerDoc);
        setPlayers(prev => {
          const filtered = prev.filter(p => p.id !== playerDoc.id);
          return [...filtered, playerDoc];
        });
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const signInWithSocial = async (provider: 'google' | 'apple'): Promise<{ needsName: boolean }> => {
    try {
      let firebaseUser;
      let socialDisplayName: string | null = null;

      if (provider === 'google') {
        firebaseUser = await signInWithGoogle();
        socialDisplayName = firebaseUser.displayName;
      } else {
        const result = await signInWithApple();
        firebaseUser = result.user;
        socialDisplayName = result.displayName || firebaseUser.displayName;
      }

      // Check if Player doc already exists (returning user)
      const existingPlayer = await getPlayerDocument(firebaseUser.uid);
      if (existingPlayer) {
        setCurrentUser(existingPlayer);
        setPlayers(prev => {
          const filtered = prev.filter(p => p.id !== existingPlayer.id);
          return [...filtered, existingPlayer];
        });
        return { needsName: false };
      }

      // New user — create Player doc
      const displayName = socialDisplayName || '';
      const needsName = !displayName.trim();

      if (!needsName) {
        const newPlayer: Player = {
          id: firebaseUser.uid,
          name: displayName,
          email: firebaseUser.email || undefined,
          profilePic: firebaseUser.photoURL || undefined,
          authProvider: provider,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          stats: {
            totalMatches: 0,
            wins: 0,
            losses: 0,
            winPercentage: 0,
            totalGames: 0,
            gameWins: 0,
            gameLosses: 0,
          },
        };

        await createPlayerDocument(newPlayer);
        setPlayers(prev => [...prev, newPlayer]);
        setCurrentUser(newPlayer);

        // Claim placeholder profile if email matches an invited player
        if (firebaseUser.email) {
          await claimPlaceholderProfile(firebaseUser.uid, displayName, firebaseUser.email);
        }
      }

      return { needsName };
    } catch (error: any) {
      if (error.cancelled) {
        throw error;
      }
      throw new Error(error.message);
    }
  };

  const completeSocialSignUp = async (name: string, provider: 'google' | 'apple') => {
    try {
      const firebaseUser = getCurrentUser();
      if (!firebaseUser) {
        throw new Error('No authenticated user found');
      }

      const newPlayer: Player = {
        id: firebaseUser.uid,
        name: name.trim(),
        email: firebaseUser.email || undefined,
        profilePic: firebaseUser.photoURL || undefined,
        authProvider: provider,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        stats: {
          totalMatches: 0,
          wins: 0,
          losses: 0,
          winPercentage: 0,
          totalGames: 0,
          gameWins: 0,
          gameLosses: 0,
        },
      };

      await createPlayerDocument(newPlayer);
      setPlayers(prev => [...prev, newPlayer]);
      setCurrentUser(newPlayer);

      if (firebaseUser.email) {
        await claimPlaceholderProfile(firebaseUser.uid, name.trim(), firebaseUser.email);
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const signOutUser = async () => {
    try {
      if (currentUser) {
        await removePushToken(currentUser.id);
      }
      await signOut();
      setCurrentUser(null);
      setNotifications([]);
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  // Load notifications for the current user (both received and sent)
  const loadNotifications = async (playerId: string) => {
    try {
      const [received, sent] = await Promise.all([
        getNotificationsForPlayer(playerId),
        getNotificationsBySender(playerId),
      ]);
      // Merge and deduplicate by id
      const merged = new Map<string, MatchNotification>();
      for (const n of [...received, ...sent]) {
        merged.set(n.id, n);
      }
      setNotifications(
        Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt)
      );
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  // Send notifications to all players in a match (except the creator)
  const sendMatchNotifications = async (match: Match): Promise<{ sent: number; failed: number }> => {
    if (!currentUser) return { sent: 0, failed: 0 };

    const recipientIds = match.allPlayerIds.filter(id => id !== currentUser.id);
    const newNotifications: MatchNotification[] = [];
    let failed = 0;

    for (const recipientId of recipientIds) {
      const team = match.team1PlayerIds.includes(recipientId) ? 1 : 2;
      const notification: MatchNotification = {
        id: `notif_${match.id}_${recipientId}`,
        type: 'match_invite',
        status: 'sent',
        recipientId,
        senderId: currentUser.id,
        senderName: currentUser.name,
        matchId: match.id,
        matchDate: match.scheduledDate,
        matchLocation: match.location,
        matchType: match.matchType,
        team: team as 1 | 2,
        createdAt: Date.now(),
      };

      try {
        await createNotificationDocument(notification);
        newNotifications.push(notification);
      } catch (error) {
        console.error(`Error sending notification to ${recipientId}:`, error);
        failed++;
      }
    }

    // Add sent notifications to local state so the creator sees them immediately
    if (newNotifications.length > 0) {
      setNotifications(prev =>
        [...newNotifications, ...prev].sort((a, b) => b.createdAt - a.createdAt)
      );
    }

    return { sent: newNotifications.length, failed };
  };

  // Mark a single notification as read
  const markNotificationRead = async (notificationId: string) => {
    const now = Date.now();
    try {
      await updateNotificationDocument(notificationId, { status: 'read', readAt: now });
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, status: 'read', readAt: now } : n)
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Mark all notifications as read
  const markAllNotificationsRead = async () => {
    const now = Date.now();
    const unread = notifications.filter(n => n.status !== 'read');
    const successIds = new Set<string>();

    for (const n of unread) {
      try {
        await updateNotificationDocument(n.id, { status: 'read', readAt: now });
        successIds.add(n.id);
      } catch (error) {
        console.error(`Error marking notification ${n.id} as read:`, error);
      }
    }

    if (successIds.size > 0) {
      setNotifications(prev =>
        prev.map(n => successIds.has(n.id) ? { ...n, status: 'read', readAt: now } : n)
      );
    }
  };

  // Get notifications for a specific match (used by match creator to see statuses)
  const getNotificationsForMatch = (matchId: string): MatchNotification[] => {
    return notifications.filter(n => n.matchId === matchId);
  };

  const unreadNotificationCount = notifications.filter(n => n.status !== 'read').length;

  // Context value with all the methods and data
  const contextValue: DataContextType = {
    players,
    matches,
    deletedPlayers,
    currentUser,
    notifications,
    unreadNotificationCount,
    addPlayer,
    removePlayer,
    addMatch,
    updateMatch,
    deleteMatch,
    updatePlayer,
    getPlayerName,
    setCurrentUser,
    resetAllData,
    invitePlayer,
    claimInvitation,
    getInvitedPlayers,
    isEmailAvailable,
    insertDummyData,
    signIn,
    signInWithSocial,
    completeSocialSignUp,
    signOutUser,
    sendMatchNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    getNotificationsForMatch,
  };

  return <DataContext.Provider value={contextValue}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}; 