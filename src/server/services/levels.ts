import { all, get, run } from "@/server/db/client";
import { uuid, nowIso, weekKey, monthKey } from "@/server/lib/util";
import { getSettingInt } from "./settings";
import { pushNotification } from "./notifications";

export type LevelInfo = {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number; // 0..1
};

/** XP required to go from level L to L+1 (arithmetic curve, admin configurable). */
export function xpForLevelStep(level: number): number {
  const base = getSettingInt("XP_BASE", 500);
  const step = getSettingInt("XP_STEP", 250);
  return base + step * (level - 1);
}

export function getLevelInfo(xp: number): LevelInfo {
  let level = 1;
  let remaining = xp;
  while (level < 500) {
    const need = xpForLevelStep(level);
    if (remaining < need) break;
    remaining -= need;
    level += 1;
  }
  const need = xpForLevelStep(level);
  return {
    level,
    xp,
    xpIntoLevel: remaining,
    xpForNextLevel: need,
    progress: Math.min(1, need > 0 ? remaining / need : 1),
  };
}

/**
 * Grants XP inside the current transaction. Returns new level info and
 * whether the player leveled up (caller shows the notification, or pass
 * notify=true to write it here).
 */
export function grantXp(
  userId: string,
  amount: number,
  opts: { notify?: boolean } = {}
): { before: LevelInfo; after: LevelInfo; leveledUp: boolean } {
  if (amount <= 0) {
    const cur = get<{ xp: number }>(`SELECT xp FROM profiles WHERE user_id = ?`, userId);
    const info = getLevelInfo(cur?.xp ?? 0);
    return { before: info, after: info, leveledUp: false };
  }
  const profile = get<{ xp: number }>(`SELECT xp FROM profiles WHERE user_id = ?`, userId);
  if (!profile) return { before: getLevelInfo(0), after: getLevelInfo(0), leveledUp: false };
  const before = getLevelInfo(profile.xp);
  const newXp = profile.xp + amount;
  run(`UPDATE profiles SET xp = ?, updated_at = ? WHERE user_id = ?`, newXp, nowIso(), userId);
  run(
    `INSERT INTO leaderboard_entries (id, user_id, period, period_key, coins_earned, games_played, wins, xp, updated_at)
     VALUES (?, ?, 'ALL', 'ALL', 0, 0, 0, ?, ?)
     ON CONFLICT(user_id, period, period_key) DO UPDATE SET xp = xp + excluded.xp, updated_at = excluded.updated_at`,
    uuid(),
    userId,
    amount,
    nowIso()
  );
  bumpPeriodXp(userId, "WEEKLY", weekKey(), amount);
  bumpPeriodXp(userId, "MONTHLY", monthKey(), amount);
  const after = getLevelInfo(newXp);
  if (opts.notify && after.level > before.level) {
    pushNotification(userId, "LEVEL_UP", `Level ${after.level} reached!`, `You now have ${newXp.toLocaleString()} XP. Keep playing to level up again.`);
  }
  return { before, after, leveledUp: after.level > before.level };
}

function bumpPeriodXp(userId: string, period: "WEEKLY" | "MONTHLY", key: string, amount: number) {
  run(
    `INSERT INTO leaderboard_entries (id, user_id, period, period_key, coins_earned, games_played, wins, xp, updated_at)
     VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?)
     ON CONFLICT(user_id, period, period_key) DO UPDATE SET xp = xp + excluded.xp, updated_at = excluded.updated_at`,
    uuid(),
    userId,
    period,
    key,
    amount,
    nowIso()
  );
}

/** Public helper used by profile/dashboard pages. */
export function getProfileLevel(userId: string): LevelInfo {
  const row = get<{ xp: number }>(`SELECT xp FROM profiles WHERE user_id = ?`, userId);
  return getLevelInfo(row?.xp ?? 0);
}

export function leaderboardXpLeaders(limit = 10) {
  return all(`SELECT user_id, xp FROM leaderboard_entries WHERE period='ALL' AND period_key='ALL' ORDER BY xp DESC LIMIT ?`, limit);
}
