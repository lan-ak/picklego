import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

export interface Player {
  id: string;
  name: string;
  username?: string;      // Username for login
  password?: string;      // Password for authentication
  email?: string;         // Email address
  phoneNumber?: string;   // Phone number
  profilePic?: string;    // URL for profile picture
  rating?: number;        // Player rating (e.g., 1.0-5.0)
  isInvited?: boolean;    // Whether this is an invited player account
  invitedBy?: string;     // ID of the player who sent the invitation
  pendingClaim?: boolean; // Whether this player's data is waiting to be claimed
  stats: {
    totalMatches: number;
    wins: number;
    losses: number;
    winPercentage: number;
    totalGames?: number;
    gameWins?: number;
    gameLosses?: number;
  };
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
  addPlayer: (playerData: Omit<Player, 'id' | 'stats'>) => Promise<void>;
  removePlayer: (playerId: string) => Promise<boolean>;
  addMatch: (matchData: Omit<Match, 'id'>) => Promise<Match>;
  updateMatch: (matchId: string, updates: Partial<Match>) => Promise<void>;
  deleteMatch: (matchId: string) => Promise<void>;
  updatePlayer: (playerId: string, updates: Partial<Player>) => Promise<void>;
  getPlayerName: (playerId: string) => string;
  setCurrentUser: React.Dispatch<React.SetStateAction<Player | null>>;
  resetAllData: () => Promise<boolean>;
  invitePlayer: (name: string, email: string) => Promise<Player | null>;
  claimInvitation: (email: string, playerData: Partial<Player>) => Promise<boolean>;
  getInvitedPlayers: () => Player[];
  isEmailAvailable: (email: string) => Promise<boolean>;
  isUsernameAvailable: (username: string) => Promise<boolean>;
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