import type { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Idempotent bootstrap: applies schema.sql and seeds baseline data
 * (admin account, reward config, achievements, settings, first game,
 * and a handful of demo players so the leaderboard/landing page live).
 * Runs synchronously on first DB access.
 */
export function bootstrap(db: DatabaseSync) {
  const schema = fs.readFileSync(
    path.join(process.cwd(), "src", "server", "db", "schema.sql"),
    "utf8"
  );
  db.exec(schema);

  const seeded = db
    .prepare("SELECT value FROM settings WHERE key = 'seed_version'")
    .get() as { value: string } | undefined;
  const SEED_VERSION = "1";
  if (seeded?.value === SEED_VERSION) return;

  const now = new Date().toISOString();
  const uuid = () => crypto.randomUUID();
  const insUser = db.prepare(`INSERT INTO users
    (id, username, email, display_name, password_hash, role, status, referral_code, referred_by_id, last_login_at, created_at, updated_at)
    VALUES (@id, @username, @email, @display_name, @password_hash, @role, 'ACTIVE', @referral_code, NULL, @last_login_at, @created_at, @updated_at)`);
  const insProfile = db.prepare(`INSERT INTO profiles
    (user_id, avatar, bio, xp, balance, games_played, games_won, lifetime_earned, lifetime_spent, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  // ---- settings ----------------------------------------------------------
  const setSetting = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING"
  );
  setSetting.run("XP_BASE", "500"); // XP to clear level 1→2
  setSetting.run("XP_STEP", "250"); // extra XP required per level
  setSetting.run("WELCOME_BONUS", "WELCOME_BONUS"); // reward code used at signup

  // ---- admin-configurable rewards ---------------------------------------
  const insReward = db.prepare(`INSERT INTO rewards
    (code, label, description, arc_amount, xp_amount, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?, 'system', ?)
    ON CONFLICT(code) DO UPDATE SET label=excluded.label, description=excluded.description,
      arc_amount=excluded.arc_amount, xp_amount=excluded.xp_amount, updated_at=excluded.updated_at`);
  insReward.run("DAILY_LOGIN", "Daily Login", "Claimed once per day from the Earn page.", 100, 10, now);
  insReward.run("GAME_VICTORY", "Game Victory Floor", "Minimum reward for a winning game session.", 500, 0, now);
  insReward.run("CHALLENGE_WIN_DAILY", "Daily Challenge: Winner", "Awarded automatically on your first game win of the day.", 250, 25, now);
  insReward.run("REFERRAL_BONUS", "Referral Bonus (inviter)", "Awarded when an invited player creates an account.", 500, 50, now);
  insReward.run("REFERRAL_WELCOME", "Referral Welcome (invitee)", "Bonus for joining with an invite code.", 250, 0, now);
  insReward.run("WELCOME_BONUS", "Welcome Grant", "Starting grant for every new account.", 1000, 0, now);
  insReward.run("XP_GAME_PLAY", "XP: Playing a game", "XP granted for completing any game session.", 0, 25, now);
  insReward.run("XP_GAME_WIN", "XP: Winning a game", "Extra XP granted for a winning session.", 0, 75, now);
  insReward.run("EVENT_REWARD", "Event Reward", "Template for special event payouts.", 1000, 100, now);

  // ---- achievements -------------------------------------------------------
  const insAch = db.prepare(`INSERT INTO achievements
    (id, code, name, description, icon, criteria, xp_reward, arc_reward, sort_order, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(code) DO UPDATE SET name=excluded.name, description=excluded.description,
      icon=excluded.icon, criteria=excluded.criteria, xp_reward=excluded.xp_reward,
      arc_reward=excluded.arc_reward, updated_at=excluded.updated_at`);
  insAch.run(uuid(), "FIRST_WIN", "First Victory", "Win your first game.", "🏆", JSON.stringify({ type: "WINS", value: 1 }), 100, 250, 1, now, now);
  insAch.run(uuid(), "WIN_5_GAMES", "High Roller", "Win 5 games.", "🥇", JSON.stringify({ type: "WINS", value: 5 }), 250, 1000, 2, now, now);
  insAch.run(uuid(), "PLAY_10_GAMES", "Getting Warmed Up", "Play 10 games.", "🎮", JSON.stringify({ type: "GAMES", value: 10 }), 150, 500, 3, now, now);
  insAch.run(uuid(), "PLAY_100_GAMES", "Arcade Veteran", "Play 100 games.", "🕹️", JSON.stringify({ type: "GAMES", value: 100 }), 750, 5000, 4, now, now);
  insAch.run(uuid(), "EARN_10K_ARC", "Coin Collector", "Earn 10,000 ARC in total.", "💰", JSON.stringify({ type: "LIFETIME_EARNED", value: 10000 }), 200, 1000, 5, now, now);
  insAch.run(uuid(), "REACH_100K_ARC", "Arena Legend", "Hold 100,000 ARC at once.", "👑", JSON.stringify({ type: "BALANCE", value: 100000 }), 1000, 10000, 6, now, now);

  // ---- first game: COIN RUSH ---------------------------------------------
  db.prepare(`INSERT INTO games
    (id, slug, name, description, icon, thumbnail, difficulty, entry_cost, max_reward, engine, config, status, play_count, sort_order, created_at, updated_at)
    VALUES (?, 'coin-rush', 'COIN RUSH', ?, '🪙', NULL, 'MEDIUM', 500, 2500, 'coin-rush', ?, 'ACTIVE', 0, 1, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET updated_at=excluded.updated_at`).run(
    uuid(),
    "Tap the falling coins before they vanish. Gold coins are worth more — avoid the bombs. The faster and cleaner you play, the higher your reward tier.",
    JSON.stringify({
      durationSec: 30,
      spawnIntervalMs: 550,
      coinLifetimeMs: 1500,
      coinPoints: 1,
      goldChance: 0.14,
      goldPoints: 3,
      bombChance: 0.16,
      bombPoints: -4,
      winRatio: 0.65,
    }),
    now,
    now
  );

  // ---- admin account ------------------------------------------------------
  const adminPassword = process.env.ADMIN_PASSWORD ?? "ArenaAdmin!2026";
  const adminId = uuid();
  insUser.run({
    id: adminId,
    username: process.env.ADMIN_USERNAME ?? "admin",
    email: "admin@arena.local",
    display_name: "Arena Admin",
    password_hash: bcrypt.hashSync(adminPassword, 10),
    role: "ADMIN",
    referral_code: "ARENA-ADMIN",
    last_login_at: null,
    created_at: now,
    updated_at: now,
  });
  insProfile.run(adminId, "🛡️", "Platform administrator.", 0, 0, 0, 0, 0, 0, now, now);

  // ---- demo players (seeded so leaderboard/landing preview look alive) ---
  const demoPassword = bcrypt.hashSync("demo-player", 10);
  const demo = [
    { u: "nova", d: "Nova", a: "🌌", bal: 12850, earned: 31200, spent: 18350, played: 42, won: 21 },
    { u: "pixel", d: "PixelKing", a: "👾", bal: 9420, earned: 24800, spent: 15380, played: 38, won: 15 },
    { u: "raven", d: "Raven", a: "🦅", bal: 7210, earned: 18900, spent: 11690, played: 27, won: 11 },
    { u: "mite", d: "Mitea", a: "🐝", bal: 5330, earned: 12400, spent: 7070, played: 22, won: 8 },
    { u: "zephyr", d: "Zephyr", a: "🌪️", bal: 3180, earned: 8600, spent: 5420, played: 14, won: 5 },
  ];
  const insTx = db.prepare(`INSERT INTO transactions
    (id, user_id, amount, type, description, balance_after, game_session_id, day_key, meta, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`);
  const insGs = db.prepare(`INSERT INTO game_sessions
    (id, user_id, game_id, status, entry_cost, score, is_win, reward, xp_earned, started_at, finished_at)
    VALUES (?, ?, ?, 'COMPLETED', 500, ?, ?, ?, 100, ?, ?)`);
  const coinRush = db.prepare("SELECT id FROM games WHERE slug = 'coin-rush'").get() as { id: string };
  const insLb = db.prepare(`INSERT INTO leaderboard_entries
    (id, user_id, period, period_key, coins_earned, games_played, wins, xp, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, period, period_key) DO UPDATE SET coins_earned=excluded.coins_earned,
      games_played=excluded.games_played, wins=excluded.wins, xp=excluded.xp, updated_at=excluded.updated_at`);
  const weekKey = isoWeekKey(new Date());
  const monthKey = new Date().toISOString().slice(0, 7);

  for (const p of demo) {
    const id = uuid();
    const created = new Date(Date.now() - 1000 * 60 * 60 * 24 * (20 + Math.floor(Math.random() * 40)));
    insUser.run({
      id,
      username: p.u,
      email: `${p.u}@demo.arena.local`,
      display_name: p.d,
      password_hash: demoPassword,
      role: "PLAYER",
      referral_code: `AR-${p.u.toUpperCase()}-${id.slice(0, 4).toUpperCase()}`,
      last_login_at: new Date(Date.now() - 1000 * 60 * 60 * Math.random() * 96).toISOString(),
      created_at: created.toISOString(),
      updated_at: now,
    });
    insProfile.run(id, p.a, "Seeded demo player.", p.won * 100, p.bal, p.played, p.won, p.earned, p.spent, created.toISOString(), now);
    // A few representative ledger rows + sessions
    let bal = p.bal;
    for (let i = 0; i < 6; i++) {
      const isWin = i % 3 !== 2;
      const reward = isWin ? [250, 750, 1500, 2500][Math.floor(Math.random() * 4)] : 0;
      const at = new Date(Date.now() - 1000 * 60 * 60 * 24 * (i + 1)).toISOString();
      const gsId = uuid();
      insGs.run(gsId, id, coinRush.id, 120 + Math.floor(Math.random() * 130), isWin ? 1 : 0, reward, at, at);
      insTx.run(uuid(), id, -500, "GAME_ENTRY", "Game Entry — COIN RUSH", (bal -= 500), at);
      bal += reward;
      if (reward > 0) insTx.run(uuid(), id, reward, "GAME_REWARD", "Game Victory — COIN RUSH", bal, at);
    }
    const earnedPeriod = Math.round(p.earned * 0.2);
    insLb.run(uuid(), id, "ALL", "ALL", p.earned, p.played, p.won, p.won * 100, now);
    insLb.run(uuid(), id, "WEEKLY", weekKey, earnedPeriod, Math.max(1, Math.round(p.played * 0.2)), Math.round(p.won * 0.2), p.won * 20, now);
    insLb.run(uuid(), id, "MONTHLY", monthKey, Math.round(p.earned * 0.5), Math.round(p.played * 0.5), Math.round(p.won * 0.5), p.won * 50, now);
  }

  db.prepare("INSERT INTO settings (key, value) VALUES ('seed_version', ?)")
    .run(SEED_VERSION);
  console.log("[arena] database seeded (admin + demo players + COIN RUSH)");
}

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
