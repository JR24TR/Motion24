import { NextRequest } from "next/server";
import { handle, body } from "@/server/api";
import { registerSchema } from "@/server/lib/validation";
import { registerUser } from "@/server/services/players";
import { createSession } from "@/server/auth/session";
import { get } from "@/server/db/client";
import { ApiError } from "@/server/lib/errors";

export async function POST(req: NextRequest) {
  return handle(async () => {
    const input = await body(req, registerSchema);
    const dupeU = get<{ id: string }>(`SELECT id FROM users WHERE username = ? COLLATE NOCASE`, input.username);
    if (dupeU) throw new ApiError(409, "USERNAME_TAKEN", "That username is already taken.");
    const dupeE = get<{ id: string }>(`SELECT id FROM users WHERE email = ? COLLATE NOCASE`, input.email);
    if (dupeE) throw new ApiError(409, "EMAIL_TAKEN", "An account with that email already exists.");

    const { userId } = registerUser({
      username: input.username,
      displayName: input.displayName,
      email: input.email,
      password: input.password,
      inviteCode: input.inviteCode || undefined,
    });
    await createSession(userId);
    return { ok: true, userId };
  });
}
