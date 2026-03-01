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
  addPlayer: (player: Omit<Player, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Player>;
  removePlayer: (playerId: string) => Promise<boolean>;
  addMatch: (match: Omit<Match, 'id' | 'createdAt' | 'lastModifiedAt' | 'lastModifiedBy'>) => Promise<Match>;
  updateMatch: (matchId: string, updates: Partial<Match>) => Promise<void>;
  deleteMatch: (matchId: string) => Promise<void>;
  updatePlayer: (playerId: string, updates: Partial<Player>) => Promise<void>;
  getPlayerName: (playerId: string) => string;
  setCurrentUser: (player: Player | null) => void;
  resetAllData: () => Promise<boolean>;
  invitePlayer: (name: string, email: string) => Promise<Player | null>;
  claimInvitation: (email: string, playerData: Partial<Player>) => Promise<boolean>;
  getInvitedPlayers: () => Player[];
  isEmailAvailable: (email: string) => Promise<boolean>;
  insertDummyData: () => Promise<boolean>;
  signIn: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
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
  AddMatch: { matchId?: string; isEditing?: boolean } | undefined;
  MatchDetails: { matchId: string };
  CompleteMatch: { matchId: string };
  PlayerStats: { playerId: string };
  Settings: undefined;
  Auth: undefined;
  EditProfile: undefined;
  PrivacyPolicy: undefined;
  CourtsDiscovery: undefined;
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export type MainTabScreenProps<T extends keyof MainTabParamList> = BottomTabScreenProps<
  MainTabParamList,
  T
>;
