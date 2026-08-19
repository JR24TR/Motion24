import { NextRequest } from "next/server";
import { handle, searchParam } from "@/server/api";
import { requireAdmin } from "@/server/auth/session";
import { searchUsers } from "@/server/services/admin";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireAdmin();
    const q = searchParam(req, "q") ?? "";
    return { users: searchUsers(q) };
  });
}
