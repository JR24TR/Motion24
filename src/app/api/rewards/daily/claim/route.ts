import { handle } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { claimDailyBonus } from "@/server/services/players";

export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    return claimDailyBonus(user.id);
  });
}
