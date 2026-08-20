import type { Metadata } from "next";
import { GamesHub } from "@/components/games/games-hub";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Games",
};

export default function GamesPage() {
  return <GamesHub />;
}
