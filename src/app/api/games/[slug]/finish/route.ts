import { NextRequest } from "next/server";
import { handle, body } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { finishGameSession } from "@/server/services/games";
import { finishGameSchema } from "@/server/lib/validation";

export async function POST(req: NextRequest, _ctx: { params: Promise<{ slug: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { sessionId, score } = await body(req, finishGameSchema);
    return finishGameSession(user.id, sessionId, score);
  });
}
