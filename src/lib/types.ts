/**
 * Client-safe shared types. Mirrors the shapes returned by the backend
 * services/routes. Must never import from `src/server/*`.
 */

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: "PLAYER" | "ADMIN";
  avatar: string;
}

export interface LevelInfo {
  level: number;
  xp: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  progress: number; // 0..1
}

/** Shape returned by GET /api/auth/me. */
export interface Me {
  user: SessionUser;
  balance: number;
  level: LevelInfo;
  unreadNotifications: number;
}
