import { NextRequest } from "next/server";
import { handle } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { startGameSession } from "@/server/services/games";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { slug } = await ctx.params;
    return startGameSession(user.id, slug);
  });
}
