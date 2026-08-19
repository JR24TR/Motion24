import { z } from "zod";
import { getReward } from "../services/settings";

/**
 * Game engine registry.
 *
 * A game row in the DB points at an engine key. The engine owns:
 *  - config schema + defaults (validated on admin save)
 *  - what config the client may see
 *  - how a submitted score maps to a reward, with server-side clamping.
 *
 * Adding a new game later = implement one engine object, register it here,
 * then create the game row from the admin panel (no other code changes).
 */

export type GameOutcome = {
  score: number;
  maxScore: number;
  ratio: number;
  reward: number;
  rewardPct: number;
  isWin: boolean;
  expired: boolean;
};

export type EngineGame = {
  maxReward: number;
};

export type Engine = {
  key: string;
  name: string;
  description: string;
  configSchema: z.ZodTypeAny;
  defaultConfig: () => Record<string, unknown>;
  clientConfig: (cfg: Record<string, unknown>) => Record<string, unknown>;
  maxScore: (cfg: Record<string, unknown>) => number;
  resolveOutcome: (
    game: EngineGame,
    cfg: Record<string, unknown>,
    submittedScore: number,
    elapsedMs: number
  ) => GameOutcome;
};

// --------------------------------------------------------------------------
// COIN RUSH
// --------------------------------------------------------------------------
const coinRushSchema = z.object({
  durationSec: z.number().int().min(10).max(120).default(30),
  spawnIntervalMs: z.number().int().min(250).max(3000).default(550),
  coinLifetimeMs: z.number().int().min(500).max(5000).default(1500),
  coinPoints: z.number().int().min(1).max(10).default(1),
  goldChance: z.number().min(0).max(1).default(0.14),
  goldPoints: z.number().int().min(1).max(10).default(3),
  bombChance: z.number().min(0).max(0.6).default(0.16),
  bombPoints: z.number().int().min(-10).max(-1).default(-4),
  winRatio: z.number().min(0.1).max(1).default(0.65),
});
type CoinRushCfg = z.infer<typeof coinRushSchema>;

/** Reward tiers by score ratio — server controlled, percentages of max_reward. */
const TIERS: { minRatio: number; pct: number }[] = [
  { minRatio: 0.92, pct: 1.0 },
  { minRatio: 0.8, pct: 0.6 },
  { minRatio: 0.65, pct: 0.35 },
  { minRatio: 0.45, pct: 0.15 },
  { minRatio: 0.0, pct: 0.0 },
];

const coinRush: Engine = {
  key: "coin-rush",
  name: "Coin Rush Engine",
  description: "Tap falling coins; gold is worth more, bombs hurt. Time-limited skill game.",
  configSchema: coinRushSchema,
  defaultConfig: () =>
    coinRushSchema.parse({
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
  clientConfig: (raw) => {
    const c = coinRushSchema.parse(raw);
    // client gets everything it needs to render — nothing sensitive here
    return { ...c };
  },
  maxScore: (raw) => {
    const c = coinRushSchema.parse(raw);
    // theoretical ceiling: every spawn is a gold coin tapped instantly
    return Math.max(1, Math.floor((c.durationSec * 1000) / c.spawnIntervalMs) * c.goldPoints);
  },
  resolveOutcome: (game, raw, submittedScore, elapsedMs) => {
    const c: CoinRushCfg = coinRushSchema.parse(raw);
    const maxScore = coinRush.maxScore(raw);
    const durationMs = c.durationSec * 1000;

    // sessions reported far too late are forfeited (entry already deducted)
    if (elapsedMs > durationMs + 10_000) {
      return { score: 0, maxScore, ratio: 0, reward: 0, rewardPct: 0, isWin: false, expired: true };
    }
    // clamp: client can never claim more than physically possible
    const score = Math.max(0, Math.min(Math.round(submittedScore), maxScore));
    const ratio = maxScore > 0 ? score / maxScore : 0;
    const tier = TIERS.find((t) => ratio >= t.minRatio) ?? TIERS[TIERS.length - 1];
    let reward = Math.round((tier.pct * game.maxReward) / 50) * 50; // round to 50s
    const isWin = ratio >= c.winRatio;
    if (isWin) {
      const victory = getReward("GAME_VICTORY", 500, 0);
      reward = Math.min(game.maxReward, Math.max(reward, victory.arc));
    }
    reward = Math.max(0, Math.min(reward, game.maxReward));
    return { score, maxScore, ratio, reward, rewardPct: tier.pct, isWin, expired: false };
  },
};

export const ENGINES: Record<string, Engine> = {
  "coin-rush": coinRush,
};

export function listEngines() {
  return Object.values(ENGINES).map((e) => ({
    key: e.key,
    name: e.name,
    description: e.description,
    defaultConfig: e.defaultConfig(),
  }));
}

export function getEngine(key: string): Engine | undefined {
  return ENGINES[key];
}

export function parseEngineConfig(key: string, raw: unknown): Record<string, unknown> {
  const engine = getEngine(key);
  if (!engine) throw new Error(`Unknown engine: ${key}`);
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      throw new Error("Game config is not valid JSON.");
    }
  }
  const parsed = engine.configSchema.safeParse(obj ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Game config invalid: ${issue.path.join(".")} — ${issue.message}`);
  }
  return parsed.data as Record<string, unknown>;
}
