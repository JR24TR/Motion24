import { NextRequest } from "next/server";
import { handle, searchParam } from "@/server/api";
import { getLeaderboard, getUserRank, LeaderboardPeriod } from "@/server/services/leaderboard";
import { getSessionUser } from "@/server/auth/session";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const raw = searchParam(req, "period");
    const period: LeaderboardPeriod =
      raw === "WEEKLY" || raw === "MONTHLY" ? raw : "ALL";
    const me = await getSessionUser();
    return {
      period,
      rows: getLeaderboard(period, 50),
      myRank: me ? getUserRank(me.id, period) : 0,
    };
  });
}
