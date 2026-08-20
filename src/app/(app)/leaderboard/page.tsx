import type { Metadata } from "next";
import { Leaderboard } from "@/components/leaderboard/leaderboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leaderboard",
};

export default function LeaderboardPage() {
  return <Leaderboard />;
}
