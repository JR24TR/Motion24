/**
 * Client-safe types for transactions, leaderboard and profile. Mirrors the
 * shapes returned by the backend routes/services. Never imports from
 * `src/server/*`. Balances, XP, ranks and roles are always read from server
 * responses — never trusted from or set by the client.
 */

// ---- transactions ---------------------------------------------------------

export type TxType =
  | "EARN"
  | "SPEND"
  | "GAME_ENTRY"
  | "GAME_REWARD"
  | "DAILY_BONUS"
  | "ACHIEVEMENT"
  | "REFERRAL"
  | "ADMIN_ADJUSTMENT"
  | "CHALLENGE"
  | "REFUND"
  | "WELCOME"
  | "EVENT";

export interface Transaction {
  id: string;
  amount: number;
  type: TxType;
  description: string;
  balanceAfter: number;
  gameSessionId: string | null;
  createdAt: string;
}

export interface TransactionsResponse {
  rows: Transaction[];
  total: number;
  page: number;
  pageSize: number;
}

// ---- leaderboard ----------------------------------------------------------

export type LeaderboardPeriod = "ALL" | "WEEKLY" | "MONTHLY";

export interface LeaderboardRow {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  coins: number;
  gamesPlayed: number;
  wins: number;
  xp: number;
}

export interface LeaderboardResponse {
  period: LeaderboardPeriod;
  rows: LeaderboardRow[];
  myRank: number;
}

// ---- profile / dashboard --------------------------------------------------

export interface ProfileLevel {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number;
}

export interface PlayerProfileView {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: "PLAYER" | "ADMIN";
  avatar: string;
  bio: string;
  balance: number;
  xp: number;
  gamesPlayed: number;
  gamesWon: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  referralCode: string;
  createdAt: string;
}

export interface DashboardResponse {
  profile: PlayerProfileView;
  level: ProfileLevel;
  rank: number;
  balance: number;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  coinsEarned: number;
  coinsSpent: number;
  unlockedCount: number;
  totalAchievements: number;
  recentTransactions: Transaction[];
  recentAchievements: { code: string; name: string; icon: string; unlockedAt: string }[];
  recentGames: {
    id: string;
    status: string;
    score: number | null;
    isWin: boolean;
    reward: number;
    xpEarned: number;
    startedAt: string;
    game: { slug: string; name: string; icon: string; difficulty: string };
  }[];
}

export interface MeResponse {
  user: {
    id: string;
    username: string;
    displayName: string;
    role: "PLAYER" | "ADMIN";
    avatar: string;
  };
  balance: number;
  level: ProfileLevel;
  unreadNotifications: number;
}

// ---- earn ----------------------------------------------------------------

export interface DailyReward {
  amount: number;
  xp: number;
  claimedToday: boolean;
  lastClaimAt: string | null;
}

export interface DailyWinChallenge {
  amount: number;
  xp: number;
  claimedToday: boolean;
  winsToday: number;
}

export interface EarnResponse {
  balance: number;
  referralCode: string;
  daily: DailyReward;
  victoryFloor: number;
  dailyWinChallenge: DailyWinChallenge;
  referral: { count: number; bonus: number; welcome: number };
  winRate: { gamesPlayed: number; gamesWon: number; winRate: number };
}

/** Shape returned by POST /api/rewards/daily/claim. */
export interface DailyClaimResponse {
  amount: number;
  xp: number;
  balance: number;
}

// ---- achievements --------------------------------------------------------

export interface AchievementView {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  arcReward: number;
  sortOrder: number;
  unlockedAt: string | null;
  progress: number; // 0..1
  currentValue: number;
  target: number;
}

export interface AchievementsResponse {
  achievements: AchievementView[];
}

// ---- notifications -------------------------------------------------------

export type NotificationType =
  | "DAILY_BONUS"
  | "GAME_REWARD"
  | "ACHIEVEMENT"
  | "LEVEL_UP"
  | "REFERRAL"
  | "CHALLENGE"
  | "ANNOUNCEMENT"
  | "ADMIN";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  unread: number;
}

