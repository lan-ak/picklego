import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Match, Game, LegacyMatch, Player, PlayerStats, DataContextType, MatchNotification, InviteResult } from '../types';
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
  softDeleteMatch,
  getMatchesForPlayer,
  sendPasswordReset,
  signInWithGoogle,
  signInWithApple,
  getCurrentUser,
  createNotificationDocument,
  updateNotificationDocument,
  getNotificationsForPlayer,
  getNotificationsBySender,
  addConnectionsBatch,
  removeConnection,
  callClaimPlaceholderProfile,
  getPlaceholderByEmail,
} from '../config/firebase';
import { registerPushToken, unregisterPushToken } from '../services/pushNotifications';

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [deletedPlayers, setDeletedPlayers] = useState<Player[]>([]);
  const [currentUser, setCurrentUser] = useState<Player | null>(null);
  const [notifications, setNotifications] = useState<MatchNotification[]>([]);
  const [authLoading, setAuthLoading] = useState(true);

  // Reset all user-scoped state. Called from onAuthStateChanged when user signs out.
  // When adding new user-scoped state, add its reset here.
  const resetUserState = () => {
    setCurrentUser(null);
    setMatches([]);
    setPlayers([]);
    setDeletedPlayers([]);
    setNotifications([]);
  };

  // Keep a ref to players so the auth listener can access current state
  const playersRef = useRef<Player[]>([]);
  useEffect(() => { playersRef.current = players; }, [players]);

  // Load data from AsyncStorage on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const storedMatches = await AsyncStorage.getItem('matches');
        const storedPlayers = await AsyncStorage.getItem('players');
        const storedDeletedPlayers = await AsyncStorage.getItem('deletedPlayers');

        if (storedMatches) setMatches(JSON.parse(storedMatches));
        if (storedPlayers) setPlayers(JSON.parse(storedPlayers));
        if (storedDeletedPlayers) setDeletedPlayers(JSON.parse(storedDeletedPlayers));
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
      } catch (error) {
        console.error('Error saving data:', error);
      }
    };

    saveData();
  }, [matches, players, deletedPlayers]);

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
      Promise.all(
        expiredMatches.map(match =>
          updateMatchDocument(match.id, { status: 'expired' }).catch(error =>
            console.error('Error marking match as expired in Firestore:', error)
          )
        )
      );
    }
  }, [matches.length]);

  // Expire stale notifications
  useEffect(() => {
    if (notifications.length === 0) return;

    const now = Date.now();
    const matchStaleThreshold = 24 * 60 * 60 * 1000; // 24 hours
    const inviteStaleThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days

    const expiredIds = new Set<string>();
    for (const notif of notifications) {
      // Expire match notifications past their date + 24 hours
      if (notif.matchDate) {
        const matchTime = new Date(notif.matchDate).getTime();
        if (now - matchTime > matchStaleThreshold) {
          expiredIds.add(notif.id);
        }
      }
      // Expire resolved player invite notifications after 7 days
      if (
        (notif.type === 'player_invite' || notif.type === 'invite_accepted') &&
        notif.status !== 'sent' &&
        now - notif.createdAt > inviteStaleThreshold
      ) {
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
  //
  // The actual claiming (match updates, stats merge, placeholder deletion)
  // runs in a Cloud Function using Admin SDK to bypass security rules,
  // since the new user's UID isn't in the match allPlayerIds yet.
  const claimPlaceholderProfile = async (
    realUid: string,
    realName: string,
    email: string,
  ) => {
    try {
      const result = await callClaimPlaceholderProfile(realName);

      if (!result.claimed) {
        return; // no placeholder found for this email
      }

      // Refresh matches — they now contain the real UID so the read succeeds
      const firestoreMatches = await getMatchesForPlayer(realUid);
      const visibleMatches = firestoreMatches.filter(
        m => !m.deletedByPlayerIds?.includes(realUid),
      );
      setMatches(prev => {
        const firestoreIds = new Set(visibleMatches.map(m => m.id));
        const localOnly = prev.filter(m => !firestoreIds.has(m.id));
        return [...visibleMatches, ...localOnly];
      });

      // Refresh the player document (stats may have been merged server-side)
      const updatedPlayer = await getPlayerDocument(realUid);
      if (updatedPlayer) {
        setCurrentUser(updatedPlayer);
        setPlayers(prev => prev.map(p => (p.id === realUid ? updatedPlayer : p)));
      }

      // Remove the now-deleted placeholder from local state
      const normalizedEmail = email.trim().toLowerCase();
      setPlayers(prev =>
        prev.filter(
          p =>
            !(
              p.pendingClaim === true &&
              p.id !== realUid &&
              p.email?.trim().toLowerCase() === normalizedEmail
            ),
        ),
      );

      console.log(
        `Claimed placeholder profile for user ${realUid} (${result.matchesUpdated} matches updated)`,
      );
    } catch (error) {
      console.error('Error claiming placeholder profile:', error);
    }
  };

  // Refresh matches from Firestore for the current user
  const refreshMatches = async () => {
    if (!currentUser) return;
    try {
      const firestoreMatches = await getMatchesForPlayer(currentUser.id);
      const visibleMatches = firestoreMatches.filter(
        m => !m.deletedByPlayerIds?.includes(currentUser.id)
      );
      setMatches(prev => {
        const firestoreIds = new Set(visibleMatches.map(m => m.id));
        const localOnly = prev.filter(m => !firestoreIds.has(m.id));
        return [...visibleMatches, ...localOnly];
      });
    } catch (error) {
      console.error('Error refreshing matches:', error);
    }
  };

  // Refresh notifications from Firestore for the current user
  const refreshNotifications = async () => {
    if (!currentUser) return;
    await loadNotifications(currentUser.id);
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
            // Filter out matches soft-deleted by this user
            const visibleMatches = firestoreMatches.filter(
              m => !m.deletedByPlayerIds?.includes(firebaseUser.uid)
            );
            if (visibleMatches.length > 0) {
              setMatches(prev => {
                // Merge: Firestore matches take precedence, keep local-only matches
                const firestoreIds = new Set(visibleMatches.map(m => m.id));
                const localOnly = prev.filter(m => !firestoreIds.has(m.id));
                return [...visibleMatches, ...localOnly];
              });
            }
          } catch (error) {
            console.error('Error loading matches from Firestore:', error);
          }

          // Migrate legacy AsyncStorage matches to Firestore
          await migrateLocalMatchesToFirestore(firebaseUser.uid);

          // Load connected player docs if not already in local state
          if (playerDoc.connections && playerDoc.connections.length > 0) {
            const existingIds = new Set(playersRef.current.map(p => p.id));
            const missingIds = playerDoc.connections.filter((id: string) => !existingIds.has(id));
            if (missingIds.length > 0) {
              const connectedDocs = await Promise.all(
                missingIds.map((id: string) => getPlayerDocument(id))
              );
              const validPlayers = connectedDocs.filter((d): d is Player => d !== null);
              if (validPlayers.length > 0) {
                setPlayers(prev => {
                  const currentIds = new Set(prev.map(p => p.id));
                  const newPlayers = validPlayers.filter(p => !currentIds.has(p.id));
                  return newPlayers.length > 0 ? [...prev, ...newPlayers] : prev;
                });
              }
            }
          }

          // Load notifications for this user
          await loadNotifications(firebaseUser.uid);

          // Register for push notifications
          await registerPushToken(firebaseUser.uid);
        }
      } else {
        resetUserState();
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Claim placeholder profile after auth is fully loaded.
  // Runs in a separate effect so auth.currentUser is guaranteed to be set
  // (avoids the race condition inside onAuthStateChanged where the token
  // may not yet be available for Cloud Function calls).
  const claimAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authLoading && currentUser?.email && claimAttemptedRef.current !== currentUser.id) {
      claimAttemptedRef.current = currentUser.id;

      // Check if a placeholder actually exists before calling the Cloud Function.
      // This avoids unnecessary callable invocations (and auth token issues) on every login.
      const checkAndClaim = async () => {
        try {
          const placeholder = await getPlaceholderByEmail(currentUser.email!);
          if (placeholder && placeholder.id !== currentUser.id) {
            await claimPlaceholderProfile(currentUser.id, currentUser.name, currentUser.email!);
          }
        } catch (error) {
          console.error('Error checking for placeholder:', error);
        }
      };
      checkAndClaim();
    }
  }, [authLoading, currentUser?.id, currentUser?.email]);

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
          // Already in new schema — update ownership to current user before pushing to Firestore
          const match = raw as Match;
          match.createdBy = currentUserId;
          match.lastModifiedBy = currentUserId;
          match.lastModifiedAt = Date.now();
          if (!match.allPlayerIds.includes(currentUserId)) {
            match.allPlayerIds = [...match.allPlayerIds, currentUserId];
          }
          migratedMatches.push(match);
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
      let isPlaceholder = false;

      if (playerData.email && playerData.password) {
        // Create Firebase auth user for players with credentials
        const firebaseUser = await signUpWithEmail(playerData.email, playerData.password);
        playerId = firebaseUser.uid;
      } else {
        // Generate a local ID for invited/placeholder players
        playerId = Date.now().toString();
        isPlaceholder = true;
      }

      const newPlayer: Player = {
        ...playerData,
        id: playerId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...(!isPlaceholder ? { authProvider: 'email' as const } : {}),
        ...(isPlaceholder && currentUser ? {
          pendingClaim: true,
          invitedBy: currentUser.id,
          isInvited: true,
        } : {}),
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
    if (!currentUser) return;

    const matchToDelete = matches.find(m => m.id === matchId);

    // Optimistically remove from local state
    setMatches(prev => prev.filter(match => match.id !== matchId));

    // Soft-delete in Firestore (add current user to deletedByPlayerIds)
    try {
      await softDeleteMatch(matchId, currentUser.id);
    } catch (error) {
      console.error('Error soft-deleting match from Firestore:', error);
      // Restore on failure
      if (matchToDelete) {
        setMatches(prev => [...prev, matchToDelete]);
      }
      return;
    }

    // Recalculate stats only for the current user
    if (matchToDelete && matchToDelete.status === 'completed') {
      const remainingMatches = matches.filter(m => m.id !== matchId);
      await recalculateStatsForPlayers([currentUser.id], remainingMatches);
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
  
  // Invite a player by creating a placeholder account, or send a player invite if they already exist
  const invitePlayer = async (name: string, email: string): Promise<InviteResult> => {
    if (!name || !email) return { type: 'error' };

    // Check if email is already in use
    const emailAvailable = await isEmailAvailable(email);

    if (!emailAvailable) {
      // Email exists — look up the existing player and return them for team assignment
      try {
        const existingPlayer = await getPlayerByEmail(email);
        if (!existingPlayer || !currentUser) return { type: 'error' };

        // Don't invite yourself
        if (existingPlayer.id === currentUser.id) return { type: 'error' };

        // Send a connection invite if not already connected and no pending invite
        if (!currentUser.connections?.includes(existingPlayer.id)) {
          const existingRequest = notifications.find(n =>
            n.type === 'player_invite' &&
            n.status === 'sent' &&
            ((n.senderId === currentUser.id && n.recipientId === existingPlayer.id) ||
             (n.senderId === existingPlayer.id && n.recipientId === currentUser.id))
          );
          if (!existingRequest) {
            await sendPlayerInvite(existingPlayer.id);
          }
        }

        // Ensure the existing player is in local state for name resolution
        if (!players.some(p => p.id === existingPlayer.id)) {
          setPlayers(prev => [...prev, existingPlayer]);
        }

        // Return the player so they can be added to the match team
        return { type: 'existing_player', player: existingPlayer };
      } catch (error) {
        console.error('Error handling existing player invite:', error);
        return { type: 'error' };
      }
    }

    // Email is available — create a placeholder (existing behavior)
    try {
      const createdPlayer = await addPlayer({ name, email });
      return { type: 'invited', player: createdPlayer };
    } catch (error) {
      console.error('Error creating placeholder player:', error);
      return { type: 'error' };
    }
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

  // Remove a player from contacts (also breaks connection if applicable)
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

      // If the player is a connection, break the bidirectional Firestore connection
      if (currentUser?.connections?.includes(playerId)) {
        await removeConnection(currentUser.id, playerId);
        await removeConnection(playerId, currentUser.id);
        setCurrentUser(prev => prev ? {
          ...prev,
          connections: (prev.connections || []).filter((id: string) => id !== playerId),
        } : prev);
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

  const signIn = async (email: string, password: string) => {
    try {
      // onAuthStateChanged listener handles loading the player doc,
      // matches, connections, notifications, and push token registration.
      await signInWithEmail(email, password);
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
    } catch (error: any) {
      throw new Error(error.message);
    }
  };

  const signOutUser = async () => {
    try {
      if (currentUser) {
        await unregisterPushToken(currentUser.id);
      }
      await signOut();
      // State cleanup handled by onAuthStateChanged -> resetUserState()
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

  // Mark all notifications as read (skip player_invite — those need explicit accept/decline)
  const markAllNotificationsRead = async () => {
    const now = Date.now();
    const toMark = notifications.filter(
      n => n.status === 'sent'
        && n.recipientId === currentUser?.id
        && n.type !== 'player_invite'
    );
    const successIds = new Set<string>();

    for (const n of toMark) {
      try {
        await updateNotificationDocument(n.id, { status: 'read', readAt: now });
        successIds.add(n.id);
      } catch (error) {
        console.error(`Error marking notification ${n.id} as read:`, error);
      }
    }

    if (successIds.size > 0) {
      setNotifications(prev =>
        prev.map(n => successIds.has(n.id) ? { ...n, status: 'read' as const, readAt: now } : n)
      );
    }
  };

  // Get notifications for a specific match (used by match creator to see statuses)
  const getNotificationsForMatch = (matchId: string): MatchNotification[] => {
    return notifications.filter(n => n.matchId === matchId);
  };

  // Send a player_invite notification to an existing user
  const sendPlayerInvite = async (recipientId: string): Promise<boolean> => {
    if (!currentUser) return false;
    if (recipientId === currentUser.id) return false;
    if (currentUser.connections?.includes(recipientId)) return false;

    // Check for existing pending invite in either direction
    const existingRequest = notifications.find(n =>
      n.type === 'player_invite' &&
      n.status === 'sent' &&
      ((n.senderId === currentUser.id && n.recipientId === recipientId) ||
       (n.senderId === recipientId && n.recipientId === currentUser.id))
    );
    if (existingRequest) return false;

    const notification: MatchNotification = {
      id: `player_invite_${currentUser.id}_${recipientId}`,
      type: 'player_invite',
      status: 'sent',
      recipientId,
      senderId: currentUser.id,
      senderName: currentUser.name,
      senderProfilePic: currentUser.profilePic,
      message: `${currentUser.name} wants to add you as a player on PickleGo!`,
      createdAt: Date.now(),
    };

    try {
      await createNotificationDocument(notification);
      setNotifications(prev =>
        [notification, ...prev].sort((a, b) => b.createdAt - a.createdAt)
      );
      return true;
    } catch (error) {
      console.error('Error sending player invite:', error);
      return false;
    }
  };

  // Respond to a player invite: accept adds both as connections, decline updates status
  const respondToPlayerInvite = async (notificationId: string, accept: boolean): Promise<void> => {
    if (!currentUser) return;

    const notification = notifications.find(n => n.id === notificationId);
    if (!notification || notification.type !== 'player_invite') return;

    const now = Date.now();

    if (accept) {
      const senderId = notification.senderId;

      // Add each other as connections atomically
      await addConnectionsBatch(currentUser.id, senderId);

      // Update the player invite notification to accepted
      await updateNotificationDocument(notificationId, {
        status: 'accepted',
        respondedAt: now,
      });

      // Create an invite_accepted notification for the sender
      const acceptNotification: MatchNotification = {
        id: `invite_accepted_${currentUser.id}_${senderId}_${now}`,
        type: 'invite_accepted',
        status: 'sent',
        recipientId: senderId,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderProfilePic: currentUser.profilePic,
        message: `${currentUser.name} accepted your player invite!`,
        createdAt: now,
      };
      await createNotificationDocument(acceptNotification);

      // Update local notification state
      setNotifications(prev =>
        [acceptNotification, ...prev.map(n =>
          n.id === notificationId ? { ...n, status: 'accepted' as const, respondedAt: now } : n
        )].sort((a, b) => b.createdAt - a.createdAt)
      );

      // Update local player connections arrays
      setCurrentUser(prev => prev ? {
        ...prev,
        connections: [...(prev.connections || []), senderId],
      } : prev);

      setPlayers(prev => prev.map(p => {
        if (p.id === currentUser.id) return { ...p, connections: [...(p.connections || []), senderId] };
        if (p.id === senderId) return { ...p, connections: [...(p.connections || []), currentUser.id] };
        return p;
      }));

      // Ensure the sender's player doc is in local state
      const senderInLocal = players.find(p => p.id === senderId);
      if (!senderInLocal) {
        const senderDoc = await getPlayerDocument(senderId);
        if (senderDoc) {
          setPlayers(prev => [...prev, senderDoc]);
        }
      }
    } else {
      // Decline: just update the notification status
      await updateNotificationDocument(notificationId, {
        status: 'declined',
        respondedAt: now,
      });

      setNotifications(prev =>
        prev.map(n =>
          n.id === notificationId ? { ...n, status: 'declined' as const, respondedAt: now } : n
        )
      );
    }
  };

  // Only count notifications where the current user is the recipient and status is 'sent'
  const unreadNotificationCount = notifications.filter(
    n => n.status === 'sent' && n.recipientId === currentUser?.id
  ).length;

  // Context value with all the methods and data
  const contextValue: DataContextType = {
    players,
    matches,
    deletedPlayers,
    currentUser,
    authLoading,
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
    invitePlayer,
    claimInvitation,
    getInvitedPlayers,
    isEmailAvailable,
    signIn,
    signInWithSocial,
    completeSocialSignUp,
    signOutUser,
    sendMatchNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    getNotificationsForMatch,
    sendPlayerInvite,
    respondToPlayerInvite,
    refreshMatches,
    refreshNotifications,
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