import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { listGames } from "@/server/services/games";
import { getBalance } from "@/server/services/coins";
import type { GameCard } from "@/lib/game-types";
import { GamePlay } from "@/components/games/game-play";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Play",
};

export default async function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { slug } = await params;
  const games = listGames({ activeOnly: true });
  const found = games.find((g) => g.slug === slug);
  // GameRow is structurally assignable to the client-safe GameCard.
  const game = (found as GameCard | undefined) ?? null;
  const balance = getBalance(user.id);

  return <GamePlay game={game} balance={balance} />;
}
