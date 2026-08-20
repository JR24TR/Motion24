import type { Metadata } from "next";
import { GamePlay } from "@/components/games/game-play";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Play",
};

export default function GamePage() {
  return <GamePlay />;
}
