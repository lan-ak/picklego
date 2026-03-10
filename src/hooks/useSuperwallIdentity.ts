import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useUser, useSuperwall } from 'expo-superwall';
import { useData } from '../context/DataContext';

/**
 * Syncs Firebase Auth identity and user attributes to Superwall.
 *
 * - Calls identify() when a user logs in
 * - Calls signOut() when a user logs out
 * - Updates 25+ user attributes whenever currentUser or matches change,
 *   making them available as audience filters in the Superwall dashboard
 *
 * Must be rendered inside both <SuperwallProvider> and <DataProvider>.
 */
export function useSuperwallIdentity() {
  const { identify, signOut: swSignOut, update } = useUser();
  const isConfigured = useSuperwall((s) => s.isConfigured);
  const { currentUser, matches } = useData();
  const prevUserIdRef = useRef<string | null>(null);

  // Store update in a ref to keep the attributes effect stable
  const updateRef = useRef(update);
  useEffect(() => { updateRef.current = update; }, [update]);

  // Identify / reset user when auth state changes
  useEffect(() => {
    if (!isConfigured) return;

    const userId = currentUser?.id ?? null;

    if (userId && userId !== prevUserIdRef.current) {
      identify(userId);
    } else if (!userId && prevUserIdRef.current) {
      swSignOut();
    }

    prevUserIdRef.current = userId;
  }, [isConfigured, currentUser?.id, identify, swSignOut]);

  // Sync attributes whenever user data or matches change
  useEffect(() => {
    if (!isConfigured || !currentUser) return;

    const completedMatches = matches.filter((m) => m.status === 'completed');
    const scheduledMatches = matches.filter((m) => m.status === 'scheduled');
    const singlesMatches = matches.filter((m) => m.matchType === 'singles');
    const doublesMatches = matches.filter((m) => m.matchType === 'doubles');
    const daysSinceSignup = Math.floor(
      (Date.now() - currentUser.createdAt) / (1000 * 60 * 60 * 24),
    );

    updateRef.current({
      // Profile
      name: currentUser.name,
      email: currentUser.email ?? '',
      auth_provider: currentUser.authProvider ?? 'email',
      rating: currentUser.rating ?? 0,
      has_profile_pic: !!currentUser.profilePic,

      // Engagement
      total_matches: matches.length,
      completed_matches: completedMatches.length,
      scheduled_matches: scheduledMatches.length,
      singles_matches: singlesMatches.length,
      doubles_matches: doublesMatches.length,

      // Performance
      win_rate: currentUser.stats?.winPercentage ?? 0,
      total_wins: currentUser.stats?.wins ?? 0,
      total_losses: currentUser.stats?.losses ?? 0,
      current_win_streak: currentUser.stats?.currentWinStreak ?? 0,
      best_win_streak: currentUser.stats?.bestWinStreak ?? 0,

      // Social
      connections_count: currentUser.connections?.length ?? 0,
      has_connections: (currentUser.connections?.length ?? 0) > 0,

      // Lifecycle
      account_created_at: new Date(currentUser.createdAt).toISOString(),
      days_since_signup: daysSinceSignup,
      is_new_user: daysSinceSignup <= 3,
      platform: Platform.OS,

      // App usage
      uses_team_randomization: matches.some((m) => m.randomizeTeamsPerGame),
      favorite_match_type:
        matches.length > 0
          ? doublesMatches.length > matches.length / 2
            ? 'doubles'
            : 'singles'
          : 'none',
    });
  }, [isConfigured, currentUser, matches]);
}
