import { NextRequest } from "next/server";
import { handle, body } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { updateProfile } from "@/server/services/players";
import { profilePatchSchema } from "@/server/lib/validation";

export async function PATCH(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser();
    const patch = await body(req, profilePatchSchema);
    updateProfile(user.id, patch);
    return { ok: true };
  });
}
