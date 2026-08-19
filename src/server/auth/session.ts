import { cookies } from "next/headers";
import { get, run } from "@/server/db/client";
import { uuid, randomToken, sha256, nowIso } from "@/server/lib/util";
import { ERRORS } from "@/server/lib/errors";

export const SESSION_COOKIE = "arena_session";
const SESSION_TTL_DAYS = 30;

export type SessionUser = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: "PLAYER" | "ADMIN";
  status: "ACTIVE" | "SUSPENDED";
  avatar: string;
  createdAt: string;
};

/** Creates a DB-backed session and sets the httpOnly cookie. */
export async function createSession(userId: string) {
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_TTL_DAYS * 86400_000);
  run(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
    uuid(),
    userId,
    sha256(token),
    expires.toISOString(),
    nowIso()
  );
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) run(`DELETE FROM sessions WHERE token_hash = ?`, sha256(token));
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllUserSessions(userId: string) {
  run(`DELETE FROM sessions WHERE user_id = ?`, userId);
}

/** Resolves the current session user, or null. Rejects suspended users. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = get<{
    id: string;
    username: string;
    email: string;
    display_name: string;
    role: "PLAYER" | "ADMIN";
    status: "ACTIVE" | "SUSPENDED";
    avatar: string;
    created_at: string;
    expires_at: string;
  }>(
    `SELECT u.id, u.username, u.email, u.display_name, u.role, u.status, p.avatar, u.created_at, s.expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN profiles p ON p.user_id = u.id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
    sha256(token),
    nowIso()
  );
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    avatar: row.avatar,
    createdAt: row.created_at,
  };
}

/** Throwing variants for API handlers. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw ERRORS.UNAUTHORIZED();
  if (user.status === "SUSPENDED") throw ERRORS.SUSPENDED();
  return user;
}
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw ERRORS.FORBIDDEN();
  return user;
}
