import { NextRequest } from "next/server";
import { handle, body } from "@/server/api";
import { forgotSchema } from "@/server/lib/validation";
import { run, get } from "@/server/db/client";
import { uuid, randomToken, sha256, nowIso } from "@/server/lib/util";
import { enforceRateLimit, clientIp } from "@/server/lib/rate-limit";

/**
 * Password reset tokens are hashed at rest and expire in 60 minutes.
 *
 * SECURITY: this endpoint NEVER returns a usable reset link by default and
 * always answers with the same generic response, so callers cannot enumerate
 * accounts. The reset URL is logged server-side (dev/debug) only. For local
 * testing without a mail provider, set ARENA_DEV_RESET_LINKS=true — the flag
 * is ignored in production builds, so it can never leak links there.
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { email } = await body(req, forgotSchema);
    enforceRateLimit(`forgot:ip:${clientIp(req)}`, `forgot:email:${email}`);

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
      const resetUrl = `/reset-password?token=${token}`;
      if (process.env.ARENA_DEV_RESET_LINKS === "true" && process.env.NODE_ENV !== "production") {
        // explicit opt-in for local development only
        result.resetUrl = resetUrl;
      } else {
        console.log(
          `[arena] password reset link generated for "${user.username}" (dev log, expires in 60 min): ${resetUrl}`
        );
      }
    }
    return result;
  });
}
