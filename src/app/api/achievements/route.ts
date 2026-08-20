import { handle } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { listAchievementsFor } from "@/server/services/achievements";

/** Authenticated achievements list from the existing achievements service. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return { achievements: listAchievementsFor(user.id) };
  });
}
