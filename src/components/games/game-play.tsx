"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiClientError } from "@/lib/api";
import type { GamesResponse, GameCard } from "@/lib/game-types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CoinRushGame } from "./coin-rush";

/** Resolves the current slug from the real /api/games data and renders the matching game client. */
export function GamePlay() {
  const { slug } = useParams<{ slug: string }>();
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
          setError(err instanceof ApiClientError ? err.message : "Could not load this game.");
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
      <div className="mx-auto max-w-lg space-y-4" aria-busy="true">
        <div className="h-64 animate-pulse rounded-3xl bg-surface/60" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <p className="text-3xl" aria-hidden>⚠️</p>
        <h2 className="mt-3 font-display text-lg font-bold text-ink">Couldn't load this game</h2>
        <p className="mt-1 text-sm text-mute">{error ?? "Game not found."}</p>
        <div className="mt-5 flex justify-center gap-3">
          <Button onClick={() => window.location.reload()}>Try again</Button>
          <Button variant="secondary" onClick={() => router.push("/games")}>Back to games</Button>
        </div>
      </Card>
    );
  }

  const game: GameCard | undefined = data.games.find((g) => g.slug === slug);

  if (!game) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <p className="text-3xl" aria-hidden>🎮</p>
        <h2 className="mt-3 font-display text-lg font-bold text-ink">Game not found</h2>
        <p className="mt-1 text-sm text-mute">That game isn't available right now.</p>
        <Button className="mt-5" variant="secondary" onClick={() => router.push("/games")}>
          Back to games
        </Button>
      </Card>
    );
  }

  if (game.engine === "coin-rush") {
    return <CoinRushGame game={game} balance={data.balance} onExit={() => router.push("/games")} />;
  }

  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <p className="text-3xl" aria-hidden>🛠️</p>
      <h2 className="mt-3 font-display text-lg font-bold text-ink">{game.name}</h2>
      <p className="mt-1 text-sm text-mute">
        This game's client isn't available yet — check back soon.
      </p>
      <Button className="mt-5" variant="secondary" onClick={() => router.push("/games")}>
        Back to games
      </Button>
    </Card>
  );
}
