import { NextRequest } from "next/server";
import { handle, body } from "@/server/api";
import { requireAdmin } from "@/server/auth/session";
import { listRewards } from "@/server/services/settings";
import { recordAdminAction } from "@/server/services/admin";
import { rewardPatchSchema } from "@/server/lib/validation";
import { run } from "@/server/db/client";
import { nowIso } from "@/server/lib/util";
import { ApiError } from "@/server/lib/errors";

export async function GET() {
  return handle(async () => {
    await requireAdmin();
    return { rewards: listRewards() };
  });
}

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { code, arcAmount, xpAmount } = await body(req, rewardPatchSchema);
    const updated = run(
      `UPDATE rewards SET arc_amount = ?, xp_amount = ?, updated_by = ?, updated_at = ?
       WHERE code = ?`,
      arcAmount,
      xpAmount,
      admin.username,
      nowIso(),
      code
    );
    if (updated.changes === 0) throw new ApiError(404, "NOT_FOUND", "Reward not found.");
    recordAdminAction(admin.id, "REWARD_UPDATE", { type: "REWARD", id: code, label: code }, undefined, {
      arcAmount,
      xpAmount,
    });
    return { ok: true };
  });
}
