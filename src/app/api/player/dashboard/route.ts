import { handle } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { playerDashboard } from "@/server/services/stats";
import { listRecentSessions } from "@/server/services/games";

/**
 * Authenticated dashboard aggregate. Thin wrapper over the existing
 * `playerDashboard` service (balance, level, rank, stats, recent
 * transactions/achievements) plus the player's recent game sessions.
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const dash = playerDashboard(user);
    const recentGames = listRecentSessions(user.id, 6);
    return { ...dash, recentGames };
  });
}
