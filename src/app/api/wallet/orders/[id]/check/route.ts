import { NextRequest } from "next/server";
import { handle } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { enforceRateLimit, clientIp } from "@/server/lib/rate-limit";
import { checkOrderPayment } from "@/server/services/orders";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser();
    enforceRateLimit(`order-check:user:${user.id}`, `order-check:ip:${clientIp(req)}`);
    const { id } = await ctx.params;
    const order = await checkOrderPayment(user.id, id);
    return { order };
  });
}
