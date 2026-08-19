import { NextRequest } from "next/server";
import { handle, body } from "@/server/api";
import { requireAdmin } from "@/server/auth/session";
import { settingsPatchSchema } from "@/server/lib/validation";
import { recordAdminAction } from "@/server/services/admin";
import { run } from "@/server/db/client";

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const admin = await requireAdmin();
    const { XP_BASE, XP_STEP } = await body(req, settingsPatchSchema);
    run(`INSERT INTO settings (key, value) VALUES ('XP_BASE', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`, String(XP_BASE));
    run(`INSERT INTO settings (key, value) VALUES ('XP_STEP', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`, String(XP_STEP));
    recordAdminAction(admin.id, "SETTINGS_UPDATE", { type: "PLATFORM" }, undefined, { XP_BASE, XP_STEP });
    return { ok: true };
  });
}
