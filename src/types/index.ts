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
}

export interface Player {
  id: string;
  name: string;
  email: string;
  password: string;  // In a real app, this would be hashed
  rating?: number;   // Player's skill rating (1.0-5.0)
  phoneNumber?: string;
  profilePicture?: string;
  matches?: string[];  // Array of match IDs
  stats?: PlayerStats;
  createdAt: number;
  updatedAt: number;
  invitedBy?: string;  // ID of the player who invited this player
  pendingClaim?: boolean;  // Whether the player needs to claim their account
  isInvited?: boolean;  // Whether the player was invited to join
}

export interface Match {
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
  addPlayer: (player: Omit<Player, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  removePlayer: (playerId: string) => Promise<boolean>;
  addMatch: (match: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
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
}

export type MainTabParamList = {
  Home: undefined;
  Players: undefined;  // Renamed to be "My Stats" in the UI
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
};

export type RootStackScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export type MainTabScreenProps<T extends keyof MainTabParamList> = BottomTabScreenProps<
  MainTabParamList,
  T
>; 