import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

export interface PlayerStats {
  totalMatches: number;
  wins: number;
  losses: number;
  winPercentage: number;
  totalGames?: number;
  gameWins?: number;
  gameLosses?: number;
  currentWinStreak?: number;
  bestWinStreak?: number;
}

export interface Player {
  id: string;
  name: string;
  email?: string;
  password?: string;
  rating?: number;
  phoneNumber?: string;
  profilePic?: string;
  matches?: string[];
  stats?: PlayerStats;
  createdAt: number;
  updatedAt: number;
  invitedBy?: string;
  pendingClaim?: boolean;
  isInvited?: boolean;
  authProvider?: 'email' | 'google' | 'apple';
  pushTokens?: string[];
  connections?: string[];
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  coords: Coordinates;
  placeId?: string;
  isFavorite: boolean;
  createdBy: string;
  createdAt: number;
  notes?: string;
}

export interface Game {
  team1Score: number;
  team2Score: number;
  winnerTeam: 1 | 2;
  team1PlayerIds?: string[];
  team2PlayerIds?: string[];
}

export interface Match {
  id: string;
  createdBy: string;
  createdAt: number;
  lastModifiedAt: number;
  lastModifiedBy: string;
  matchType: 'singles' | 'doubles';
  pointsToWin: number;
  numberOfGames: number;
  scheduledDate: string;
  location?: string;
  locationCoords?: Coordinates;
  status: 'scheduled' | 'completed' | 'expired';
  team1PlayerIds: string[];
  team2PlayerIds: string[];
  team1PlayerNames: string[];
  team2PlayerNames: string[];
  games: Game[];
  winnerTeam: 1 | 2 | null;
  allPlayerIds: string[];
  deletedByPlayerIds?: string[];
  notificationsSent?: boolean;
  randomizeTeamsPerGame?: boolean;
}

export type InviteResult = {
  type: 'invited' | 'existing_player' | 'invite_sent' | 'already_connected' | 'request_pending' | 'error';
  player?: Player;
};

export interface MatchNotification {
  id: string;
  type: 'match_invite' | 'player_invite' | 'invite_accepted';
  status: 'sent' | 'read' | 'accepted' | 'declined';
  recipientId: string;
  senderId: string;
  senderName: string;
  senderProfilePic?: string;
  matchId?: string;
  matchDate?: string;
  matchLocation?: string;
  matchType?: 'singles' | 'doubles';
  team?: 1 | 2;
  message?: string;
  createdAt: number;
  readAt?: number;
  respondedAt?: number;
}

export interface PushNotificationData {
  matchId?: string;
  screen?: string;
  notificationId?: string;
}

// Legacy type for migration from AsyncStorage
export interface LegacyMatch {
  id: string;
  date: string;
  players: string[];
  teams: {
    team1: string[];
    team2: string[];
  };
  location?: string;
  status: 'scheduled' | 'completed';
  winner?: string[] | number;
  score?: string | {
    team1: string | number;
    team2: string | number;
  };
  isDoubles: boolean;
  pointsToWin: number;
  numberOfGames: number;
}

export interface DataContextType {
  players: Player[];
  matches: Match[];
  deletedPlayers: Player[];
  currentUser: Player | null;
  authLoading: boolean;
  notifications: MatchNotification[];
  unreadNotificationCount: number;
  addPlayer: (player: Omit<Player, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Player>;
  removePlayer: (playerId: string) => Promise<boolean>;
  addMatch: (match: Omit<Match, 'id' | 'createdAt' | 'lastModifiedAt' | 'lastModifiedBy'>) => Promise<Match>;
  updateMatch: (matchId: string, updates: Partial<Match>) => Promise<void>;
  deleteMatch: (matchId: string) => Promise<void>;
  updatePlayer: (playerId: string, updates: Partial<Player>) => Promise<void>;
  getPlayerName: (playerId: string) => string;
  setCurrentUser: (player: Player | null) => void;
  invitePlayer: (name: string, email: string) => Promise<InviteResult>;
  claimInvitation: (email: string, playerData: Partial<Player>) => Promise<boolean>;
  getInvitedPlayers: () => Player[];
  isEmailAvailable: (email: string) => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithSocial: (provider: 'google' | 'apple') => Promise<{ needsName: boolean }>;
  completeSocialSignUp: (name: string, provider: 'google' | 'apple') => Promise<void>;
  signOutUser: () => Promise<void>;
  sendMatchNotifications: (match: Match) => Promise<{ sent: number; failed: number }>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  getNotificationsForMatch: (matchId: string) => MatchNotification[];
  sendPlayerInvite: (recipientId: string) => Promise<boolean>;
  respondToPlayerInvite: (notificationId: string, accept: boolean) => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
  refreshMatches: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  refreshConnectedPlayers: () => Promise<void>;
}

export type MainTabParamList = {
  Home: undefined;
  Players: undefined;
  Matches: undefined;
  AddMatch: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList>;
  AddMatch: {
    matchId?: string;
    isEditing?: boolean;
    rematch?: {
      team1PlayerIds: string[];
      team2PlayerIds: string[];
      pointsToWin: number;
      numberOfGames: number;
      location?: string;
      locationCoords?: Coordinates;
      isDoubles: boolean;
      randomizeTeamsPerGame?: boolean;
    };
  } | undefined;
  MatchDetails: { matchId: string };
  CompleteMatch: { matchId: string };
  PlayerStats: { playerId: string };
  Settings: undefined;
  Auth: undefined;
  EditProfile: undefined;
  CourtsDiscovery: undefined;
  Notifications: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export type MainTabScreenProps<T extends keyof MainTabParamList> = BottomTabScreenProps<
  MainTabParamList,
  T
>;
