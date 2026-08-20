"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { post, ApiClientError } from "@/lib/api";
import type {
  GameCard,
  StartedSession,
  CoinRushConfig,
  FinishResult,
  UnlockedAchievement,
} from "@/lib/game-types";
import { ArcCoin } from "@/components/ui/arc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/button";

type Phase = "idle" | "starting" | "countdown" | "playing" | "submitting" | "result";

type ItemType = "coin" | "gold" | "bomb";

interface Item {
  id: number;
  type: ItemType;
  x: number;
}

interface FloatText {
  id: number;
  x: number;
  y: number;
  text: string;
  tone: "win" | "lose";
}

const ITEM_META: Record<ItemType, { label: string; render: string }> = {
  coin: { label: "Coin", render: "🪙" },
  gold: { label: "Gold", render: "🪙" },
  bomb: { label: "Bomb", render: "💣" },
};

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

/**
 * COIN RUSH gameplay client.
 *
 * SECURITY: This component only tracks a cosmetic score for feedback. The
 * authoritative score is submitted to POST /api/games/[slug]/finish, and the
 * server computes/clamps the reward, XP, achievements and balance. The client
 * never calculates or awards ARC.
 */
export function CoinRushGame({
  game,
  balance: initialBalance,
  onExit,
}: {
  game: GameCard;
  balance: number;
  onExit: () => void;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [cfg, setCfg] = useState<CoinRushConfig | null>(null);
  const [balance, setBalance] = useState(initialBalance);
  const [count, setCount] = useState(3);
  const [remaining, setRemaining] = useState(0);
  const [score, setScore] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [floats, setFloats] = useState<FloatText[]>([]);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const idRef = useRef(1);
  const scoreRef = useRef(0);
  const boardRef = useRef<HTMLDivElement>(null);

  const finishGame = useCallback(async () => {
    if (!sessionId) return;
    setPhase("submitting");
    setFinishError(null);
    try {
      const res = await post<FinishResult>(`/api/games/${game.slug}/finish`, {
        sessionId,
        score: scoreRef.current,
      });
      setResult(res);
      setBalance(res.balance);
      setPhase("result");
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        router.push("/login");
        return;
      }
      setFinishError(
        err instanceof ApiClientError ? err.message : "Could not submit your result."
      );
      setPhase("result");
    }
  }, [sessionId, game.slug, router]);

  const spawnItem = useCallback(() => {
    setCfg((c) => {
      if (!c) return c;
      const roll = Math.random();
      let type: ItemType = "coin";
      if (roll < c.bombChance) type = "bomb";
      else if (roll < c.bombChance + c.goldChance) type = "gold";
      setItems((prev) => [...prev.slice(-26), { id: idRef.current++, type, x: rand(3, 92) }]);
      return c;
    });
  }, []);

  const removeItem = useCallback((id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const tapItem = useCallback(
    (e: React.PointerEvent, item: Item) => {
      if (phase !== "playing" || !cfg) return;
      e.preventDefault();
      let delta = 0;
      if (item.type === "coin") delta = cfg.coinPoints;
      else if (item.type === "gold") delta = cfg.goldPoints;
      else delta = cfg.bombPoints;

      removeItem(item.id);
      setScore((s) => {
        const next = Math.max(0, s + delta);
        scoreRef.current = next;
        return next;
      });

      const board = boardRef.current;
      if (board) {
        const rect = board.getBoundingClientRect();
        setFloats((f) => [
          ...f.slice(-14),
          {
            id: idRef.current++,
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            text: delta > 0 ? `+${delta}` : `${delta}`,
            tone: delta > 0 ? "win" : "lose",
          },
        ]);
      }
    },
    [phase, cfg, removeItem]
  );

  async function startGame() {
    setStarting(true);
    setStartError(null);
    setScore(0);
    scoreRef.current = 0;
    setItems([]);
    setFloats([]);
    try {
      const res = await post<StartedSession>(`/api/games/${game.slug}/start`);
      setSessionId(res.sessionId);
      setCfg(res.config as unknown as CoinRushConfig);
      setBalance(res.balance);
      setCount(3);
      setPhase("countdown");
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        router.push("/login");
        return;
      }
      let msg =
        err instanceof ApiClientError ? err.message : "Could not start the game.";
      if (err instanceof ApiClientError && err.code === "RATE_LIMITED") {
        msg = "Too many requests. Please wait a moment and try again.";
      }
      setStartError(msg);
      setPhase("idle");
    } finally {
      setStarting(false);
    }
  }

  function backToIdle() {
    setPhase("idle");
    setSessionId(null);
    setCfg(null);
    setResult(null);
    setFinishError(null);
    setStartError(null);
    setItems([]);
    setFloats([]);
    setBalance(initialBalance);
    setStarting(false);
  }

  // countdown
  useEffect(() => {
    if (phase !== "countdown") return;
    if (count <= 0) {
      setPhase("playing");
      setRemaining(cfg?.durationSec ?? 0);
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, count, cfg]);

  // gameplay loop
  useEffect(() => {
    if (phase !== "playing" || !cfg) return;
    const endAt = Date.now() + cfg.durationSec * 1000;
    const spawnTimer = window.setInterval(spawnItem, cfg.spawnIntervalMs);
    const tickTimer = window.setInterval(() => {
      const left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        window.clearInterval(spawnTimer);
        window.clearInterval(tickTimer);
        finishGame();
      }
    }, 250);
    return () => {
      window.clearInterval(spawnTimer);
      window.clearInterval(tickTimer);
    };
  }, [phase, cfg, spawnItem, finishGame]);

  // auto-clear float text
  useEffect(() => {
    if (floats.length === 0) return;
    const t = window.setTimeout(() => setFloats([]), 700);
    return () => window.clearTimeout(t);
  }, [floats]);

  // ------------------------------------------------ IDLE (pre-game screen)
  if (phase === "idle") {
    const affordable = balance >= game.entryCost;
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <button
          type="button"
          onClick={onExit}
          className="text-sm font-semibold text-mute transition hover:text-ink"
        >
          ← Back to games
        </button>
        <Card className="relative overflow-hidden p-6">
          <div className="grid-backdrop absolute inset-0" aria-hidden />
          <div className="relative">
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-line bg-surface-2 text-3xl" aria-hidden>
                🪙
              </span>
              <div>
                <h1 className="font-display text-2xl font-black text-ink">{game.name}</h1>
                <span className="mt-1 inline-block rounded-full bg-arc/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-arc">
                  {game.difficulty}
                </span>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-mute">{game.description}</p>

            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-line bg-bg-2 p-3">
                <dt className="text-[11px] uppercase tracking-wider text-dim">Entry</dt>
                <dd className="tnum mt-1 font-bold text-lose">{game.entryCost.toLocaleString()} ARC</dd>
              </div>
              <div className="rounded-xl border border-line bg-bg-2 p-3">
                <dt className="text-[11px] uppercase tracking-wider text-dim">Reward up to</dt>
                <dd className="tnum mt-1 font-bold text-arc">{game.maxReward.toLocaleString()} ARC</dd>
              </div>
              <div className="rounded-xl border border-line bg-bg-2 p-3">
                <dt className="text-[11px] uppercase tracking-wider text-dim">Length</dt>
                <dd className="tnum mt-1 font-bold text-ink">30s</dd>
              </div>
              <div className="rounded-xl border border-line bg-bg-2 p-3">
                <dt className="text-[11px] uppercase tracking-wider text-dim">Your balance</dt>
                <dd className="tnum mt-1 font-bold text-ink">{balance.toLocaleString()}</dd>
              </div>
            </dl>

            <ul className="mt-5 space-y-1.5 text-sm text-mute">
              <li>🪙 Tap coins for points · <span className="text-arc">gold</span> is worth more</li>
              <li>💣 Avoid bombs — they cost you points</li>
              <li>Rewards are awarded server-side based on your score</li>
            </ul>

            {startError ? (
              <p role="alert" className="mt-4 rounded-xl border border-lose/40 bg-lose/10 px-3.5 py-2.5 text-sm font-medium text-lose">
                {startError}
              </p>
            ) : null}

            <Button
              className="mt-6"
              size="lg"
              fullWidth
              loading={starting}
              disabled={!affordable}
              onClick={startGame}
            >
              {!affordable ? "Insufficient ARC" : `Enter game · ${game.entryCost.toLocaleString()} ARC`}
            </Button>
            {!affordable ? (
              <p className="mt-2 text-center text-xs text-lose">
                Entry costs {game.entryCost.toLocaleString()} ARC — earn more or wait for a bonus.
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    );
  }

  // ------------------------------------------------ COUNTDOWN
  if (phase === "countdown") {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-dim">Get ready</p>
          <p
            key={count}
            className="mt-4 font-display text-7xl font-black text-arc"
            style={{ animation: "count-flash 0.9s ease-in-out" }}
          >
            {count > 0 ? count : "GO!"}
          </p>
        </div>
      </div>
    );
  }

  // ------------------------------------------------ PLAYING
  if (phase === "playing") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="rounded-xl border border-line bg-surface px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-dim">Score</p>
            <p className="tnum text-xl font-black text-ink">{score}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-arc/15 px-2.5 py-1 text-xs font-bold text-arc">
              {game.name}
            </span>
            <div className="rounded-xl border border-line bg-surface px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-dim">Time</p>
              <p className="tnum text-xl font-black text-arc">{remaining}s</p>
            </div>
          </div>
        </div>

        <div
          ref={boardRef}
          className="relative h-[62vh] touch-none select-none overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-bg-2 to-surface"
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* falling items */}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={ITEM_META[item.type].label}
              onPointerDown={(e) => tapItem(e, item)}
              onAnimationEnd={() => removeItem(item.id)}
              className="absolute top-0 -translate-x-1/2 cursor-pointer"
              style={{
                left: `${item.x}%`,
                animation: `coin-fall ${cfg ? cfg.coinLifetimeMs : 1500}ms linear forwards`,
                animationPlayState: "running",
              }}
            >
              <span
                className={`grid h-12 w-12 place-items-center text-4xl transition-transform ${
                  item.type === "gold"
                    ? "drop-shadow-[0_0_10px_rgba(245,181,68,0.9)]"
                    : item.type === "bomb"
                      ? "drop-shadow-[0_0_10px_rgba(255,107,129,0.8)]"
                      : ""
                }`}
                aria-hidden
              >
                {item.type === "gold" ? "🪙" : ITEM_META[item.type].render}
              </span>
            </button>
          ))}

          {/* score floats */}
          {floats.map((f) => (
            <span
              key={f.id}
              className={`pointer-events-none absolute font-display text-lg font-black ${
                f.tone === "win" ? "text-win" : "text-lose"
              }`}
              style={{
                left: f.x,
                top: f.y,
                animation: "score-float 0.7s ease-out forwards",
              }}
              aria-hidden
            >
              {f.text}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // ------------------------------------------------ SUBMITTING
  if (phase === "submitting") {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <Spinner className="h-8 w-8 text-brand-2" />
          <p className="text-sm text-mute">Verifying your run with the server…</p>
        </div>
      </div>
    );
  }

  // ------------------------------------------------ RESULT
  if (phase === "result") {
    if (finishError) {
      return (
        <Card className="mx-auto max-w-lg p-8 text-center">
          <p className="text-3xl" aria-hidden>⚠️</p>
          <h2 className="mt-3 font-display text-lg font-bold text-ink">Couldn't submit your result</h2>
          <p className="mt-1 text-sm text-mute">{finishError}</p>
          <div className="mt-5 flex justify-center gap-3">
            <Button onClick={() => finishGame()}>Retry</Button>
            <Button variant="secondary" onClick={onExit}>Back to games</Button>
          </div>
        </Card>
      );
    }

    const r = result;
    if (!r) return null;
    return (
      <div className="mx-auto max-w-lg space-y-5">
        <Card className={`relative overflow-hidden p-6 text-center ${r.isWin ? "" : ""}`}>
          <div className="grid-backdrop absolute inset-0" aria-hidden />
          <div className="relative">
            <p className="text-5xl" aria-hidden>{r.isWin ? "🏆" : r.expired ? "⏰" : "💪"}</p>
            <h1 className="mt-3 font-display text-3xl font-black text-ink">
              {r.isWin ? "Victory!" : r.expired ? "Time's up" : "Nice try"}
            </h1>
            <p className="mt-1 text-sm text-mute">{r.gameName}</p>

            <div className="mx-auto mt-5 flex max-w-xs items-center justify-between gap-3 rounded-2xl border border-line bg-bg-2 px-4 py-3">
              <div className="text-center">
                <p className="text-[11px] uppercase tracking-wider text-dim">Your score</p>
                <p className="tnum text-2xl font-black text-ink">{r.score}</p>
              </div>
              <span className="text-xl text-dim">/</span>
              <div className="text-center">
                <p className="text-[11px] uppercase tracking-wider text-dim">Max</p>
                <p className="tnum text-2xl font-black text-mute">{r.maxScore}</p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2">
              <span className="text-sm text-mute">Reward</span>
              {r.reward > 0 ? (
                <ArcCoin amount={r.reward} className="text-lg" />
              ) : (
                <span className="text-sm font-semibold text-dim">No ARC this round</span>
              )}
            </div>
          </div>
        </Card>

        {/* breakdown */}
        <Card className="p-5">
          <h2 className="font-display text-base font-bold text-ink">Run breakdown</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex justify-between">
              <span className="text-mute">Score ratio</span>
              <span className="tnum font-bold text-ink">{Math.round(r.ratio * 100)}%</span>
            </li>
            {r.xpEarned > 0 ? (
              <li className="flex justify-between">
                <span className="text-mute">XP earned</span>
                <span className="tnum font-bold text-xp">+{r.xpEarned} XP</span>
              </li>
            ) : null}
            {r.levelUp ? (
              <li className="flex justify-between">
                <span className="text-mute">Level up</span>
                <span className="tnum font-bold text-xp">
                  Lv {r.levelUp.from} → {r.levelUp.to}
                </span>
              </li>
            ) : null}
            {r.challengeAwarded > 0 ? (
              <li className="flex justify-between">
                <span className="text-mute">Daily challenge</span>
                <ArcCoin amount={r.challengeAwarded} signed className="text-sm" />
              </li>
            ) : null}
            <li className="flex justify-between border-t border-line/60 pt-2">
              <span className="font-semibold text-ink">New balance</span>
              <ArcCoin amount={r.balance} className="text-sm" />
            </li>
          </ul>
        </Card>

        {r.newAchievements.length > 0 ? (
          <Card className="p-5">
            <h2 className="font-display text-base font-bold text-ink">Achievements unlocked</h2>
            <ul className="mt-3 space-y-2">
              {r.newAchievements.map((a: UnlockedAchievement) => (
                <li key={a.code} className="flex items-center gap-3 rounded-xl border border-arc/30 bg-arc/10 px-3 py-2">
                  <span className="text-xl" aria-hidden>{a.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{a.name}</p>
                    <p className="text-xs text-dim">
                      {a.arcReward > 0 ? `+${a.arcReward} ARC · ` : ""}+{a.xpReward} XP
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <div className="flex gap-3">
          <Button fullWidth size="lg" onClick={backToIdle}>
            Play again
          </Button>
          <Button fullWidth size="lg" variant="secondary" onClick={onExit}>
            Back to games
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
