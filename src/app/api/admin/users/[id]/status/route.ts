import { NextRequest } from "next/server";
import { handle, body } from "@/server/api";
import { requireAdmin } from "@/server/auth/session";
import { setUserStatus } from "@/server/services/admin";
import { statusSchema } from "@/server/lib/validation";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const { status, reason } = await body(req, statusSchema);
    setUserStatus(admin.id, id, status, reason);
    return { ok: true };
  });
}
