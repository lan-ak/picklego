import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Match, Player, DataContextType } from '../types';

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

  const addMatch = async (matchData: Omit<Match, 'id'>) => {
    const newMatch = {
      ...matchData,
      id: Date.now().toString(),
    };
    setMatches(prev => [...prev, newMatch]);
    return newMatch;
  };

  const updateMatch = async (matchId: string, updates: Partial<Match>): Promise<void> => {
    // Find the match to update
    const matchToUpdate = matches.find(m => m.id === matchId);
    if (!matchToUpdate) return;

    // Create updated match object
    const updatedMatch = { ...matchToUpdate, ...updates };
    
    // Update matches state
    setMatches(prev => prev.map(match => 
      match.id === matchId ? updatedMatch : match
    ));
    
    // If match is being completed, update player stats
    if (updates.status === 'completed' && updates.score) {
      // Parse game scores
      const gameScores = parseGameScores(updates.score.toString());
      
      // Update match winner stats
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
            const currentStats = { ...player.stats };
            updatePlayer(playerId, {
              stats: {
                ...currentStats,
                wins: (currentStats.wins || 0) + 1,
                totalMatches: (currentStats.totalMatches || 0) + 1,
                winPercentage: ((currentStats.wins + 1) / (currentStats.totalMatches + 1)) * 100
              }
            });
          }
        });
        
        // Get all player IDs involved in the match
        const allPlayerIds = updatedMatch.teams
          ? [...updatedMatch.teams.team1, ...updatedMatch.teams.team2]
          : updatedMatch.players;
        
        // Update match stats for losers
        allPlayerIds
          .filter(id => !winnerIds.includes(id))
          .forEach(playerId => {
            const player = players.find(p => p.id === playerId);
            if (player) {
              const currentStats = { ...player.stats };
              updatePlayer(playerId, {
                stats: {
                  ...currentStats,
                  losses: (currentStats.losses || 0) + 1,
                  totalMatches: (currentStats.totalMatches || 0) + 1,
                  winPercentage: (currentStats.wins / (currentStats.totalMatches + 1)) * 100
                }
              });
            }
          });
        
        // Update game stats for all players
        if (updatedMatch.teams) {
          // For matches with teams property (new format)
          [...updatedMatch.teams.team1, ...updatedMatch.teams.team2].forEach(playerId => {
            const isTeam1 = updatedMatch.teams?.team1.includes(playerId);
            
            // Count game wins and losses
            let gameWins = 0;
            let gameLosses = 0;
            
            gameScores.forEach(game => {
              const team1Won = game.team1Score > game.team2Score;
              if ((isTeam1 && team1Won) || (!isTeam1 && !team1Won)) {
                gameWins++;
              } else {
                gameLosses++;
              }
            });
            
            // Update player game stats
            for (let i = 0; i < gameWins; i++) {
              updatePlayerGameStats(playerId, true);
            }
            
            for (let i = 0; i < gameLosses; i++) {
              updatePlayerGameStats(playerId, false);
            }
          });
        } else {
          // For matches without teams property (old format)
          updatedMatch.players.forEach(playerId => {
            const playerIndex = updatedMatch.players.indexOf(playerId);
            const isTeam1 = !updatedMatch.isDoubles 
              ? playerIndex === 0 
              : playerIndex < Math.floor(updatedMatch.players.length / 2);
            
            const playerTeam = isTeam1 ? 'team1' : 'team2';
            const opponentTeam = isTeam1 ? 'team2' : 'team1';
            
            // Count game wins and losses
            let gameWins = 0;
            let gameLosses = 0;
            
            gameScores.forEach(game => {
              const team1Won = game.team1Score > game.team2Score;
              if ((isTeam1 && team1Won) || (!isTeam1 && !team1Won)) {
                gameWins++;
              } else {
                gameLosses++;
              }
            });
            
            // Update player game stats
            for (let i = 0; i < gameWins; i++) {
              updatePlayerGameStats(playerId, true);
            }
            
            for (let i = 0; i < gameLosses; i++) {
              updatePlayerGameStats(playerId, false);
            }
          });
        }
      }
    }
  };

  // Add this function to update player game stats
  const updatePlayerGameStats = (playerId: string, isWin: boolean): void => {
    setPlayers(prev => prev.map(player => {
      if (player.id === playerId) {
        const updatedStats = { ...player.stats };
        
        // Update game stats
        updatedStats.gameWins = (updatedStats.gameWins || 0) + (isWin ? 1 : 0);
        updatedStats.gameLosses = (updatedStats.gameLosses || 0) + (isWin ? 0 : 1);
        updatedStats.totalGames = (updatedStats.totalGames || 0) + 1;
        
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

  const addPlayer = async (playerData: Omit<Player, 'id' | 'stats'>) => {
    const newPlayer = {
      ...playerData,
      id: Date.now().toString(),
      stats: {
        totalMatches: 0,
        wins: 0,
        losses: 0,
        winPercentage: 0,
      },
    };
    setPlayers(prev => [...prev, newPlayer]);
    
    // Set as current user if it's the first player
    if (players.length === 0) {
      setCurrentUser(newPlayer);
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

  const updatePlayer = async (playerId: string, updates: Partial<Player>) => {
    setPlayers(prev => prev.map(player => {
      if (player.id === playerId) {
        const updatedPlayer = { ...player, ...updates };
        // If updating the current user, also update currentUser state
        if (currentUser && currentUser.id === playerId) {
          setCurrentUser(updatedPlayer);
        }
        return updatedPlayer;
      }
      return player;
    }));
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
    const normalizedEmail = email.trim().toLowerCase();
    return !players.some(player => 
      player.email?.toLowerCase() === normalizedEmail
    );
  };
  
  // Check if username is available (not already used)
  const isUsernameAvailable = async (username: string): Promise<boolean> => {
    const normalizedUsername = username.trim().toLowerCase();
    return !players.some(player => 
      player.username?.toLowerCase() === normalizedUsername
    );
  };

  // Invite a player by creating a placeholder account
  const invitePlayer = async (name: string, email: string): Promise<Player | null> => {
    if (!name || !email) return null;

    // Check if email is already in use
    if (!await isEmailAvailable(email)) return null;

    const newPlayer: Omit<Player, 'id' | 'stats'> = {
      name,
      email,
      isInvited: true,
      invitedBy: currentUser?.id,
      pendingClaim: true,
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
      // Create dummy players
      const dummyPlayers: Player[] = [
        {
          id: 'player1',
          name: 'John Smith',
          email: 'john@example.com',
          phoneNumber: '555-123-4567',
          rating: 4.2,
          profilePic: 'https://randomuser.me/api/portraits/men/32.jpg',
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

  // Context value with all the methods and data
  const contextValue: DataContextType = {
    matches,
    players,
    deletedPlayers,
    currentUser,
    addMatch,
    updateMatch,
    addPlayer,
    removePlayer,
    getPlayerName,
    setCurrentUser,
    deleteMatch,
    updatePlayer,
    resetAllData,
    invitePlayer,
    claimInvitation,
    getInvitedPlayers,
    isEmailAvailable,
    isUsernameAvailable,
    insertDummyData,
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