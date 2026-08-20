/**
 * Client-safe types for the games hub and game clients. These mirror the
 * shapes returned by the backend game routes/services and must never import
 * from `src/server/*`. Reward/balance/XP values are ALWAYS read from the
 * server responses — the client never computes or trusts its own figures.
 */

export interface GameCard {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  thumbnail: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  entryCost: number;
  maxReward: number;
  engine: string;
  config: string;
  status: "ACTIVE" | "DISABLED";
  playCount: number;
  sortOrder: number;
}

/** Shape returned by GET /api/games. */
export interface GamesResponse {
  games: GameCard[];
  balance: number;
}

/** Shape returned by POST /api/games/[slug]/start. */
export interface StartedSession {
  sessionId: string;
  game: { slug: string; name: string; icon: string; entryCost: number; maxReward: number };
  engine: string;
  config: Record<string, unknown>;
  balance: number;
}

/** COIN RUSH engine config (server-provided on start). */
export interface CoinRushConfig {
  durationSec: number;
  spawnIntervalMs: number;
  coinLifetimeMs: number;
  coinPoints: number;
  goldChance: number;
  goldPoints: number;
  bombChance: number;
  bombPoints: number;
  winRatio: number;
}

export interface UnlockedAchievement {
  code: string;
  name: string;
  icon: string;
  arcReward: number;
  xpReward: number;
}

/** Shape returned by POST /api/games/[slug]/finish. */
export interface FinishResult {
  expired: boolean;
  score: number;
  maxScore: number;
  ratio: number;
  reward: number;
  isWin: boolean;
  xpEarned: number;
  balance: number;
  challengeAwarded: number;
  newAchievements: UnlockedAchievement[];
  levelUp: { from: number; to: number } | null;
  gameName: string;
}
