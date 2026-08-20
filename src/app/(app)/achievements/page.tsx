import type { Metadata } from "next";
import { Achievements } from "@/components/achievements/achievements";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Achievements",
};

export default function AchievementsPage() {
  return <Achievements />;
}
