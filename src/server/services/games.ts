import { get, run, all } from "@/server/db/client";
import { uuid, nowIso, dayKey } from "@/server/lib/util";
import { ERRORS } from "@/server/lib/errors";
import { applyCoinChange } from "./coins";
import { grantXp } from "./levels";
import { recordLeaderboard } from "./leaderboard";
import { checkAchievements, UnlockedAchievement } from "./achievements";
import { pushNotification } from "./notifications";
import { getReward } from "./settings";
import { getEngine, parseEngineConfig } from "@/server/games/engines";
import { withTx } from "@/server/db/client";

export type GameRow = {
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
};

type GameRaw = {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  thumbnail: string | null;
  difficulty: string;
  entry_cost: number;
  max_reward: number;
  engine: string;
  config: string;
  status: string;
  play_count: number;
  sort_order: number;
};

function mapGame(r: GameRaw): GameRow {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    icon: r.icon,
    thumbnail: r.thumbnail,
    difficulty: r.difficulty as GameRow["difficulty"],
    entryCost: r.entry_cost,
    maxReward: r.max_reward,
    engine: r.engine,
    config: r.config,
    status: r.status as GameRow["status"],
    playCount: r.play_count,
    sortOrder: r.sort_order,
  };
}

export function listGames(opts: { activeOnly?: boolean } = {}): GameRow[] {
  const where = opts.activeOnly ? "WHERE status = 'ACTIVE'" : "";
  return all<GameRaw>(
    `SELECT id, slug, name, description, icon, thumbnail, difficulty, entry_cost, max_reward, engine, status, play_count, sort_order
     FROM games ${where} ORDER BY sort_order, created_at`
  ).map(mapGame);
}

export function getGameBySlug(slug: string): GameRow | undefined {
  return mapGame(
    get<GameRaw>(
      `SELECT id, slug, name, description, icon, thumbnail, difficulty, entry_cost, max_reward, engine, status, play_count, sort_order
       FROM games WHERE slug = ?`,
      slug
    ) as GameRaw
  );
}

/** Forfeit sessions abandoned mid-play (older than 10 minutes). */
function expireStaleSessions(userId: string) {
  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  run(
    `UPDATE game_sessions SET status = 'ABANDONED', finished_at = ?
     WHERE user_id = ? AND status = 'ACTIVE' AND started_at < ?`,
    nowIso(),
    userId,
    cutoff
  );
}

export type StartedSession = {
  sessionId: string;
  game: { slug: string; name: string; icon: string; entryCost: number; maxReward: number };
  engine: string;
  config: Record<string, unknown>;
  balance: number;
};

/**
 * Starts a game: verifies the game, checks + deducts the entry fee and
 * creates the session in ONE transaction. If anything fails the deduction
 * is rolled back — coins can never be lost to a failed session.
 */
export function startGameSession(userId: string, slug: string): StartedSession {
  return withTx(() => {
    expireStaleSessions(userId);
    const game = getGameBySlug(slug);
    if (!game || game.status !== "ACTIVE") throw ERRORS.NOT_FOUND("game");

    const engine = getEngine(game.engine);
    if (!engine) throw ERRORS.NOT_FOUND("game");

    const balance = get<{ balance: number }>(`SELECT balance FROM profiles WHERE user_id = ?`, userId);
    const bal = balance?.balance ?? 0;
    if (bal < game.entryCost) throw ERRORS.INSUFFICIENT_FUNDS(game.entryCost, bal);

    const sessionId = uuid();
    if (game.entryCost > 0) {
      applyCoinChange({
        userId,
        amount: -game.entryCost,
        type: "GAME_ENTRY",
        description: `Game Entry — ${game.name}`,
        gameSessionId: sessionId,
      });
    }
    run(
      `INSERT INTO game_sessions (id, user_id, game_id, status, entry_cost, started_at)
       VALUES (?, ?, ?, 'ACTIVE', ?, ?)`,
      sessionId,
      userId,
      game.id,
      game.entryCost,
      nowIso()
    );
    run(`UPDATE games SET play_count = play_count + 1, updated_at = ? WHERE id = ?`, nowIso(), game.id);

    const config = parseEngineConfig(game.engine, game.config);
    return {
      sessionId,
      game: {
        slug: game.slug,
        name: game.name,
        icon: game.icon,
        entryCost: game.entryCost,
        maxReward: game.maxReward,
      },
      engine: game.engine,
      config: engine.clientConfig(config),
      balance: getBalanceLocal(userId),
    };
  });
}

function getBalanceLocal(userId: string): number {
  return get<{ balance: number }>(`SELECT balance FROM profiles WHERE user_id = ?`, userId)?.balance ?? 0;
}

export type FinishResult = {
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
};

/**
 * Finishes a game session. The client submits only a score — the server
 * validates elapsed time, clamps the score to the engine's theoretical
 * maximum, computes the reward tier, and pays out atomically.
 */
export function finishGameSession(userId: string, sessionId: string, submittedScore: number): FinishResult {
  return withTx(() => {
    const row = get<{
      id: string;
      status: string;
      started_at: string;
      entry_cost: number;
      game_id: string;
    }>(
      `SELECT id, status, started_at, entry_cost, game_id FROM game_sessions
       WHERE id = ? AND user_id = ?`,
      sessionId,
      userId
    );
    if (!row || row.status !== "ACTIVE") throw ERRORS.SESSION_INVALID();

    const gameRaw = get<GameRaw>(`SELECT id, slug, name, description, icon, thumbnail, difficulty, entry_cost, max_reward, engine, status, play_count, sort_order FROM games WHERE id = ?`, row.game_id) as GameRaw;
    const game = mapGame(gameRaw);
    const engine = getEngine(game.engine);
    if (!engine) throw ERRORS.SESSION_INVALID();

    const elapsedMs = Date.now() - new Date(row.started_at).getTime();
    if (elapsedMs < 1000) {
      // impossibly fast submission — reject the session entirely
      run(`UPDATE game_sessions SET status = 'EXPIRED', finished_at = ? WHERE id = ?`, nowIso(), row.id);
      throw ERRORS.BAD_REQUEST("Result submitted too quickly — session rejected.");
    }

    const config = parseEngineConfig(game.engine, game.config);
    const outcome = engine.resolveOutcome({ maxReward: game.maxReward }, config, submittedScore, elapsedMs);

    const status = outcome.expired ? "EXPIRED" : "COMPLETED";
    const xpPlay = getReward("XP_GAME_PLAY", 0, 25);
    const xpWin = getReward("XP_GAME_WIN", 0, 75);
    let xpEarned = 0;
    let levelUp: { from: number; to: number } | null = null;

    run(
      `UPDATE game_sessions SET status = ?, finished_at = ?, score = ?, is_win = ?, reward = ?, xp_earned = 0
       WHERE id = ? AND status = 'ACTIVE'`,
      status,
      nowIso(),
      outcome.score,
      outcome.isWin ? 1 : 0,
      outcome.reward,
      row.id
    );

    let balance = getBalanceLocal(userId);
    let challengeAwarded = 0;

    if (!outcome.expired) {
      // stats + leaderboard
      run(
        `UPDATE profiles SET games_played = games_played + 1,
            games_won = games_won + ?, updated_at = ? WHERE user_id = ?`,
        outcome.isWin ? 1 : 0,
        nowIso(),
        userId
      );
      recordLeaderboard(userId, { gamesPlayed: 1, wins: outcome.isWin ? 1 : 0 });

      // reward payout — single ledger row per session (unique index enforced)
      if (outcome.reward > 0) {
        const res = applyCoinChange({
          userId,
          amount: outcome.reward,
          type: "GAME_REWARD",
          description: outcome.isWin ? `Game Victory — ${game.name}` : `Game Reward — ${game.name}`,
          gameSessionId: row.id,
          meta: { score: outcome.score, maxScore: outcome.maxScore },
        });
        balance = res.balance;
        pushNotification(
          userId,
          "GAME_REWARD",
          `+${outcome.reward.toLocaleString()} ARC from ${game.name}`,
          outcome.isWin ? `Victory! Score ${outcome.score}/${outcome.maxScore}.` : `Score ${outcome.score}/${outcome.maxScore}.`
        );
      }

      // daily challenge: first win of the day
      if (outcome.isWin) {
        const challenge = getReward("CHALLENGE_WIN_DAILY", 250, 25);
        try {
          const res = applyCoinChange({
            userId,
            amount: challenge.arc,
            type: "CHALLENGE",
            description: "Daily Challenge — Win a game",
            dayKey: dayKey(),
            gameSessionId: row.id,
            meta: { challenge: "WIN_DAILY" },
          });
          challengeAwarded = challenge.arc;
          balance = res.balance;
          pushNotification(userId, "CHALLENGE", "Daily challenge complete!", `First win of the day: +${challenge.arc.toLocaleString()} ARC.`);
        } catch {
          /* already claimed today — fine */
        }
      }

      // XP
      xpEarned = xpPlay.xp + (outcome.isWin ? xpWin.xp : 0);
      if (xpEarned > 0) {
        const lv = grantXp(userId, xpEarned, { notify: true });
        if (lv.leveledUp) levelUp = { from: lv.before.level, to: lv.after.level };
      }
      run(`UPDATE game_sessions SET xp_earned = ? WHERE id = ?`, xpEarned, row.id);
    }

    const newAchievements = checkAchievements(userId);
    balance = getBalanceLocal(userId);

    return {
      expired: outcome.expired,
      score: outcome.score,
      maxScore: outcome.maxScore,
      ratio: outcome.ratio,
      reward: outcome.reward,
      isWin: outcome.isWin,
      xpEarned,
      balance,
      challengeAwarded,
      newAchievements,
      levelUp,
      gameName: game.name,
    };
  });
}

export function countActiveSessions(userId: string): number {
  return get<{ n: number }>(`SELECT COUNT(*) AS n FROM game_sessions WHERE user_id = ? AND status = 'ACTIVE'`, userId)?.n ?? 0;
}

export function recentSessions(userId: string, limit = 10) {
  return all(`SELECT gs.id, g.name, gs.score, gs.is_win, gs.reward, gs.status, gs.started_at
    FROM game_sessions gs JOIN games g ON g.id = gs.game_id
    WHERE gs.user_id = ? ORDER BY gs.started_at DESC LIMIT ?`, userId, limit);
}
