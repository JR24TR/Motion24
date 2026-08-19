import { NextRequest } from "next/server";
import { handle, searchParam } from "@/server/api";
import { requireAdmin } from "@/server/auth/session";
import { listAdminActions } from "@/server/services/admin";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin();
    return { actions: listAdminActions(150, searchParam(req, "action") ?? undefined) };
  });
}
