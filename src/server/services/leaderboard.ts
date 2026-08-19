import { run, all, get } from "@/server/db/client";
import { uuid, nowIso, weekKey, monthKey } from "@/server/lib/util";

export type LeaderboardPeriod = "ALL" | "WEEKLY" | "MONTHLY";

export function periodKeyFor(period: LeaderboardPeriod, at = new Date()): string {
  if (period === "ALL") return "ALL";
  if (period === "WEEKLY") return weekKey(at);
  return monthKey(at);
}

/**
 * Maintains materialized aggregates. Called inside the same transaction as
 * the coin/game event so the leaderboard can never drift from the ledger.
 */
export function recordLeaderboard(
  userId: string,
  delta: { coinsEarned?: number; gamesPlayed?: number; wins?: number; xp?: number }
) {
  const d = {
    coinsEarned: delta.coinsEarned ?? 0,
    gamesPlayed: delta.gamesPlayed ?? 0,
    wins: delta.wins ?? 0,
    xp: delta.xp ?? 0,
  };
  if (!d.coinsEarned && !d.gamesPlayed && !d.wins && !d.xp) return;
  const at = nowIso();
  for (const period of ["ALL", "WEEKLY", "MONTHLY"] as const) {
    const key = periodKeyFor(period);
    run(
      `INSERT INTO leaderboard_entries (id, user_id, period, period_key, coins_earned, games_played, wins, xp, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, period, period_key) DO UPDATE SET
         coins_earned = coins_earned + excluded.coins_earned,
         games_played = games_played + excluded.games_played,
         wins = wins + excluded.wins,
         xp = xp + excluded.xp,
         updated_at = excluded.updated_at`,
      uuid(),
      userId,
      period,
      key,
      d.coinsEarned,
      d.gamesPlayed,
      d.wins,
      d.xp,
      at
    );
  }
}

export type LeaderboardRow = {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  coins: number;
  gamesPlayed: number;
  wins: number;
  xp: number;
};

export function getLeaderboard(period: LeaderboardPeriod, limit = 50): LeaderboardRow[] {
  const key = periodKeyFor(period);
  return all<{
    user_id: string;
    username: string;
    display_name: string;
    avatar: string;
    coins_earned: number;
    games_played: number;
    wins: number;
    xp: number;
  }>(
    `SELECT le.user_id, u.username, u.display_name, p.avatar, le.coins_earned, le.games_played, le.wins, le.xp
     FROM leaderboard_entries le
     JOIN users u ON u.id = le.user_id AND u.status = 'ACTIVE'
     JOIN profiles p ON p.user_id = u.id
     WHERE le.period = ? AND le.period_key = ?
     ORDER BY le.coins_earned DESC, le.wins DESC, le.xp DESC
     LIMIT ?`,
    period,
    key,
    limit
  ).map((r, i) => ({
    rank: i + 1,
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatar: r.avatar,
    coins: r.coins_earned,
    gamesPlayed: r.games_played,
    wins: r.wins,
    xp: r.xp,
  }));
}

/** Current user's rank in a period (0 if unranked). */
export function getUserRank(userId: string, period: LeaderboardPeriod): number {
  const key = periodKeyFor(period);
  const row = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM leaderboard_entries le
     JOIN users u ON u.id = le.user_id AND u.status = 'ACTIVE'
     WHERE le.period = ? AND le.period_key = ?
       AND le.coins_earned > COALESCE((SELECT l2.coins_earned FROM leaderboard_entries l2
            WHERE l2.user_id = ? AND l2.period = ? AND l2.period_key = ?), 0)`,
    period,
    key,
    userId,
    period,
    key
  );
  const mine = get<{ coins_earned: number }>(
    `SELECT coins_earned FROM leaderboard_entries WHERE user_id = ? AND period = ? AND period_key = ?`,
    userId,
    period,
    key
  );
  if (!mine || mine.coins_earned <= 0) return 0;
  return (row?.n ?? 0) + 1;
}
