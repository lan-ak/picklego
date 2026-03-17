import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { unstable_batchedUpdates } from 'react-native';
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
  getMatchDocument,
  getMatchesForPlayer,
  sendPasswordReset,
  signInWithGoogle,
  signInWithApple,
  getCurrentUser,
  getNotificationsForPlayer,
  getNotificationsForMatchBySender,
  removeConnection,
  callAcceptPlayerInvite,
  callClaimPlaceholderProfile,
  callCreateSMSInvite,
  callClaimSMSInvite,
  callLookupPhoneNumbers,
  callDeleteAccount,
  createNotificationDocument,
  batchCreateNotificationDocuments,
  updateNotificationDocument,
  deleteNotificationDocument,
  getPlaceholderByEmail,
  callFindSMSInvitesByPhone,
  getPlaceholdersByInviter,
  addPendingConnection,
} from '../config/firebase';
import { hashPhone } from '../utils/phone';
import { registerPushToken, unregisterPushToken } from '../services/pushNotifications';
import { useOnboardingStatus } from '../hooks/useOnboardingStatus';
import { newMatchId, newPlaceholderPlayerId, playerInviteNotifId, matchCancelledNotifId } from '../utils/ids';

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
  const isResettingRef = useRef(false);
  const socialSignUpInProgressRef = useRef(false);
  const resetUserState = () => {
    isResettingRef.current = true;
    unstable_batchedUpdates(() => {
      setCurrentUser(null);
      setMatches([]);
      setPlayers([]);
      setDeletedPlayers([]);
      setNotifications([]);
    });
    // Clear AsyncStorage once instead of letting the save effect write empty arrays
    AsyncStorage.multiRemove(['matches', 'players', 'deletedPlayers']).catch(console.error);
    isResettingRef.current = false;
  };

  // Keep refs to state so useCallback functions can access current values
  // without needing state in their dependency arrays (keeps callbacks stable).
  const playersRef = useRef<Player[]>([]);
  useEffect(() => { playersRef.current = players; }, [players]);

  const currentUserRef = useRef<Player | null>(null);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  const matchesRef = useRef<Match[]>([]);
  useEffect(() => { matchesRef.current = matches; }, [matches]);

  const notificationsRef = useRef<MatchNotification[]>([]);
  useEffect(() => { notificationsRef.current = notifications; }, [notifications]);

  const deletedPlayersRef = useRef<Player[]>([]);
  useEffect(() => { deletedPlayersRef.current = deletedPlayers; }, [deletedPlayers]);

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

  // Save data to AsyncStorage whenever it changes (debounced, skipped during reset)
  useEffect(() => {
    if (isResettingRef.current) return;

    const timeout = setTimeout(() => {
      try {
        AsyncStorage.setItem('matches', JSON.stringify(matches));
        AsyncStorage.setItem('players', JSON.stringify(players));
        AsyncStorage.setItem('deletedPlayers', JSON.stringify(deletedPlayers));
      } catch (error) {
        console.error('Error saving data:', error);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [matches, players, deletedPlayers]);

  // Check for stale/expired matches
  useEffect(() => {
    if (matches.length === 0) return;
    const now = new Date();
    const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours

    const expiredMatches = matches.filter(match => {
      if (match.status !== 'scheduled') return false;
      const scheduledTime = new Date(match.scheduledDate).getTime();
      return now.getTime() - scheduledTime > staleThreshold;
    });

    if (expiredMatches.length > 0) {
      const expiredIds = new Set(expiredMatches.map(e => e.id));

      setMatches(prev => prev.map(match =>
        expiredIds.has(match.id) ? { ...match, status: 'expired' as const } : match
      ));

      // Update expired status in Firestore — skip if match doesn't exist (ghost match)
      Promise.all(
        expiredMatches.map(async match => {
          try {
            const firestoreMatch = await getMatchDocument(match.id);
            if (firestoreMatch) {
              await updateMatchDocument(match.id, { status: 'expired' });
            }
          } catch (error) {
            console.error('Error marking match as expired in Firestore:', error);
            // Revert this match back to scheduled locally so we retry next render
            setMatches(prev => prev.map(m =>
              m.id === match.id ? { ...m, status: 'scheduled' as const } : m
            ));
          }
        })
      );
    }
  }, [matches.length]);

  // Expire stale notifications
  useEffect(() => {
    if (notifications.length === 0) return;

    const now = Date.now();
    const staleThreshold = 7 * 24 * 60 * 60 * 1000; // 7 days

    const expiredIds = new Set<string>();
    for (const notif of notifications) {
      // Expire read match notifications 7 days past their match date
      if (notif.matchDate && notif.status !== 'sent') {
        const matchTime = new Date(notif.matchDate).getTime();
        if (now - matchTime > staleThreshold) {
          expiredIds.add(notif.id);
        }
      }
      // Expire resolved player invite notifications after 7 days
      if (
        (notif.type === 'player_invite' || notif.type === 'invite_accepted') &&
        notif.status !== 'sent' &&
        now - notif.createdAt > staleThreshold
      ) {
        expiredIds.add(notif.id);
      }
    }

    if (expiredIds.size > 0) {
      console.log(`[Notifications] Expiring ${expiredIds.size} stale notifications:`, [...expiredIds]);
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
  const claimPlaceholderProfile = useCallback(async (
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
  }, []);

  // Dedup guards prevent concurrent duplicate refresh calls (e.g., useFocusEffect + pull-to-refresh)
  const isRefreshingMatchesRef = useRef(false);
  const refreshMatches = useCallback(async () => {
    const user = currentUserRef.current;
    if (!user || isRefreshingMatchesRef.current) return;
    isRefreshingMatchesRef.current = true;
    try {
      const firestoreMatches = await getMatchesForPlayer(user.id);
      const visibleMatches = firestoreMatches.filter(
        m => !m.deletedByPlayerIds?.includes(user.id)
      );
      setMatches(prev => {
        const firestoreIds = new Set(visibleMatches.map(m => m.id));
        const localOnly = prev.filter(m => !firestoreIds.has(m.id));
        return [...visibleMatches, ...localOnly];
      });
    } catch (error) {
      console.error('Error refreshing matches:', error);
    } finally {
      isRefreshingMatchesRef.current = false;
    }
  }, []);

  // Refresh notifications from Firestore for the current user
  const isRefreshingNotificationsRef = useRef(false);
  const refreshNotifications = useCallback(async () => {
    const user = currentUserRef.current;
    if (!user) {
      console.log('[Notifications] refreshNotifications: no current user, skipping');
      return;
    }
    if (isRefreshingNotificationsRef.current) {
      console.log('[Notifications] refreshNotifications: already refreshing, skipping');
      return;
    }
    isRefreshingNotificationsRef.current = true;
    try {
      await loadNotifications(user.id);
    } finally {
      isRefreshingNotificationsRef.current = false;
    }
  }, []);

  // Centralised loader for all player relationships: connections, placeholders, and pending invites.
  // Called by both auth init and refreshConnectedPlayers to avoid duplication.
  const loadRelatedPlayers = useCallback(async (userDoc: Player) => {
    const connectionIds = userDoc.connections || [];
    let newConnectedPlayers: Player[] = [];

    // 1. Load missing connected player docs
    if (connectionIds.length > 0) {
      const existingIds = new Set(playersRef.current.map(p => p.id));
      const missingIds = connectionIds.filter((id: string) => !existingIds.has(id));
      if (missingIds.length > 0) {
        const docs = await Promise.all(
          missingIds.map((id: string) => getPlayerDocument(id))
        );
        newConnectedPlayers = docs.filter((d): d is Player => d !== null);
      }
    }

    // 2. Prune stale placeholders + add new connected players
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
        if (toAdd.length > 0) updated = [...updated, ...toAdd];
      }
      return updated;
    });

    // 3. Load invited placeholders
    const invitedPlaceholders = await getPlaceholdersByInviter(userDoc.id);
    if (invitedPlaceholders.length > 0) {
      setPlayers(prev => {
        const currentIds = new Set(prev.map(p => p.id));
        const newOnes = invitedPlaceholders.filter(p => !currentIds.has(p.id));
        return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
      });
    }

    // 4. Load pending connection player docs (outgoing invites not yet accepted)
    const pendingIds = userDoc.pendingConnections || [];
    if (pendingIds.length > 0) {
      const existingIds = new Set(playersRef.current.map(p => p.id));
      const missingIds = pendingIds.filter((id: string) => !existingIds.has(id));
      if (missingIds.length > 0) {
        const docs = await Promise.all(
          missingIds.map((id: string) => getPlayerDocument(id))
        );
        const validPlayers = docs.filter((d): d is Player => d !== null);
        if (validPlayers.length > 0) {
          setPlayers(prev => {
            const currentIds = new Set(prev.map(p => p.id));
            const toAdd = validPlayers.filter(p => !currentIds.has(p.id));
            return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
          });
        }
      }
    }
  }, []);

  // Refresh connected players from Firestore, load missing docs, and prune stale placeholders
  const refreshConnectedPlayers = useCallback(async () => {
    const user = currentUserRef.current;
    if (!user) return;
    try {
      const freshUserDoc = await getPlayerDocument(user.id);
      if (!freshUserDoc) return;

      setCurrentUser(freshUserDoc);
      setPlayers(prev => prev.map(p => p.id === freshUserDoc.id ? freshUserDoc : p));

      await loadRelatedPlayers(freshUserDoc);
    } catch (error) {
      console.error('Error refreshing connected players:', error);
    }
  }, [loadRelatedPlayers]);

  // Initialize Firebase auth state listener.
  // A version counter prevents stale async callbacks from writing data
  // if auth state changes again (e.g., rapid sign-out / sign-in).
  const authVersionRef = useRef(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (firebaseUser) => {
      const version = ++authVersionRef.current;
      const isStale = () => authVersionRef.current !== version;

      try {
        if (firebaseUser) {
          // Get the player document from Firestore
          const playerDoc = await getPlayerDocument(firebaseUser.uid);
          if (isStale()) return;

          if (playerDoc) {
            setCurrentUser(playerDoc);
            setPlayers(prev => {
              const filtered = prev.filter(p => p.id !== playerDoc.id);
              return [...filtered, playerDoc];
            });

            // Load matches from Firestore
            try {
              const firestoreMatches = await getMatchesForPlayer(firebaseUser.uid);
              if (isStale()) return;
              // Filter out matches soft-deleted by this user
              const visibleMatches = firestoreMatches.filter(
                m => !m.deletedByPlayerIds?.includes(firebaseUser.uid)
              );
              const alreadyMigrated = await AsyncStorage.getItem('matchesMigrated');
              if (alreadyMigrated === 'true') {
                // Migration is done — Firestore is the source of truth, drop local-only ghosts
                setMatches(visibleMatches);
              } else if (visibleMatches.length > 0) {
                // Pre-migration: merge Firestore matches with local, keep local-only for migration
                setMatches(prev => {
                  const firestoreIds = new Set(visibleMatches.map(m => m.id));
                  const localOnly = prev.filter(m => !firestoreIds.has(m.id));
                  return [...visibleMatches, ...localOnly];
                });
              }
            } catch (error) {
              console.error('Error loading matches from Firestore:', error);
            }

            if (isStale()) return;

            // Migrate legacy AsyncStorage matches to Firestore
            await migrateLocalMatchesToFirestore(firebaseUser.uid);
            if (isStale()) return;

            // Load connections, placeholders, and pending invite player docs
            try {
              await loadRelatedPlayers(playerDoc);
            } catch (error) {
              console.error('Error loading related players:', error);
            }

            if (isStale()) return;

            // Load notifications for this user
            await loadNotifications(firebaseUser.uid);
            if (isStale()) return;

            // Register for push notifications (skip if user hasn't completed onboarding yet)
            try {
              const onboardingDone = await AsyncStorage.getItem(`@picklego_onboarding_complete_${firebaseUser.uid}`);
              if (onboardingDone === 'true') {
                await registerPushToken(firebaseUser.uid);
              }
            } catch (error) {
              console.error('Error registering push token:', error);
            }
          } else {
            // Auth user exists but player doc is missing.
            // Skip sign-out if a social sign-up is in progress — the player doc
            // will be created momentarily by signInWithSocial / completeSocialSignUp.
            if (!socialSignUpInProgressRef.current) {
              await signOut();
            }
          }
        } else {
          resetUserState();
        }
      } catch (error) {
        console.error('Error during auth state initialization:', error);
        if (!isStale()) resetUserState();
      } finally {
        if (!isStale()) setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Claim placeholder profile after auth is fully loaded.
  // Runs in a separate effect so auth.currentUser is guaranteed to be set
  // (avoids the race condition inside onAuthStateChanged where the token
  // may not yet be available for Cloud Function calls).
  const claimAttemptedRef = useRef<string | null>(null);
  const [claimRetryCount, setClaimRetryCount] = useState(0);
  const MAX_CLAIM_RETRIES = 3;

  useEffect(() => {
    if (!authLoading && currentUser?.email && claimAttemptedRef.current !== currentUser.id) {
      // Check if a placeholder actually exists before calling the Cloud Function.
      // This avoids unnecessary callable invocations (and auth token issues) on every login.
      const checkAndClaim = async () => {
        try {
          const placeholder = await getPlaceholderByEmail(currentUser.email!);
          if (placeholder && placeholder.id !== currentUser.id) {
            await claimPlaceholderProfile(currentUser.id, currentUser.name, currentUser.email!);
          }
          claimAttemptedRef.current = currentUser.id;
        } catch (error) {
          console.error('Error checking for placeholder:', error);
          if (claimRetryCount < MAX_CLAIM_RETRIES) {
            setTimeout(() => setClaimRetryCount(c => c + 1), 2000 * (claimRetryCount + 1));
          }
        }
      };
      checkAndClaim();
    }
  }, [authLoading, currentUser?.id, currentUser?.email, claimRetryCount]);

  // Claim pending SMS invite after auth is fully loaded
  const smsClaimAttemptedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authLoading && currentUser && smsClaimAttemptedRef.current !== currentUser.id) {
      smsClaimAttemptedRef.current = currentUser.id;
      claimPendingSMSInvite().catch(() => {
        // Reset so it can retry on next effect run
        smsClaimAttemptedRef.current = null;
      });
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

  const addMatch = useCallback(async (matchData: Omit<Match, 'id' | 'createdAt' | 'lastModifiedAt' | 'lastModifiedBy'>): Promise<Match> => {
    const now = Date.now();
    const creator = currentUserRef.current;
    const newMatch: Match = {
      ...matchData,
      id: newMatchId(),
      createdAt: now,
      lastModifiedAt: now,
      lastModifiedBy: matchData.createdBy,
      createdByName: creator?.name,
      createdByProfilePic: creator?.profilePic,
    };
    setMatches(prev => [...prev, newMatch]);

    // Persist to Firestore
    try {
      await createMatchDocument(newMatch);
    } catch (error) {
      console.error('Error saving match to Firestore:', error);
      // Remove from local state since it didn't persist
      setMatches(prev => prev.filter(m => m.id !== newMatch.id));
      throw error;
    }

    return newMatch;
  }, []);

  const updateMatch = useCallback(async (matchId: string, updates: Partial<Match>): Promise<void> => {
    const matchToUpdate = matchesRef.current.find(m => m.id === matchId);
    if (!matchToUpdate) return;

    const updatedMatch: Match = {
      ...matchToUpdate,
      ...updates,
      lastModifiedAt: Date.now(),
      lastModifiedBy: currentUserRef.current?.id || matchToUpdate.lastModifiedBy,
    };

    setMatches(prev => prev.map(match =>
      match.id === matchId ? updatedMatch : match
    ));

    // Persist to Firestore
    const modifier = currentUserRef.current;
    try {
      await updateMatchDocument(matchId, {
        ...updates,
        lastModifiedAt: updatedMatch.lastModifiedAt,
        lastModifiedBy: updatedMatch.lastModifiedBy,
        lastModifiedByName: modifier?.name,
        lastModifiedByProfilePic: modifier?.profilePic,
      });
    } catch (error) {
      console.error('Error updating match in Firestore:', error);
    }

    // Recalculate stats when a match is completed or a completed match is edited
    if (updates.status === 'completed' || (matchToUpdate.status === 'completed' && (updates.games || updates.winnerTeam))) {
      recalculateStatsForPlayers(updatedMatch.allPlayerIds,
        matchesRef.current.map(m => m.id === matchId ? updatedMatch : m)
      );
    }
  }, []);

  const addPlayer = useCallback(async (playerData: Omit<Player, 'id' | 'createdAt' | 'updatedAt'>): Promise<Player> => {
    try {
      let playerId: string;
      let isPlaceholder = false;

      if (playerData.email && playerData.password) {
        // Create Firebase auth user for players with credentials
        const firebaseUser = await signUpWithEmail(playerData.email, playerData.password);
        playerId = firebaseUser.uid;
      } else {
        // Generate a local ID for invited/placeholder players
        playerId = newPlaceholderPlayerId();
        isPlaceholder = true;
      }

      const newPlayer: Player = {
        ...playerData,
        id: playerId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        ...(!isPlaceholder ? { authProvider: 'email' as const } : {}),
        ...(isPlaceholder && currentUserRef.current && (playerData.email || (playerData as any).phoneNumber) ? {
          pendingClaim: true,
          invitedBy: currentUserRef.current.id,
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
      throw error;
    }
  }, []);

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

  const deleteMatch = useCallback(async (matchId: string) => {
    const user = currentUserRef.current;
    if (!user) return;

    const matchToDelete = matchesRef.current.find(m => m.id === matchId);

    // Optimistically remove from local state
    setMatches(prev => prev.filter(match => match.id !== matchId));

    const isScheduled = matchToDelete?.status === 'scheduled';

    try {
      // Check if the match exists in Firestore (it may be a local-only ghost match)
      const firestoreMatch = await getMatchDocument(matchId);

      if (firestoreMatch) {
        if (isScheduled) {
          // Hard-delete scheduled matches for everyone
          await deleteMatchDocument(matchId);
        } else {
          // Soft-delete completed matches (only hide for current user)
          await softDeleteMatch(matchId, user.id);
        }
      }
      // If not in Firestore, just removing from local state (already done above) is sufficient
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
      const remainingMatches = matchesRef.current.filter(m => m.id !== matchId);
      recalculateStatsForPlayers([user.id], remainingMatches);
    }

    // Send match_cancelled notifications only for upcoming matches (not completed ones)
    if (matchToDelete && matchToDelete.status === 'scheduled') {
      const now = Date.now();
      const dateStr = new Date(matchToDelete.scheduledDate).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      });
      const matchTypeLabel = matchToDelete.matchType === 'doubles' ? 'doubles' : 'singles';

      const cancelNotifications: MatchNotification[] = [];
      for (const recipientId of matchToDelete.allPlayerIds) {
        if (recipientId === user.id) continue;
        // Skip placeholders — they can't receive notifications
        const recipient = playersRef.current.find(p => p.id === recipientId);
        if (recipient?.pendingClaim) continue;

        cancelNotifications.push({
          id: matchCancelledNotifId(matchId, recipientId, now),
          type: 'match_cancelled',
          status: 'sent',
          recipientId,
          senderId: user.id,
          senderName: user.name,
          senderProfilePic: user.profilePic,
          matchId: matchToDelete.id,
          matchDate: matchToDelete.scheduledDate,
          matchLocation: matchToDelete.location,
          matchType: matchToDelete.matchType,
          message: `${user.name} cancelled the ${matchTypeLabel} match on ${dateStr}`,
          createdAt: now,
        });
      }
      console.log(`[Notifications] deleteMatch: match=${matchId}, sender=${user.id}, cancel recipients=[${cancelNotifications.map(n => n.recipientId).join(', ')}]`);
      if (cancelNotifications.length > 0) {
        try {
          await batchCreateNotificationDocuments(cancelNotifications);
          console.log(`[Notifications] deleteMatch: wrote ${cancelNotifications.length} match_cancelled docs`);
        } catch (error) {
          console.error('[Notifications] Error batch creating match_cancelled notifications:', error);
        }
      }
    }

    // Clean up orphaned notifications for this match where current user is recipient
    const orphanedNotifs = notificationsRef.current.filter(
      n => n.matchId === matchId && n.recipientId === user.id
    );
    if (orphanedNotifs.length > 0) {
      for (const n of orphanedNotifs) {
        try {
          await deleteNotificationDocument(n.id);
        } catch (error) {
          console.error(`Error cleaning up notification ${n.id}:`, error);
        }
      }
      setNotifications(prev => prev.filter(n => !(n.matchId === matchId && n.recipientId === user.id)));
    }
  }, []);

  const updatePlayer = useCallback(async (playerId: string, data: Partial<Player>) => {
    try {
      await updatePlayerDocument(playerId, data);
      const updatedDoc = await getPlayerDocument(playerId);
      if (updatedDoc) {
        setPlayers(prev => {
          const filtered = prev.filter(p => p.id !== playerId);
          return [...filtered, updatedDoc];
        });
        if (currentUserRef.current?.id === playerId) {
          setCurrentUser(updatedDoc);
        }
      }
    } catch (error: any) {
      throw new Error(error.message);
    }
  }, []);

  const recalculateStatsForPlayers = useCallback((playerIds: string[], currentMatches: Match[]) => {
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
      if (currentUserRef.current?.id === playerId) {
        setCurrentUser(prev => prev ? { ...prev, stats: statsUpdate } : prev);
      }
    }
  }, []);

  // Check if email is available (not already used)
  const isEmailAvailable = useCallback(async (email: string): Promise<boolean> => {
    try {
      const existingPlayer = await getPlayerByEmail(email);
      return !existingPlayer;
    } catch (error) {
      console.error('Error checking email availability:', error);
      return false;
    }
  }, []);
  
  // Unified invite: handles both email and phone invites.
  // Creates a placeholder player, or returns an existing player if already on PickleGo.
  // Does NOT handle SMS compose — that stays in the UI layer.
  const invitePlayer = useCallback(async (
    name: string,
    contact: { email?: string; phone?: string },
  ): Promise<InviteResult> => {
    if (!name) return { type: 'error' };
    const { email, phone } = contact;
    if (!email && !phone) return { type: 'error' };

    const user = currentUserRef.current;
    if (!user) return { type: 'error' };

    // --- Email path: check if a real player already exists with this email ---
    if (email) {
      const emailAvailable = await isEmailAvailable(email);
      if (!emailAvailable) {
        try {
          const existingPlayer = await getPlayerByEmail(email);
          if (!existingPlayer) return { type: 'error' };

          if (existingPlayer.pendingClaim) {
            console.warn('getPlayerByEmail returned a placeholder for', email, '— email lookup may be stale');
          }

          if (existingPlayer.id === user.id) return { type: 'error' };

          if (!user.connections?.includes(existingPlayer.id)) {
            await sendPlayerInvite(existingPlayer.id);
          }

          if (!playersRef.current.some(p => p.id === existingPlayer.id)) {
            setPlayers(prev => [...prev, existingPlayer]);
          }

          return { type: 'existing_player', player: existingPlayer };
        } catch (error) {
          console.error('Error handling existing player invite:', error);
          return { type: 'error' };
        }
      }
    }

    // --- Phone path (no email): check if player is already on PickleGo ---
    if (phone && !email) {
      try {
        const phoneHash = await hashPhone(phone);
        const matches = await lookupContactsOnPickleGo([phoneHash]);
        const match = matches.get(phoneHash);
        if (match) {
          let existingPlayer = playersRef.current.find(p => p.id === match.playerId);
          if (!existingPlayer) {
            const fetched = await getPlayerDocument(match.playerId);
            if (fetched) existingPlayer = fetched;
          }
          if (existingPlayer && existingPlayer.id !== user.id) {
            if (!user.connections?.includes(existingPlayer.id)) {
              await sendPlayerInvite(existingPlayer.id);
            }
            if (!playersRef.current.some(p => p.id === existingPlayer!.id)) {
              setPlayers(prev => [...prev, existingPlayer!]);
            }
            return { type: 'existing_player', player: existingPlayer };
          }
        }
      } catch (error) {
        console.error('Error looking up phone:', error);
        // Fall through to placeholder creation
      }
    }

    // --- Create placeholder player ---
    try {
      const createdPlayer = await addPlayer({
        name,
        ...(email ? { email } : {}),
        ...(phone ? { phoneNumber: phone } : {}),
        pendingClaim: true,
        invitedBy: user.id,
        isInvited: true,
      } as any);
      return { type: 'invited', player: createdPlayer };
    } catch (error) {
      console.error('Error creating placeholder player:', error);
      return { type: 'error' };
    }
  }, [addPlayer, isEmailAvailable]);

  // Get all players invited by the current user (placeholders + pending in-app invites)
  const getInvitedPlayers = useCallback((playersList?: Player[]): Player[] => {
    const user = currentUserRef.current;
    if (!user) return [];
    const source = playersList ?? playersRef.current;
    const connections = user.connections || [];
    return source.filter(player => {
      // Already connected — never show as "invited"
      if (connections.includes(player.id)) return false;
      // Placeholder players created by current user
      if (player.invitedBy === user.id && (player.email || player.phoneNumber)) return true;
      // Existing players with a pending outgoing invite
      if (user.pendingConnections?.includes(player.id)) return true;
      return false;
    });
  }, []);

  // Check if there's a pending outgoing invite to this player
  const isOutgoingInvitePending = useCallback((playerId: string): boolean => {
    const user = currentUserRef.current;
    if (!user) return false;
    return user.pendingConnections?.includes(playerId) ?? false;
  }, []);

  // Claim an invitation - used when a new player registers from an invitation
  const claimInvitation = useCallback(async (email: string, playerData: Partial<Player>): Promise<boolean> => {
    const normalizedEmail = email.trim().toLowerCase();
    const invitedPlayer = playersRef.current.find(
      p => p.email?.trim().toLowerCase() === normalizedEmail && p.pendingClaim
    );

    if (!invitedPlayer) return false;

    // Update the invited player with the provided data
    await updatePlayer(invitedPlayer.id, {
      ...playerData,
      pendingClaim: false,
    });

    return true;
  }, [updatePlayer]);

  // Get player name even if they've been deleted
  const getPlayerName = useCallback((playerId: string): string => {
    // First check active players
    const activePlayer = playersRef.current.find(p => p.id === playerId);
    if (activePlayer) return activePlayer.name;

    // Then check deleted players
    const deletedPlayer = deletedPlayersRef.current.find(p => p.id === playerId);
    if (deletedPlayer) return `${deletedPlayer.name} (Removed)`;

    // If not found anywhere
    return 'Unknown Player';
  }, []);

  // Remove a player from contacts (also breaks connection if applicable)
  const removePlayer = useCallback(async (playerId: string): Promise<boolean> => {
    try {
      const user = currentUserRef.current;
      // Don't allow removing the current user
      if (user && playerId === user.id) {
        return false;
      }

      // Find the player to be removed
      const playerToRemove = playersRef.current.find(player => player.id === playerId);
      if (!playerToRemove) {
        return false;
      }

      // If the player is a connection, break the bidirectional Firestore connection
      if (user?.connections?.includes(playerId)) {
        await removeConnection(user.id, playerId);
        await removeConnection(playerId, user.id);
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
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      // onAuthStateChanged listener handles loading the player doc,
      // matches, connections, notifications, and push token registration.
      await signInWithEmail(email, password);
    } catch (error: any) {
      throw error;
    }
  }, []);

  const signInWithSocial = useCallback(async (provider: 'google' | 'apple'): Promise<{ needsName: boolean }> => {
    socialSignUpInProgressRef.current = true;
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
        socialSignUpInProgressRef.current = false;
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
        socialSignUpInProgressRef.current = false;
      }
      // If needsName is true, flag stays set until completeSocialSignUp clears it

      return { needsName };
    } catch (error: any) {
      socialSignUpInProgressRef.current = false;
      if (error.cancelled) {
        throw error;
      }
      throw new Error(error.message);
    }
  }, []);

  const completeSocialSignUp = useCallback(async (name: string, provider: 'google' | 'apple') => {
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
    } finally {
      socialSignUpInProgressRef.current = false;
    }
  }, []);

  const deleteAccount = useCallback(async () => {
    try {
      const user = currentUserRef.current;
      if (user) {
        await unregisterPushToken(user.id);
      }
      await callDeleteAccount();
      await AsyncStorage.multiRemove(['matches', 'players', 'deletedPlayers']);
      // Sign out locally so onAuthStateChanged fires and resets app state
      await signOut();
    } catch (error: any) {
      throw new Error(error.message);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    try {
      const user = currentUserRef.current;
      if (user) {
        await unregisterPushToken(user.id);
      }
      await signOut();
      // State cleanup handled by onAuthStateChanged -> resetUserState()
    } catch (error: any) {
      throw new Error(error.message);
    }
  }, []);

  // Load notifications where the current user is the recipient
  const loadNotifications = useCallback(async (playerId: string) => {
    console.log(`[Notifications] loadNotifications called for playerId=${playerId}`);
    try {
      const received = await getNotificationsForPlayer(playerId);
      console.log(`[Notifications] Loaded ${received.length} received notifications for player ${playerId}`);
      setNotifications(received.sort((a, b) => b.createdAt - a.createdAt));
    } catch (error) {
      console.warn('[Notifications] ⚠️ Error loading notifications (index may not be deployed):', error);
    }
  }, []);

  // Send notifications to all players in a match (except the creator)
  // Note: recipient preference/placeholder checks are handled server-side by
  // sendPushOnNotificationWrite, which uses fresh Firestore data. We always
  // create the notification doc and let the backend decide whether to push.
  // Match notifications are now handled server-side via Firestore triggers
  const sendMatchNotifications = useCallback(async (_match: Match): Promise<{ sent: number; failed: number }> => {
    return { sent: 0, failed: 0 };
  }, []);

  // Match update notifications are now handled server-side via Firestore triggers
  const sendMatchUpdateNotifications = useCallback(async (_match: Match): Promise<{ sent: number; failed: number }> => {
    return { sent: 0, failed: 0 };
  }, []);

  // Roster change notifications are now handled server-side via Firestore triggers
  const sendMatchRosterChangeNotifications = useCallback(async (
    _match: Match,
    _oldAllPlayerIds: string[]
  ): Promise<{ sent: number; failed: number }> => {
    return { sent: 0, failed: 0 };
  }, []);

  // Mark a single notification as read
  const markNotificationRead = useCallback(async (notificationId: string) => {
    const now = Date.now();
    try {
      await updateNotificationDocument(notificationId, { status: 'read', readAt: now });
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, status: 'read', readAt: now } : n)
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, []);

  // Mark all notifications as read (skip player_invite — those need explicit accept/decline)
  const markAllNotificationsRead = useCallback(async () => {
    const user = currentUserRef.current;
    if (!user) return;
    const now = Date.now();
    try {
      const toMark = notificationsRef.current.filter(
        n => n.status === 'sent' && n.recipientId === user.id && n.type !== 'player_invite'
      );
      await Promise.all(
        toMark.map(n => updateNotificationDocument(n.id, { status: 'read', readAt: now }))
      );
      if (toMark.length > 0) {
        setNotifications(prev =>
          prev.map(n =>
            n.status === 'sent' && n.recipientId === user.id && n.type !== 'player_invite'
              ? { ...n, status: 'read' as const, readAt: now }
              : n
          )
        );
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  }, []);

  // Get notifications for a specific match (used by match creator to see statuses)
  // Queries Firestore directly by matchId + senderId to avoid polluting local state
  const getNotificationsForMatch = useCallback(async (matchId: string): Promise<MatchNotification[]> => {
    const user = currentUserRef.current;
    if (!user) return [];
    return getNotificationsForMatchBySender(matchId, user.id);
  }, []);

  // Send a player_invite notification to an existing user
  const sendPlayerInvite = useCallback(async (recipientId: string): Promise<boolean> => {
    const user = currentUserRef.current;
    if (!user) return false;
    if (recipientId === user.id) return false;
    if (user.connections?.includes(recipientId)) return false;
    // Skip placeholders — they can't receive notifications
    const recipient = playersRef.current.find(p => p.id === recipientId);
    if (recipient?.pendingClaim) return false;

    try {
      const now = Date.now();
      // Use a stable ID (no timestamp) so re-sending overwrites the existing invite
      const notifId = playerInviteNotifId(user.id, recipientId);
      const notification: MatchNotification = {
        id: notifId,
        type: 'player_invite',
        status: 'sent',
        recipientId,
        senderId: user.id,
        senderName: user.name,
        senderProfilePic: user.profilePic,
        message: `${user.name} wants to add you as a player on PickleGo!`,
        createdAt: now,
      };

      console.log(`[Notifications] sendPlayerInvite: sender=${user.id}, recipient=${recipientId}, notifId=${notifId}`);
      await createNotificationDocument(notification);
      console.log(`[Notifications] sendPlayerInvite: wrote player_invite doc`);

      // Track the outgoing invite on the sender's player doc
      await addPendingConnection(user.id, recipientId);

      // Update local state
      const updatedPending = [...(user.pendingConnections || []), recipientId];
      const updatedUser = { ...user, pendingConnections: updatedPending };
      currentUserRef.current = updatedUser;
      setCurrentUser(updatedUser);
      setPlayers(prev => prev.map(p => p.id === user.id ? updatedUser : p));

      // Fetch recipient player doc if not already in local state
      if (!playersRef.current.find(p => p.id === recipientId)) {
        const recipientDoc = await getPlayerDocument(recipientId);
        if (recipientDoc) {
          setPlayers(prev => {
            if (prev.find(p => p.id === recipientId)) return prev;
            return [...prev, recipientDoc];
          });
        }
      }

      return true;
    } catch (error) {
      console.error('Error sending player invite:', error);
      return false;
    }
  }, []);

  // Respond to a player invite: accept adds connections + creates accept notification, decline updates status
  const respondToPlayerInvite = useCallback(async (notificationId: string, accept: boolean): Promise<void> => {
    const user = currentUserRef.current;
    if (!user) return;

    const notification = notificationsRef.current.find(n => n.id === notificationId);
    if (!notification || notification.type !== 'player_invite') return;
    if (notification.recipientId !== user.id) return;

    const now = Date.now();
    const senderId = notification.senderId;

    try {
      if (accept) {
        // Use the atomic cloud function — it updates the notification, adds
        // bidirectional connections, and creates the accept notification in a
        // single Firestore batch, preventing inconsistent state on partial failure.
        const result = await callAcceptPlayerInvite(notificationId);

        // Fetch sender doc before batching state updates (so we can include it in a single render)
        let senderDoc: Player | null = null;
        const senderInLocal = playersRef.current.find(p => p.id === senderId);
        if (!senderInLocal) {
          senderDoc = await getPlayerDocument(senderId);
        }

        // Batch all state updates to prevent intermediate re-renders after async
        unstable_batchedUpdates(() => {
          // Only update the original invite status locally — the accept notification
          // is created server-side and will appear when the sender loads their notifications
          setNotifications(prev =>
            prev.map(n =>
              n.id === notificationId ? { ...n, status: 'accepted' as const, respondedAt: now } : n
            )
          );

          setCurrentUser(prev => prev ? {
            ...prev,
            connections: [...(prev.connections || []), senderId],
            pendingConnections: (prev.pendingConnections || []).filter(id => id !== senderId),
          } : prev);

          setPlayers(prev => {
            let updated = prev.map(p => {
              if (p.id === user.id) return { ...p, connections: [...(p.connections || []), senderId], pendingConnections: (p.pendingConnections || []).filter((id: string) => id !== senderId) };
              if (p.id === senderId) return { ...p, connections: [...(p.connections || []), user.id] };
              return p;
            });
            if (senderDoc && !updated.some(p => p.id === senderDoc!.id)) {
              updated = [...updated, senderDoc];
            }
            return updated;
          });
        });
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
  }, []);

  const deleteNotification = useCallback(async (notificationId: string): Promise<void> => {
    await deleteNotificationDocument(notificationId);
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  }, []);

  const clearAllNotifications = useCallback(async (): Promise<void> => {
    const user = currentUserRef.current;
    if (!user) return;
    const toClear = notificationsRef.current.filter(n => n.recipientId === user.id);
    setNotifications(prev => prev.filter(n => n.recipientId !== user.id));
    for (const n of toClear) {
      try {
        await deleteNotificationDocument(n.id);
      } catch (error) {
        console.error(`Error deleting notification ${n.id}:`, error);
      }
    }
  }, []);

  // Only count notifications where the current user is the recipient and status is 'sent'
  const unreadNotificationCount = useMemo(() =>
    notifications.filter(n => n.status === 'sent' && n.recipientId === currentUser?.id).length,
    [notifications, currentUser?.id]
  );

  // SMS invite methods
  const invitePlayersBySMS = useCallback(async (contacts: { phone: string; name: string }[]): Promise<{ inviteId: string }> => {
    const user = currentUserRef.current;
    if (!user) throw new Error('Must be logged in');
    const result = await callCreateSMSInvite(
      contacts.map(c => c.phone),
      contacts.map(c => c.name),
    );
    return { inviteId: result.inviteId };
  }, []);

  const lookupContactsOnPickleGo = useCallback(async (phoneHashes: string[]): Promise<Map<string, { playerId: string; playerName: string }>> => {
    if (!currentUserRef.current || phoneHashes.length === 0) return new Map();
    const result = await callLookupPhoneNumbers(phoneHashes);
    return new Map(Object.entries(result.matches));
  }, []);

  const findSMSInvitesByPhone = useCallback(async (normalizedPhone: string) => {
    if (!currentUserRef.current) return [];
    return callFindSMSInvitesByPhone(normalizedPhone);
  }, []);

  const claimPendingSMSInvite = useCallback(async () => {
    try {
      const pendingInviteId = await AsyncStorage.getItem('pendingSMSInviteId');
      if (!pendingInviteId || !currentUserRef.current) return;

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
  }, [refreshConnectedPlayers, refreshNotifications]);

  // Context value with all the methods and data — memoized to prevent unnecessary re-renders
  // of all 22+ consumers. Functions are stable (useCallback with [] deps + refs) so they
  // won't cause the memo to recompute. Only actual state changes trigger a new context value.
  const contextValue = useMemo<DataContextType>(() => ({
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
    sendMatchRosterChangeNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    getNotificationsForMatch,
    sendPlayerInvite,
    isOutgoingInvitePending,
    respondToPlayerInvite,
    deleteNotification,
    clearAllNotifications,
    refreshMatches,
    refreshNotifications,
    refreshConnectedPlayers,
    invitePlayersBySMS,
    lookupContactsOnPickleGo,
    claimPendingSMSInvite,
    findSMSInvitesByPhone,
  }), [
    players, matches, deletedPlayers, currentUser, authLoading,
    hasCompletedOnboarding, completeOnboarding, notifications, unreadNotificationCount,
    addPlayer, removePlayer, addMatch, updateMatch, deleteMatch,
    updatePlayer, getPlayerName, invitePlayer, claimInvitation,
    getInvitedPlayers, isEmailAvailable, signIn, signInWithSocial,
    completeSocialSignUp, signOutUser, deleteAccount,
    sendMatchNotifications, sendMatchUpdateNotifications, sendMatchRosterChangeNotifications,
    markNotificationRead, markAllNotificationsRead, getNotificationsForMatch,
    sendPlayerInvite, isOutgoingInvitePending, respondToPlayerInvite, deleteNotification,
    clearAllNotifications, refreshMatches, refreshNotifications,
    refreshConnectedPlayers, invitePlayersBySMS, lookupContactsOnPickleGo,
    claimPendingSMSInvite,
    findSMSInvitesByPhone,
  ]);

  return <DataContext.Provider value={contextValue}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}; 