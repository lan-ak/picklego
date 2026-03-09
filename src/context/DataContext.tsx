import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Match, Game, LegacyMatch, Player, PlayerStats, DataContextType, MatchNotification, InviteResult, NotificationPreferences } from '../types';
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
  getNotificationsForPlayer,
  getNotificationsBySender,
  removeConnection,
  addConnectionsBatch,
  callClaimPlaceholderProfile,
  callCreateSMSInvite,
  callClaimSMSInvite,
  callLookupPhoneNumbers,
  callDeleteAccount,
  createNotificationDocument,
  updateNotificationDocument,
  deleteNotificationDocument,
  getPlaceholderByEmail,
} from '../config/firebase';
import { registerPushToken, unregisterPushToken } from '../services/pushNotifications';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [deletedPlayers, setDeletedPlayers] = useState<Player[]>([]);
  const [currentUser, setCurrentUser] = useState<Player | null>(null);
  const [notifications, setNotifications] = useState<MatchNotification[]>([]);
  const [authLoading, setAuthLoading] = useState(true);

  // Onboarding status
  const { hasCompletedOnboarding, completeOnboarding } = useOnboardingStatus(currentUser?.id);

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

  // Refresh connected players from Firestore, load missing docs, and prune stale placeholders
  const refreshConnectedPlayers = async () => {
    if (!currentUser) return;
    try {
      const freshUserDoc = await getPlayerDocument(currentUser.id);
      if (!freshUserDoc) return;

      setCurrentUser(freshUserDoc);
      setPlayers(prev => prev.map(p => p.id === freshUserDoc.id ? freshUserDoc : p));

      const connectionIds = freshUserDoc.connections || [];
      if (connectionIds.length === 0) return;

      // Load any connected player docs not already in local state
      const existingIds = new Set(playersRef.current.map(p => p.id));
      const missingIds = connectionIds.filter((id: string) => !existingIds.has(id));
      let newConnectedPlayers: Player[] = [];

      if (missingIds.length > 0) {
        const docs = await Promise.all(
          missingIds.map((id: string) => getPlayerDocument(id))
        );
        newConnectedPlayers = docs.filter((d): d is Player => d !== null);
      }

      // Build email set of real connected players to prune stale placeholders
      const allConnected = [
        ...playersRef.current.filter(p => connectionIds.includes(p.id)),
        ...newConnectedPlayers,
      ];
      const connectedEmails = new Set(
        allConnected
          .filter(p => p.email && !p.pendingClaim)
          .map(p => p.email!.trim().toLowerCase())
      );

      setPlayers(prev => {
        let updated = prev.filter(p => {
          if (!p.pendingClaim) return true;
          if (!p.email) return true;
          return !connectedEmails.has(p.email.trim().toLowerCase());
        });

        if (newConnectedPlayers.length > 0) {
          const currentIds = new Set(updated.map(p => p.id));
          const toAdd = newConnectedPlayers.filter(p => !currentIds.has(p.id));
          if (toAdd.length > 0) {
            updated = [...updated, ...toAdd];
          }
        }

        return updated;
      });
    } catch (error) {
      console.error('Error refreshing connected players:', error);
    }
  };

  // Initialize Firebase auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (firebaseUser) => {
      try {
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
            try {
              if (playerDoc.connections && playerDoc.connections.length > 0) {
                const existingIds = new Set(playersRef.current.map(p => p.id));
                const missingIds = playerDoc.connections.filter((id: string) => !existingIds.has(id));
                if (missingIds.length > 0) {
                  const connectedDocs = await Promise.all(
                    missingIds.map((id: string) => getPlayerDocument(id))
                  );
                  const validPlayers = connectedDocs.filter((d): d is Player => d !== null);
                  if (validPlayers.length > 0) {
                    // Build email set of real connected players to prune stale placeholders
                    const allConnected = [
                      ...playersRef.current.filter(p => playerDoc.connections!.includes(p.id)),
                      ...validPlayers,
                    ];
                    const connectedEmails = new Set(
                      allConnected
                        .filter(p => p.email && !p.pendingClaim)
                        .map(p => p.email!.trim().toLowerCase())
                    );

                    setPlayers(prev => {
                      // Remove stale placeholders whose email matches a real connected player
                      let updated = prev.filter(p => {
                        if (!p.pendingClaim) return true;
                        if (!p.email) return true;
                        return !connectedEmails.has(p.email.trim().toLowerCase());
                      });
                      // Add newly loaded connected players
                      const currentIds = new Set(updated.map(p => p.id));
                      const newPlayers = validPlayers.filter(p => !currentIds.has(p.id));
                      return newPlayers.length > 0 ? [...updated, ...newPlayers] : updated;
                    });
                  }
                }
              }
            } catch (error) {
              console.error('Error loading connected players:', error);
            }

            // Load notifications for this user
            await loadNotifications(firebaseUser.uid);

            // Register for push notifications (skip if user hasn't completed onboarding yet)
            try {
              const onboardingDone = await AsyncStorage.getItem(`@picklego_onboarding_complete_${firebaseUser.uid}`);
              if (onboardingDone === 'true') {
                await registerPushToken(firebaseUser.uid);
              }
            } catch (error) {
              console.error('Error registering push token:', error);
            }
          }
        } else {
          resetUserState();
        }
      } catch (error) {
        console.error('Error during auth state initialization:', error);
        resetUserState();
      } finally {
        setAuthLoading(false);
      }
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

  // Claim pending SMS invite after auth is fully loaded
  const smsClaimAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authLoading && currentUser && smsClaimAttemptedRef.current !== currentUser.id) {
      smsClaimAttemptedRef.current = currentUser.id;
      claimPendingSMSInvite();
    }
  }, [authLoading, currentUser?.id]);

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

    const updatedMatches = matches.map(match =>
      match.id === matchId ? updatedMatch : match
    );
    setMatches(updatedMatches);

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
      recalculateStatsForPlayers(updatedMatch.allPlayerIds, updatedMatches);
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
        ...(isPlaceholder && currentUser && playerData.email ? {
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

    const isScheduled = matchToDelete?.status === 'scheduled';

    try {
      if (isScheduled) {
        // Hard-delete scheduled matches for everyone
        await deleteMatchDocument(matchId);
      } else {
        // Soft-delete completed matches (only hide for current user)
        await softDeleteMatch(matchId, currentUser.id);
      }
    } catch (error) {
      console.error('Error deleting match from Firestore:', error);
      // Restore on failure
      if (matchToDelete) {
        setMatches(prev => [...prev, matchToDelete]);
      }
      return;
    }

    // Recalculate stats only for completed matches
    if (matchToDelete && matchToDelete.status === 'completed') {
      const remainingMatches = matches.filter(m => m.id !== matchId);
      recalculateStatsForPlayers([currentUser.id], remainingMatches);
    }

    // Send match_cancelled notifications only for upcoming matches (not completed ones)
    if (matchToDelete && matchToDelete.status === 'scheduled') {
      const now = Date.now();
      const dateStr = new Date(matchToDelete.scheduledDate).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      });
      const matchTypeLabel = matchToDelete.matchType === 'doubles' ? 'doubles' : 'singles';

      for (const recipientId of matchToDelete.allPlayerIds) {
        if (recipientId === currentUser.id) continue;
        try {
          if (!(await isNotificationEnabled(recipientId, 'match_cancelled'))) continue;

          const notifId = `notif_cancelled_${matchId}_${recipientId}_${now}`;
          const notification: MatchNotification = {
            id: notifId,
            type: 'match_cancelled',
            status: 'sent',
            recipientId,
            senderId: currentUser.id,
            senderName: currentUser.name,
            senderProfilePic: currentUser.profilePic,
            matchId: matchToDelete.id,
            matchDate: matchToDelete.scheduledDate,
            matchLocation: matchToDelete.location,
            matchType: matchToDelete.matchType,
            message: `${currentUser.name} cancelled the ${matchTypeLabel} match on ${dateStr}`,
            createdAt: now,
          };
          await createNotificationDocument(notification);
        } catch (error) {
          console.error(`Error sending match_cancelled notification to ${recipientId}:`, error);
        }
      }
    }

    // Clean up orphaned notifications for this match where current user is recipient
    const orphanedNotifs = notifications.filter(
      n => n.matchId === matchId && n.recipientId === currentUser.id
    );
    if (orphanedNotifs.length > 0) {
      for (const n of orphanedNotifs) {
        try {
          await deleteNotificationDocument(n.id);
        } catch (error) {
          console.error(`Error cleaning up notification ${n.id}:`, error);
        }
      }
      setNotifications(prev => prev.filter(n => !(n.matchId === matchId && n.recipientId === currentUser.id)));
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

  const recalculateStatsForPlayers = (playerIds: string[], currentMatches: Match[]) => {
    // Optimistic local-only update. Firestore persistence is handled by the
    // recalculateStatsOnMatchUpdate Cloud Function triggered by match writes.
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

        // Send a connection invite if not already connected (sendPlayerInvite handles duplicate check)
        if (!currentUser.connections?.includes(existingPlayer.id)) {
          await sendPlayerInvite(existingPlayer.id);
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
    return players.filter(player => player.invitedBy === currentUser.id && player.email);
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

  const deleteAccount = async () => {
    try {
      if (currentUser) {
        await unregisterPushToken(currentUser.id);
      }
      await callDeleteAccount();
      await AsyncStorage.multiRemove(['matches', 'players', 'deletedPlayers']);
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

  // Check if a recipient has opted out of a specific notification type
  const isNotificationEnabled = async (recipientId: string, type: MatchNotification['type']): Promise<boolean> => {
    const localPlayer = players.find(p => p.id === recipientId);
    const prefs = localPlayer?.notificationPreferences
      ?? (await getPlayerDocument(recipientId))?.notificationPreferences;
    // Default to enabled if no preferences are set
    return prefs?.[type] ?? true;
  };

  // Send notifications to all players in a match (except the creator)
  const sendMatchNotifications = async (match: Match): Promise<{ sent: number; failed: number }> => {
    if (!currentUser) return { sent: 0, failed: 0 };

    let sent = 0;
    let failed = 0;
    const newNotifications: MatchNotification[] = [];

    for (const recipientId of match.allPlayerIds) {
      if (recipientId === currentUser.id) continue;

      try {
        if (!(await isNotificationEnabled(recipientId, 'match_invite'))) continue;

        const team = (match.team1PlayerIds || []).includes(recipientId) ? 1 : 2;
        const notifId = `notif_${match.id}_${recipientId}`;
        const notification: MatchNotification = {
          id: notifId,
          type: 'match_invite',
          status: 'sent',
          recipientId,
          senderId: currentUser.id,
          senderName: currentUser.name,
          senderProfilePic: currentUser.profilePic,
          matchId: match.id,
          matchDate: match.scheduledDate,
          matchLocation: match.location,
          matchType: match.matchType,
          team: team as 1 | 2,
          createdAt: Date.now(),
        };

        await createNotificationDocument(notification);
        newNotifications.push(notification);
        sent++;
      } catch (error) {
        console.error(`Error sending notification to ${recipientId}:`, error);
        failed++;
      }
    }

    if (newNotifications.length > 0) {
      setNotifications(prev => {
        const merged = new Map<string, MatchNotification>();
        for (const n of prev) merged.set(n.id, n);
        for (const n of newNotifications) merged.set(n.id, n);
        return Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
      });
    }

    return { sent, failed };
  };

  // Send update notifications to all players in a match (except the editor)
  const sendMatchUpdateNotifications = async (match: Match): Promise<{ sent: number; failed: number }> => {
    if (!currentUser) return { sent: 0, failed: 0 };

    let sent = 0;
    let failed = 0;
    const newNotifications: MatchNotification[] = [];
    const now = Date.now();
    const dateStr = new Date(match.scheduledDate).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
    const matchTypeLabel = match.matchType === 'doubles' ? 'doubles' : 'singles';

    for (const recipientId of match.allPlayerIds) {
      if (recipientId === currentUser.id) continue;

      try {
        if (!(await isNotificationEnabled(recipientId, 'match_updated'))) continue;

        const notifId = `notif_updated_${match.id}_${recipientId}_${now}`;
        const notification: MatchNotification = {
          id: notifId,
          type: 'match_updated',
          status: 'sent',
          recipientId,
          senderId: currentUser.id,
          senderName: currentUser.name,
          senderProfilePic: currentUser.profilePic,
          matchId: match.id,
          matchDate: match.scheduledDate,
          matchLocation: match.location,
          matchType: match.matchType,
          message: `${currentUser.name} updated the ${matchTypeLabel} match on ${dateStr}`,
          createdAt: now,
        };

        await createNotificationDocument(notification);
        newNotifications.push(notification);
        sent++;
      } catch (error) {
        console.error(`Error sending match_updated notification to ${recipientId}:`, error);
        failed++;
      }
    }

    if (newNotifications.length > 0) {
      setNotifications(prev => {
        const merged = new Map<string, MatchNotification>();
        for (const n of prev) merged.set(n.id, n);
        for (const n of newNotifications) merged.set(n.id, n);
        return Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
      });
    }

    return { sent, failed };
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
    if (!currentUser) return;
    const now = Date.now();
    try {
      const toMark = notifications.filter(
        n => n.status === 'sent' && n.recipientId === currentUser.id && n.type !== 'player_invite'
      );
      await Promise.all(
        toMark.map(n => updateNotificationDocument(n.id, { status: 'read', readAt: now }))
      );
      if (toMark.length > 0) {
        setNotifications(prev =>
          prev.map(n =>
            n.status === 'sent' && n.recipientId === currentUser.id && n.type !== 'player_invite'
              ? { ...n, status: 'read' as const, readAt: now }
              : n
          )
        );
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
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

    try {
      if (!(await isNotificationEnabled(recipientId, 'player_invite'))) return false;

      const now = Date.now();
      const notifId = `player_invite_${currentUser.id}_${recipientId}_${now}`;
      const notification: MatchNotification = {
        id: notifId,
        type: 'player_invite',
        status: 'sent',
        recipientId,
        senderId: currentUser.id,
        senderName: currentUser.name,
        senderProfilePic: currentUser.profilePic,
        message: `${currentUser.name} wants to add you as a player on PickleGo!`,
        createdAt: now,
      };

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

  // Respond to a player invite: accept adds connections + creates accept notification, decline updates status
  const respondToPlayerInvite = async (notificationId: string, accept: boolean): Promise<void> => {
    if (!currentUser) return;

    const notification = notifications.find(n => n.id === notificationId);
    if (!notification || notification.type !== 'player_invite') return;
    if (notification.recipientId !== currentUser.id) return;

    const now = Date.now();
    const senderId = notification.senderId;

    try {
      if (accept) {
        // 1. Update the invite notification status
        await updateNotificationDocument(notificationId, { status: 'accepted', respondedAt: now });

        // 2. Add bidirectional connections
        await addConnectionsBatch(currentUser.id, senderId);

        // 3. Create invite_accepted notification for the sender (if enabled)
        const senderAcceptsNotif = await isNotificationEnabled(senderId, 'invite_accepted');
        let acceptNotification: MatchNotification | null = null;
        if (senderAcceptsNotif) {
          const acceptNotifId = `invite_accepted_${currentUser.id}_${senderId}_${now}`;
          acceptNotification = {
            id: acceptNotifId,
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
        }

        // Update local notification state
        setNotifications(prev => {
          const updated = prev.map(n =>
            n.id === notificationId ? { ...n, status: 'accepted' as const, respondedAt: now } : n
          );
          return acceptNotification
            ? [acceptNotification, ...updated].sort((a, b) => b.createdAt - a.createdAt)
            : updated;
        });

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
        // Decline: update the notification status
        await updateNotificationDocument(notificationId, { status: 'declined', respondedAt: now });

        setNotifications(prev =>
          prev.map(n =>
            n.id === notificationId ? { ...n, status: 'declined' as const, respondedAt: now } : n
          )
        );
      }
    } catch (error) {
      console.error('Error responding to player invite:', error);
      throw error;
    }
  };

  const deleteNotification = async (notificationId: string): Promise<void> => {
    await deleteNotificationDocument(notificationId);
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  const clearAllNotifications = async (): Promise<void> => {
    if (!currentUser) return;
    const toClear = notifications.filter(n => n.recipientId === currentUser.id);
    setNotifications(prev => prev.filter(n => n.recipientId !== currentUser.id));
    for (const n of toClear) {
      try {
        await deleteNotificationDocument(n.id);
      } catch (error) {
        console.error(`Error deleting notification ${n.id}:`, error);
      }
    }
  };

  // Only count notifications where the current user is the recipient and status is 'sent'
  const unreadNotificationCount = notifications.filter(
    n => n.status === 'sent' && n.recipientId === currentUser?.id
  ).length;

  // SMS invite methods
  const invitePlayersBySMS = async (contacts: { phone: string; name: string }[]): Promise<{ inviteId: string }> => {
    if (!currentUser) throw new Error('Must be logged in');
    const result = await callCreateSMSInvite(
      contacts.map(c => c.phone),
      contacts.map(c => c.name),
    );
    return { inviteId: result.inviteId };
  };

  const lookupContactsOnPickleGo = async (phoneHashes: string[]): Promise<Map<string, { playerId: string; playerName: string }>> => {
    if (!currentUser || phoneHashes.length === 0) return new Map();
    const result = await callLookupPhoneNumbers(phoneHashes);
    return new Map(Object.entries(result.matches));
  };

  const claimPendingSMSInvite = async () => {
    try {
      const pendingInviteId = await AsyncStorage.getItem('pendingSMSInviteId');
      if (!pendingInviteId || !currentUser) return;

      const result = await callClaimSMSInvite(pendingInviteId);
      if (result.claimed) {
        await AsyncStorage.removeItem('pendingSMSInviteId');
        await refreshConnectedPlayers();
        await refreshNotifications();
      } else {
        // Remove if already claimed or self-invite
        await AsyncStorage.removeItem('pendingSMSInviteId');
      }
    } catch (error) {
      console.error('Error claiming SMS invite:', error);
    }
  };

  // Context value with all the methods and data
  const contextValue: DataContextType = {
    players,
    matches,
    deletedPlayers,
    currentUser,
    authLoading,
    hasCompletedOnboarding,
    completeOnboarding,
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
    deleteAccount,
    sendMatchNotifications,
    sendMatchUpdateNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    getNotificationsForMatch,
    sendPlayerInvite,
    respondToPlayerInvite,
    deleteNotification,
    clearAllNotifications,
    refreshMatches,
    refreshNotifications,
    refreshConnectedPlayers,
    invitePlayersBySMS,
    lookupContactsOnPickleGo,
    claimPendingSMSInvite,
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