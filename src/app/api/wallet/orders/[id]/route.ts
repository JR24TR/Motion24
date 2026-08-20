import { handle } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { getOrder } from "@/server/services/orders";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    const { id } = await ctx.params;
    const order = getOrder(user.id, id);
    return { order };
  });
}
