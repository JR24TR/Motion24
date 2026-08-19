import { NextRequest } from "next/server";
import { handle, body } from "@/server/api";
import { requireAdmin } from "@/server/auth/session";
import { adjustBalance } from "@/server/services/admin";
import { adjustSchema } from "@/server/lib/validation";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const { amount, reason } = await body(req, adjustSchema);
    return adjustBalance(admin.id, admin.displayName, id, amount, reason);
  });
}
