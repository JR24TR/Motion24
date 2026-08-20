"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api";
import type { GamesResponse, GameCard } from "@/lib/game-types";
import { ArcCoin } from "@/components/ui/arc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const DIFFICULTY_STYLE: Record<GameCard["difficulty"], string> = {
  EASY: "border-win/30 bg-win/10 text-win",
  MEDIUM: "border-arc/30 bg-arc/10 text-arc",
  HARD: "border-lose/30 bg-lose/10 text-lose",
};

function GameCardView({ game, balance, onPlay }: { game: GameCard; balance: number; onPlay: (slug: string) => void }) {
  const affordable = balance >= game.entryCost;
  const live = game.status === "ACTIVE";
  return (
    <Card hover className="relative flex flex-col overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface-2 text-2xl" aria-hidden>
          {game.icon}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${DIFFICULTY_STYLE[game.difficulty]}`}>
            {game.difficulty}
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
              live ? "border border-win/30 bg-win/10 text-win" : "border border-line bg-surface-2 text-dim"
            }`}
          >
            {live ? "Live" : "Offline"}
          </span>
        </div>
      </div>

      <h3 className="font-display mt-4 text-xl font-bold text-ink">{game.name}</h3>
      <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-mute">{game.description}</p>

      <div className="mt-4 flex items-center gap-3 text-sm">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-dim">Entry</p>
          <p className="tnum font-bold text-lose">{game.entryCost.toLocaleString()} ARC</p>
        </div>
        <div className="h-8 w-px bg-line" />
        <div>
          <p className="text-[11px] uppercase tracking-wider text-dim">Reward up to</p>
          <p className="tnum font-bold text-arc">{game.maxReward.toLocaleString()} ARC</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[11px] uppercase tracking-wider text-dim">Played</p>
          <p className="tnum font-bold text-mute">{game.playCount.toLocaleString()}</p>
        </div>
      </div>

      <div className="mt-5">
        <Button fullWidth size="lg" disabled={!live || !affordable} onClick={() => onPlay(game.slug)}>
          {!live ? "Unavailable" : affordable ? "Play" : "Insufficient ARC"}
        </Button>
        {!affordable && live ? (
          <p className="mt-2 text-center text-xs text-lose">
            Entry is {game.entryCost.toLocaleString()} ARC — you have {balance.toLocaleString()}.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

export function GamesHub() {
  const router = useRouter();
  const [data, setData] = useState<GamesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api<GamesResponse>("/api/games");
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.message : "Could not load games.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-64 animate-pulse rounded-3xl bg-surface/60" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center">
        <p className="text-3xl" aria-hidden>⚠️</p>
        <h2 className="mt-3 font-display text-lg font-bold text-ink">Couldn't load games</h2>
        <p className="mt-1 text-sm text-mute">{error}</p>
        <Button className="mt-5" onClick={() => window.location.reload()}>Try again</Button>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black text-ink">Games</h1>
          <p className="mt-0.5 text-sm text-mute">Enter a game, test your skill and earn ARC.</p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm">
          <span className="mr-1 text-dim">Balance</span>
          <ArcCoin amount={data.balance} />
        </div>
      </header>

      {data.games.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-3xl" aria-hidden>🎮</p>
          <h2 className="mt-3 font-display text-lg font-bold text-ink">No games available yet</h2>
          <p className="mt-1 text-sm text-mute">Check back soon — the arena is warming up.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.games.map((g) => (
            <GameCardView key={g.id} game={g} balance={data.balance} onPlay={(slug) => router.push(`/games/${slug}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
