import { get, all } from "@/server/db/client";
import { listTransactions } from "./coins";
import { getLeaderboard, getUserRank } from "./leaderboard";
import { getLevelInfo } from "./levels";
import { listAchievementsFor } from "./achievements";
import type { SessionUser } from "@/server/auth/session";
import { getProfile } from "./players";

/** Everything the player dashboard needs, in one call. */
export function playerDashboard(user: SessionUser) {
  const profile = getProfile(user.id)!;
  const level = getLevelInfo(profile.xp);
  const rank = getUserRank(user.id, "ALL");
  const tx = listTransactions(user.id, { limit: 5 });
  const achievements = listAchievementsFor(user.id);
  const recent = achievements.filter((a) => a.unlockedAt).sort((a, b) => (a.unlockedAt! < b.unlockedAt! ? 1 : -1)).slice(0, 4);
  const nextUp = achievements.filter((a) => !a.unlockedAt).slice(0, 3);
  return {
    profile,
    level,
    rank,
    balance: profile.balance,
    gamesPlayed: profile.gamesPlayed,
    gamesWon: profile.gamesWon,
    winRate: profile.gamesPlayed > 0 ? Math.round((profile.gamesWon / profile.gamesPlayed) * 100) : 0,
    coinsEarned: profile.lifetimeEarned,
    coinsSpent: profile.lifetimeSpent,
    recentTransactions: tx.rows,
    recentAchievements: recent,
    nextAchievements: nextUp,
    unlockedCount: achievements.filter((a) => a.unlockedAt).length,
    totalAchievements: achievements.length,
  };
}

/** Public platform stats for the landing page (no personal data). */
export function publicPlatformStats() {
  const players = get<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE role = 'PLAYER'`)?.n ?? 0;
  const games = get<{ n: number }>(`SELECT COUNT(*) AS n FROM games WHERE status = 'ACTIVE'`)?.n ?? 0;
  const played = get<{ n: number }>(`SELECT COALESCE(SUM(play_count), 0) AS n FROM games`)?.n ?? 0;
  const arcOut = get<{ n: number }>(`SELECT COALESCE(SUM(balance), 0) AS n FROM profiles`)?.n ?? 0;
  return { players, games, played, arcOut };
}

/** Admin dashboard stats. */
export function adminStats() {
  const totalUsers = get<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE role = 'PLAYER'`)?.n ?? 0;
  const activeUsers =
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM users WHERE role='PLAYER' AND status='ACTIVE' AND last_login_at >= ?`,
      new Date(Date.now() - 7 * 86400_000).toISOString()
    )?.n ?? 0;
  const suspended = get<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE status = 'SUSPENDED'`)?.n ?? 0;
  const circulating = get<{ n: number }>(`SELECT COALESCE(SUM(balance),0) AS n FROM profiles`)?.n ?? 0;
  const earned = get<{ n: number }>(`SELECT COALESCE(SUM(amount),0) AS n FROM transactions WHERE amount > 0`)?.n ?? 0;
  const spent = get<{ n: number }>(`SELECT COALESCE(SUM(amount),0) AS n FROM transactions WHERE amount < 0`)?.n ?? 0;
  const gamesPlayed = get<{ n: number }>(`SELECT COUNT(*) AS n FROM game_sessions`)?.n ?? 0;
  const gamesCompleted = get<{ n: number }>(`SELECT COUNT(*) AS n FROM game_sessions WHERE status = 'COMPLETED'`)?.n ?? 0;

  const topPlayers = getLeaderboard("ALL", 5);
  const recentTransactions = all<{
    id: string; amount: number; type: string; description: string; created_at: string; username: string; avatar: string;
  }>(
    `SELECT t.id, t.amount, t.type, t.description, t.created_at, u.username, p.avatar
     FROM transactions t
     JOIN users u ON u.id = t.user_id
     JOIN profiles p ON p.user_id = u.id
     ORDER BY t.created_at DESC LIMIT 10`
  );
  return { totalUsers, activeUsers, suspended, circulating, earned, spent: Math.abs(spent), gamesPlayed, gamesCompleted, topPlayers, recentTransactions };
}
