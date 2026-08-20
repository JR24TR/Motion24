"use client";

import { useRouter } from "next/navigation";
import type { GameCard } from "@/lib/game-types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CoinRushGame } from "./coin-rush";

/**
 * Renders the game client for the server-resolved game. The game object and
 * the player's balance are provided by the server page, so no extra client
 * fetch is needed just to resolve the slug.
 */
export function GamePlay({
  game,
  balance,
}: {
  game: GameCard | null;
  balance: number;
}) {
  const router = useRouter();

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
    return <CoinRushGame game={game} balance={balance} onExit={() => router.push("/games")} />;
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
