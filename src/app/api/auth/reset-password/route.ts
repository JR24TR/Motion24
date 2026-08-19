import { NextRequest } from "next/server";
import { handle, body } from "@/server/api";
import { resetSchema } from "@/server/lib/validation";
import { run, get } from "@/server/db/client";
import { sha256, nowIso } from "@/server/lib/util";
import { hashPassword } from "@/server/auth/password";
import { ApiError } from "@/server/lib/errors";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const { token, password } = await body(req, resetSchema);
    const row = get<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
      sha256(token),
      nowIso()
    );
    if (!row) throw new ApiError(400, "TOKEN_INVALID", "This reset link is invalid or has expired. Request a new one.");
    run(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`, hashPassword(password), nowIso(), row.user_id);
    run(`UPDATE password_reset_tokens SET used_at = ? WHERE id = ?`, nowIso(), row.id);
    run(`DELETE FROM sessions WHERE user_id = ?`, row.user_id); // force re-login everywhere
    return { ok: true };
  });
}
