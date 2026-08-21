import { NextRequest } from "next/server";
import { handle, body, searchParam } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { createOrderSchema } from "@/server/lib/validation";
import { enforceRateLimit, clientIp } from "@/server/lib/rate-limit";
import { createOrderAndInitiate, listUserOrders } from "@/server/services/orders";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const page = Math.max(1, parseInt(searchParam(req, "page") ?? "1", 10) || 1);
    const limit = Math.min(50, parseInt(searchParam(req, "limit") ?? "25", 10) || 25);
    const { rows, total } = listUserOrders(user.id, {
      limit,
      offset: (page - 1) * limit,
    });
    return { rows, total, page, pageSize: limit };
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    enforceRateLimit(`orders:user:${user.id}`, `orders:ip:${clientIp(req)}`);
    const input = await body(req, createOrderSchema);
    return createOrderAndInitiate(user.id, input);
  });
}
