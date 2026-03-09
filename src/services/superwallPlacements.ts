/**
 * Superwall placement constants.
 *
 * Each placement is a named trigger point in the app.
 * The Superwall dashboard decides which placements show paywalls,
 * which are gated vs non-gated, and which user segments see them.
 */
export const PLACEMENTS = {
  // Lifecycle (non-blocking, for contextual upsells)
  SESSION_START: 'SessionStart',
  ONBOARDING_COMPLETE: 'OnboardingComplete',

  // Match creation & completion
  MATCH_CREATE: 'MatchCreate',
  MATCH_CREATE_LIMIT: 'MatchCreateLimitReached',
  MATCH_COMPLETE: 'MatchComplete',

  // Feature access
  VIEW_STATS: 'ViewStats',
  VIEW_OPPONENT_ANALYSIS: 'ViewOpponentAnalysis',
  VIEW_PARTNER_ANALYSIS: 'ViewPartnerAnalysis',
  VIEW_COURTS_DISCOVERY: 'ViewCourtsDiscovery',
  VIEW_MATCH_HISTORY: 'ViewMatchHistory',

  // Actions
  REMATCH: 'Rematch',
  FILTER_STATS_BY_TIME: 'FilterStatsByTime',

  // Settings / profile
  SETTINGS_OPEN: 'SettingsOpen',
} as const;

export type PlacementName = (typeof PLACEMENTS)[keyof typeof PLACEMENTS];
