import { NextRequest } from "next/server";
import { handle, body } from "@/server/api";
import { loginSchema } from "@/server/lib/validation";
import { findByLogin, touchLogin } from "@/server/services/players";
import { verifyPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { ApiError } from "@/server/lib/errors";
import { enforceRateLimit, recordFailure, clearFailures, clientIp } from "@/server/lib/rate-limit";

/**
 * Login is protected by:
 *  - per-IP volume limiting (RATELIMIT_MAX hits / window)
 *  - per-account lockout after RATELIMIT_FAIL_MAX consecutive failures
 *    (RATELIMIT_LOCKOUT_MS), cleared on success
 */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const { login, password } = await body(req, loginSchema);
    const ipKey = `login:ip:${clientIp(req)}`;
    const acctKey = `login:acct:${login.trim().toLowerCase()}`;
    enforceRateLimit(ipKey);

    const user = findByLogin(login);
    if (!user || !verifyPassword(password, user.password_hash)) {
      recordFailure(ipKey, acctKey);
      throw new ApiError(401, "BAD_CREDENTIALS", "Wrong username or password. Try again.");
    }
    if (user.status === "SUSPENDED") {
      recordFailure(ipKey, acctKey);
      throw new ApiError(403, "SUSPENDED", "This account is suspended. Contact the arena admin.");
    }
    clearFailures(acctKey);
    touchLogin(user.id);
    await createSession(user.id);
    return { ok: true, role: user.role };
  });
}
