import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Match, Player, DataContextType } from '../types';
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
  getMatchesForPlayer,
  sendPasswordReset
} from '../config/firebase';

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [deletedPlayers, setDeletedPlayers] = useState<Player[]>([]);
  const [currentUser, setCurrentUser] = useState<Player | null>(null);

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
        }
      } else {
        setCurrentUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

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
    setMatches(prev => prev.filter(match => match.id !== matchId));

    // Delete from Firestore
    try {
      await deleteMatchDocument(matchId);
    } catch (error) {
      console.error('Error deleting match from Firestore:', error);
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
          password: 'dummy-password',
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
          password: 'dummy-password',
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
          password: 'dummy-password',
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
          password: 'dummy-password',
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
          password: 'dummy-password',
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

  const signOutUser = async () => {
    try {
      await signOut();
      setCurrentUser(null);
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  // Context value with all the methods and data
  const contextValue: DataContextType = {
        players,
    matches,
    deletedPlayers,
    currentUser,
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
    signOutUser
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