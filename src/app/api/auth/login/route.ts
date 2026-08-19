import { NextRequest } from "next/server";
import { handle, body } from "@/server/api";
import { loginSchema } from "@/server/lib/validation";
import { findByLogin, touchLogin } from "@/server/services/players";
import { verifyPassword } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { ApiError } from "@/server/lib/errors";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const { login, password } = await body(req, loginSchema);
    const user = findByLogin(login);
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw new ApiError(401, "BAD_CREDENTIALS", "Wrong username or password. Try again.");
    }
    if (user.status === "SUSPENDED") {
      throw new ApiError(403, "SUSPENDED", "This account is suspended. Contact the arena admin.");
    }
    touchLogin(user.id);
    await createSession(user.id);
    return { ok: true, role: user.role };
  });
}
