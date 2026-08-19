import { handle } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { listGames } from "@/server/services/games";
import { getBalance } from "@/server/services/coins";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return { games: listGames({ activeOnly: true }), balance: getBalance(user.id) };
  });
}
