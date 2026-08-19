import { NextRequest } from "next/server";
import { handle, searchParam } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { listTransactions } from "@/server/services/coins";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const filterRaw = searchParam(req, "filter");
    const filter =
      filterRaw === "EARNED" || filterRaw === "SPENT" ? filterRaw : ("ALL" as const);
    const page = Math.max(1, parseInt(searchParam(req, "page") ?? "1", 10) || 1);
    const limit = Math.min(50, parseInt(searchParam(req, "limit") ?? "25", 10) || 25);
    const { rows, total } = listTransactions(user.id, {
      filter,
      limit,
      offset: (page - 1) * limit,
    });
    return { rows, total, page, pageSize: limit };
  });
}
