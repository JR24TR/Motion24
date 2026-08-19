import { get, all, run } from "@/server/db/client";
import { uuid, nowIso } from "@/server/lib/util";
import { applyCoinChange } from "./coins";
import { grantXp } from "./levels";
import { pushNotification } from "./notifications";

type Criteria =
  | { type: "WINS"; value: number }
  | { type: "GAMES"; value: number }
  | { type: "LIFETIME_EARNED"; value: number }
  | { type: "BALANCE"; value: number };

type AchievementDef = {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  criteria: Criteria;
  xpReward: number;
  arcReward: number;
  sortOrder: number;
};

export type AchievementView = AchievementDef & {
  unlockedAt: string | null;
  progress: number; // 0..1
  currentValue: number;
  target: number;
};

function parseCriteria(json: string): Criteria {
  try {
    const c = JSON.parse(json) as Criteria;
    if (["WINS", "GAMES", "LIFETIME_EARNED", "BALANCE"].includes(c.type)) return c;
  } catch {
    /* fall through */
  }
  return { type: "GAMES", value: 1 };
}

function defs(): AchievementDef[] {
  return all<{
    id: string;
    code: string;
    name: string;
    description: string;
    icon: string;
    criteria: string;
    xp_reward: number;
    arc_reward: number;
    sort_order: number;
  }>(
    `SELECT id, code, name, description, icon, criteria, xp_reward, arc_reward, sort_order
     FROM achievements WHERE active = 1 ORDER BY sort_order`
  ).map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    icon: r.icon,
    criteria: parseCriteria(r.criteria),
    xpReward: r.xp_reward,
    arcReward: r.arc_reward,
    sortOrder: r.sort_order,
  }));
}

function currentValueFor(userId: string, c: Criteria): number {
  if (c.type === "BALANCE" || c.type === "LIFETIME_EARNED") {
    const p = get<{ balance: number; lifetime_earned: number }>(
      `SELECT balance, lifetime_earned FROM profiles WHERE user_id = ?`,
      userId
    );
    if (!p) return 0;
    return c.type === "BALANCE" ? p.balance : p.lifetime_earned;
  }
  const p = get<{ games_played: number; games_won: number }>(
    `SELECT games_played, games_won FROM profiles WHERE user_id = ?`,
    userId
  );
  if (!p) return 0;
  return c.type === "WINS" ? p.games_won : p.games_played;
}

export function listAchievementsFor(userId: string): AchievementView[] {
  const unlocked = new Map(
    all<{ achievement_id: string; unlocked_at: string }>(
      `SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ?`,
      userId
    ).map((r) => [r.achievement_id, r.unlocked_at])
  );
  return defs().map((d) => {
    const current = currentValueFor(userId, d.criteria);
    const at = unlocked.get(d.id) ?? null;
    return {
      ...d,
      unlockedAt: at,
      currentValue: current,
      target: d.criteria.value,
      progress: at ? 1 : Math.min(1, d.criteria.value > 0 ? current / d.criteria.value : 1),
    };
  });
}

export type UnlockedAchievement = {
  code: string;
  name: string;
  icon: string;
  arcReward: number;
  xpReward: number;
};

/**
 * Evaluates every active achievement against live stats and unlocks any
 * that qualify. Runs inside the caller's transaction; each unlock writes
 * its own ledger row, XP grant and notification atomically.
 */
export function checkAchievements(userId: string): UnlockedAchievement[] {
  const locked = all<{ id: string; code: string; name: string; icon: string; criteria: string; xp_reward: number; arc_reward: number }>(
    `SELECT a.id, a.code, a.name, a.icon, a.criteria, a.xp_reward, a.arc_reward
     FROM achievements a
     WHERE a.active = 1
       AND NOT EXISTS (SELECT 1 FROM user_achievements ua WHERE ua.user_id = ? AND ua.achievement_id = a.id)`,
    userId
  );
  const unlocked: UnlockedAchievement[] = [];
  for (const a of locked) {
    const criteria = parseCriteria(a.criteria);
    const current = currentValueFor(userId, criteria);
    if (current < criteria.value) continue;

    run(
      `INSERT OR IGNORE INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)`,
      userId,
      a.id,
      nowIso()
    );
    if (a.arc_reward > 0) {
      applyCoinChange({
        userId,
        amount: a.arc_reward,
        type: "ACHIEVEMENT",
        description: `Achievement Unlocked — ${a.name}`,
        meta: { achievement: a.code },
      });
    }
    if (a.xp_reward > 0) grantXp(userId, a.xp_reward);
    pushNotification(
      userId,
      "ACHIEVEMENT",
      `Achievement unlocked: ${a.name}`,
      a.arc_reward > 0 ? `+${a.arc_reward.toLocaleString()} ARC and +${a.xp_reward} XP.` : `+${a.xp_reward} XP.`
    );
    unlocked.push({
      code: a.code,
      name: a.name,
      icon: a.icon,
      arcReward: a.arc_reward,
      xpReward: a.xp_reward,
    });
  }
  return unlocked;
}
