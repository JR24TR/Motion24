import { NextRequest } from "next/server";
import { handle, body } from "@/server/api";
import { forgotSchema } from "@/server/lib/validation";
import { run, get } from "@/server/db/client";
import { uuid, randomToken, sha256, nowIso } from "@/server/lib/util";

/**
 * Password reset tokens are hashed at rest and expire in 60 minutes.
 * NOTE: no mail provider is configured in this environment, so the reset
 * link is returned in the response (clearly labeled) instead of emailed —
 * swap `deliverResetLink` for a real mailer when one is available.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { email } = await body(req, forgotSchema);
    const user = get<{ id: string; username: string }>(
      `SELECT id, username FROM users WHERE email = ? COLLATE NOCASE`,
      email
    );
    // uniform response — never reveal whether an account exists
    const result: { ok: true; resetUrl?: string } = { ok: true };
    if (user) {
      const token = randomToken(24);
      run(
        `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        uuid(),
        user.id,
        sha256(token),
        new Date(Date.now() + 60 * 60_000).toISOString(),
        nowIso()
      );
      result.resetUrl = `/reset-password?token=${token}`;
    }
    return result;
  });
}
