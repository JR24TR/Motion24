import { handle } from "@/server/api";
import { requireAdmin } from "@/server/auth/session";
import { adminStats } from "@/server/services/stats";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    return adminStats();
  });
}
