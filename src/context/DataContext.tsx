import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Match, Player, DataContextType, PlayerStats } from '../types';
import { 
  signUpWithEmail, 
  signInWithEmail, 
  signOut, 
  onAuthStateChanged,
  createPlayerDocument,
  updatePlayerDocument,
  getPlayerDocument,
  getPlayerByEmail
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
        }
      } else {
        setCurrentUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const addMatch = async (matchData: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> => {
    const newMatch = {
      ...matchData,
      id: Date.now().toString(),
    };
    setMatches(prev => [...prev, newMatch]);
  };

  const updateMatch = async (matchId: string, updates: Partial<Match>): Promise<void> => {
    const matchToUpdate = matches.find(m => m.id === matchId);
    if (!matchToUpdate) return;

    const updatedMatch = { ...matchToUpdate, ...updates };
    
    setMatches(prev => prev.map(match => 
      match.id === matchId ? updatedMatch : match
    ));
    
    if (updates.status === 'completed' && updates.score) {
      const gameScores = parseGameScores(updates.score.toString());
      
      if (updates.winner) {
        const winnerIds = Array.isArray(updates.winner) 
          ? updates.winner 
          : typeof updates.winner === 'number'
            ? (updates.winner === 1 ? updatedMatch.teams?.team1 : updatedMatch.teams?.team2) || []
            : [updates.winner];
        
        // Update match stats for winners
        winnerIds.forEach(playerId => {
          const player = players.find(p => p.id === playerId);
          if (player) {
            const currentStats = player.stats || {
              totalMatches: 0,
              wins: 0,
              losses: 0,
              winPercentage: 0,
              totalGames: 0,
              gameWins: 0,
              gameLosses: 0
            };
            
            updatePlayer(playerId, {
              stats: {
                totalMatches: currentStats.totalMatches + 1,
                wins: currentStats.wins + 1,
                losses: currentStats.losses,
                winPercentage: ((currentStats.wins + 1) / (currentStats.totalMatches + 1)) * 100,
                totalGames: currentStats.totalGames,
                gameWins: currentStats.gameWins,
                gameLosses: currentStats.gameLosses
              }
            });
          }
        });
        
        const allPlayerIds = updatedMatch.teams
          ? [...updatedMatch.teams.team1, ...updatedMatch.teams.team2]
          : updatedMatch.players;
        
        // Update match stats for losers
        allPlayerIds
          .filter(id => !winnerIds.includes(id))
          .forEach(playerId => {
            const player = players.find(p => p.id === playerId);
            if (player) {
              const currentStats = player.stats || {
                totalMatches: 0,
                wins: 0,
                losses: 0,
                winPercentage: 0,
                totalGames: 0,
                gameWins: 0,
                gameLosses: 0
              };
              
              updatePlayer(playerId, {
                stats: {
                  totalMatches: currentStats.totalMatches + 1,
                  wins: currentStats.wins,
                  losses: currentStats.losses + 1,
                  winPercentage: (currentStats.wins / (currentStats.totalMatches + 1)) * 100,
                  totalGames: currentStats.totalGames,
                  gameWins: currentStats.gameWins,
                  gameLosses: currentStats.gameLosses
                }
              });
            }
          });
      }
    }
  };

  const updatePlayerGameStats = (playerId: string, isWin: boolean): void => {
    setPlayers(prev => prev.map(player => {
      if (player.id === playerId) {
        const currentStats = player.stats || {
          totalMatches: 0,
          wins: 0,
          losses: 0,
          winPercentage: 0,
          totalGames: 0,
          gameWins: 0,
          gameLosses: 0
        };
        
        const updatedStats: PlayerStats = {
          ...currentStats,
          totalGames: (currentStats.totalGames || 0) + 1,
          gameWins: (currentStats.gameWins || 0) + (isWin ? 1 : 0),
          gameLosses: (currentStats.gameLosses || 0) + (isWin ? 0 : 1)
        };
        
        // Update the current user if needed
        if (currentUser && currentUser.id === playerId) {
          setCurrentUser({
            ...currentUser,
            stats: updatedStats
          });
        }
        
        return {
          ...player,
          stats: updatedStats
        };
      }
      return player;
    }));
  };

  // Helper function to parse game scores
  const parseGameScores = (scoreString: string) => {
    if (!scoreString) return [];
    
    return scoreString.split(', ').map(gameScore => {
      const [team1Score, team2Score] = gameScore.split('-').map(Number);
      return { team1Score, team2Score };
    });
  };

  const addPlayer = async (playerData: Omit<Player, 'id' | 'createdAt' | 'updatedAt'>): Promise<void> => {
    try {
      // Create Firebase auth user
      const firebaseUser = await signUpWithEmail(playerData.email, playerData.password);
      
      // Create player in Firestore
      const newPlayer: Player = {
        ...playerData,
        id: firebaseUser.uid,
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
      setCurrentUser(newPlayer);
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const getUpcomingMatch = () => {
    const now = new Date();
    return matches
      .filter(match => match.status === 'scheduled' && new Date(match.date) > now)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] || null;
  };

  const getRecentMatches = (limit = 5) => {
    return matches
      .filter(match => match.status === 'completed')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
  };

  const getPlayerStats = (playerId: string) => {
    return players.find(player => player.id === playerId) || null;
  };

  const deleteMatch = async (matchId: string) => {
    setMatches(prev => prev.filter(match => match.id !== matchId));
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
      // Clear all data in AsyncStorage
      await AsyncStorage.removeItem('matches');
      await AsyncStorage.removeItem('players');
      await AsyncStorage.removeItem('deletedPlayers');
      await AsyncStorage.removeItem('currentUser');
      
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

    const newPlayer: Omit<Player, 'id' | 'createdAt' | 'updatedAt'> = {
      name,
      email,
      password: '', // This will be set when they claim their account
      stats: {
        totalMatches: 0,
        wins: 0,
        losses: 0,
        winPercentage: 0,
      }
    };

    await addPlayer(newPlayer);
    
    // Get the newly created player to return
    const createdPlayer = players.find(p => p.email === email);
    return createdPlayer || null;
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

      const dummyMatches: Match[] = [
        {
          id: 'match1',
          date: twoDaysAgo.toISOString(),
          players: ['player1', 'player2', 'player3', 'player4'],
          teams: {
            team1: ['player1', 'player2'],
            team2: ['player3', 'player4']
          },
          location: 'Central Park Courts',
          status: 'completed',
          winner: ['player1', 'player2'],
          score: {
            team1: 11,
            team2: 7
          },
          isDoubles: true,
          pointsToWin: 11,
          numberOfGames: 1
        },
        {
          id: 'match2',
          date: yesterday.toISOString(),
          players: ['player1', 'player3'],
          teams: {
            team1: ['player1'],
            team2: ['player3']
          },
          location: 'Community Center',
          status: 'completed',
          winner: ['player3'],
          score: {
            team1: 9,
            team2: 11
          },
          isDoubles: false,
          pointsToWin: 11,
          numberOfGames: 1
        },
        {
          id: 'match3',
          date: threeDaysAgo.toISOString(),
          players: ['player2', 'player4', 'player1', 'player5'],
          teams: {
            team1: ['player2', 'player4'],
            team2: ['player1', 'player5']
          },
          location: 'Riverside Courts',
          status: 'completed',
          winner: ['player1', 'player5'],
          score: {
            team1: 8,
            team2: 11
          },
          isDoubles: true,
          pointsToWin: 11,
          numberOfGames: 1
        },
        {
          id: 'match4',
          date: today.toISOString(),
          players: ['player1', 'player2', 'player3', 'player4'],
          teams: {
            team1: ['player1', 'player4'],
            team2: ['player2', 'player3']
          },
          location: 'Downtown Recreation Center',
          status: 'scheduled',
          isDoubles: true,
          pointsToWin: 11,
          numberOfGames: 3
        },
        {
          id: 'match5',
          date: tomorrow.toISOString(),
          players: ['player1', 'player3'],
          teams: {
            team1: ['player1'],
            team2: ['player3']
          },
          location: 'Tennis Club',
          status: 'scheduled',
          isDoubles: false,
          pointsToWin: 11,
          numberOfGames: 3
        },
        {
          id: 'match6',
          date: dayAfterTomorrow.toISOString(),
          players: ['player2', 'player5', 'player3', 'player4'],
          teams: {
            team1: ['player2', 'player5'],
            team2: ['player3', 'player4']
          },
          location: 'Sports Complex',
          status: 'scheduled',
          isDoubles: true,
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