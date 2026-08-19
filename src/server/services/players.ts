import { get, run, all } from "@/server/db/client";
import { uuid, nowIso, dayKey, referralCodeFor } from "@/server/lib/util";
import { ERRORS } from "@/server/lib/errors";
import { hashPassword } from "@/server/auth/password";
import { applyCoinChange } from "./coins";
import { grantXp } from "./levels";
import { pushNotification } from "./notifications";
import { checkAchievements } from "./achievements";
import { getReward } from "./settings";
import { withTx } from "@/server/db/client";

export type PlayerProfile = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: "PLAYER" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED";
  avatar: string;
  bio: string;
  balance: number;
  xp: number;
  gamesPlayed: number;
  gamesWon: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  referralCode: string;
  referredById: string | null;
  createdAt: string;
};

function mapProfile(r: {
  id: string; username: string; email: string; display_name: string; role: string; status: string;
  avatar: string; bio: string; balance: number; xp: number; games_played: number; games_won: number;
  lifetime_earned: number; lifetime_spent: number; referral_code: string; referred_by_id: string | null;
  created_at: string;
}): PlayerProfile {
  return {
    id: r.id, username: r.username, email: r.email, displayName: r.display_name,
    role: r.role as "PLAYER" | "ADMIN", status: r.status as "ACTIVE" | "SUSPENDED",
    avatar: r.avatar, bio: r.bio, balance: r.balance, xp: r.xp,
    gamesPlayed: r.games_played, gamesWon: r.games_won,
    lifetimeEarned: r.lifetime_earned, lifetimeSpent: r.lifetime_spent,
    referralCode: r.referral_code, referredById: r.referred_by_id, createdAt: r.created_at,
  };
}

const PROFILE_SELECT = `SELECT u.id, u.username, u.email, u.display_name, u.role, u.status,
  u.referral_code, u.referred_by_id, u.created_at,
  p.avatar, p.bio, p.balance, p.xp, p.games_played, p.games_won, p.lifetime_earned, p.lifetime_spent
  FROM users u JOIN profiles p ON p.user_id = u.id`;

type ProfileRaw = {
  id: string; username: string; email: string; display_name: string; role: string; status: string;
  avatar: string; bio: string; balance: number; xp: number; games_played: number; games_won: number;
  lifetime_earned: number; lifetime_spent: number; referral_code: string; referred_by_id: string | null;
  created_at: string;
};

export function getProfile(userId: string): PlayerProfile | undefined {
  const row = get<ProfileRaw>(PROFILE_SELECT + ` WHERE u.id = ?`, userId);
  return row ? mapProfile(row) : undefined;
}

export type RegisterInput = {
  username: string;
  displayName: string;
  email: string;
  password: string;
  inviteCode?: string;
};

/**
 * Creates the account + profile, applies the welcome grant and referral
 * bonuses — all in one transaction. Coin grants never bypass the ledger.
 */
export function registerUser(input: RegisterInput): { userId: string; referralApplied: boolean } {
  return withTx(() => {
    const now = nowIso();
    const userId = uuid();

    const referrer = input.inviteCode
      ? get<{ id: string; username: string; status: string }>(
          `SELECT id, username, status FROM users WHERE UPPER(referral_code) = UPPER(?)`,
          input.inviteCode.trim()
        )
      : undefined;
    if (input.inviteCode && input.inviteCode.trim() !== "" && !referrer) {
      throw ERRORS.BAD_REQUEST("That invite code doesn't match any player.");
    }

    run(
      `INSERT INTO users (id, username, email, display_name, password_hash, role, status, referral_code, referred_by_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'PLAYER', 'ACTIVE', ?, ?, ?, ?)`,
      userId,
      input.username.toLowerCase(),
      input.email.toLowerCase(),
      input.displayName,
      hashPassword(input.password),
      referralCodeFor(input.username),
      referrer?.id ?? null,
      now,
      now
    );
    run(
      `INSERT INTO profiles (user_id, avatar, bio, xp, balance, games_played, games_won, lifetime_earned, lifetime_spent, created_at, updated_at)
       VALUES (?, '🎮', '', 0, 0, 0, 0, 0, 0, ?, ?)`,
      userId,
      now,
      now
    );

    // welcome grant (configurable via rewards table)
    const welcome = getReward("WELCOME_BONUS", 1000, 0);
    if (welcome.arc > 0) {
      applyCoinChange({
        userId,
        amount: welcome.arc,
        type: "WELCOME",
        description: "Welcome Grant",
        meta: { reward: "WELCOME_BONUS" },
      });
      pushNotification(userId, "DAILY_BONUS", `Welcome to the Arena!`, `Here's ${welcome.arc.toLocaleString()} ARC to get you started.`);
    }

    // referral bonuses
    let referralApplied = false;
    if (referrer) {
      const inviter = getReward("REFERRAL_BONUS", 500, 50);
      const invitee = getReward("REFERRAL_WELCOME", 250, 0);
      if (inviter.arc > 0) {
        applyCoinChange({
          userId: referrer.id,
          amount: inviter.arc,
          type: "REFERRAL",
          description: `Referral Bonus — ${input.displayName} joined`,
          meta: { referred: userId },
        });
        if (inviter.xp > 0) grantXp(referrer.id, inviter.xp);
        pushNotification(referrer.id, "REFERRAL", `Referral bonus +${inviter.arc.toLocaleString()} ARC`, `${input.displayName} joined using your invite code.`);
      }
      if (invitee.arc > 0) {
        applyCoinChange({
          userId,
          amount: invitee.arc,
          type: "REFERRAL",
          description: `Invite Bonus — invited by ${referrer.username}`,
          meta: { referrer: referrer.id },
        });
      }
      checkAchievements(referrer.id);
      referralApplied = true;
    }

    return { userId, referralApplied };
  });
}

export function updateProfile(
  userId: string,
  patch: { displayName?: string; avatar?: string; bio?: string }
) {
  // display_name lives on `users`; avatar/bio live on `profiles`.
  // Only these whitelisted fields are ever written — callers cannot touch
  // balance, XP, role or any other column through this function.
  if (patch.displayName !== undefined) {
    run(`UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?`, patch.displayName, nowIso(), userId);
  }
  const profileSets: string[] = [];
  const params: (string | number | null)[] = [];
  if (patch.avatar !== undefined) {
    profileSets.push("avatar = ?");
    params.push(patch.avatar);
  }
  if (patch.bio !== undefined) {
    profileSets.push("bio = ?");
    params.push(patch.bio);
  }
  if (profileSets.length > 0) {
    run(
      `UPDATE profiles SET ${profileSets.join(", ")}, updated_at = ? WHERE user_id = ?`,
      ...params,
      nowIso(),
      userId
    );
  }
}

export function findByLogin(login: string) {
  return get<{ id: string; username: string; password_hash: string; status: string; role: string }>(
    `SELECT id, username, password_hash, status, role FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE`,
    login.trim(),
    login.trim()
  );
}

export function touchLogin(userId: string) {
  run(`UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), userId);
}

// ---- earn page data -------------------------------------------------------

export function dailyBonusStatus(userId: string): { claimedToday: boolean; lastClaimAt: string | null } {
  const row = get<{ created_at: string }>(
    `SELECT created_at FROM transactions WHERE user_id = ? AND type = 'DAILY_BONUS' ORDER BY created_at DESC LIMIT 1`,
    userId
  );
  const claimedToday = row ? row.created_at.slice(0, 10) === dayKey() : false;
  return { claimedToday, lastClaimAt: row?.created_at ?? null };
}

export function claimDailyBonus(userId: string): { amount: number; xp: number; balance: number } {
  return withTx(() => {
    const reward = getReward("DAILY_LOGIN", 100, 10);
    const res = applyCoinChange({
      userId,
      amount: reward.arc,
      type: "DAILY_BONUS",
      description: "Daily Login Bonus",
      dayKey: dayKey(),
      meta: { reward: "DAILY_LOGIN" },
    });
    if (reward.xp > 0) grantXp(userId, reward.xp);
    pushNotification(userId, "DAILY_BONUS", `Daily bonus: +${reward.arc.toLocaleString()} ARC`, "Nice to see you back in the Arena.");
    checkAchievements(userId);
    return { amount: reward.arc, xp: reward.xp, balance: res.balance };
  });
}

export function dailyWinChallengeStatus(userId: string): { claimedToday: boolean; winsToday: number } {
  const claimed = get<{ id: string }>(
    `SELECT id FROM transactions WHERE user_id = ? AND type = 'CHALLENGE' AND day_key = ?`,
    userId,
    dayKey()
  );
  const startOfDay = dayKey() + "T00:00:00.000Z";
  const wins = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM game_sessions WHERE user_id = ? AND is_win = 1 AND started_at >= ?`,
    userId,
    startOfDay
  );
  return { claimedToday: !!claimed, winsToday: wins?.n ?? 0 };
}

export function referralStats(userId: string) {
  const count = get<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE referred_by_id = ?`, userId)?.n ?? 0;
  return { count };
}

export function winRateStats(userId: string) {
  const p = get<{ games_played: number; games_won: number }>(
    `SELECT games_played, games_won FROM profiles WHERE user_id = ?`,
    userId
  );
  return {
    gamesPlayed: p?.games_played ?? 0,
    gamesWon: p?.games_won ?? 0,
    winRate: p && p.games_played > 0 ? Math.round((p.games_won / p.games_played) * 100) : 0,
  };
}
