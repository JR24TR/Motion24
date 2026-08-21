import { run, all, get } from "@/server/db/client";
import { uuid, nowIso } from "@/server/lib/util";

export type NotificationType =
  | "DAILY_BONUS"
  | "GAME_REWARD"
  | "ACHIEVEMENT"
  | "LEVEL_UP"
  | "REFERRAL"
  | "CHALLENGE"
  | "ANNOUNCEMENT"
  | "ADMIN"
  | "PURCHASE";

/** Insert a notification. Safe to call inside an ongoing transaction. */
export function pushNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body = "",
  meta?: Record<string, unknown>
) {
  run(
    `INSERT INTO notifications (id, user_id, type, title, body, meta, read_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    uuid(),
    userId,
    type,
    title,
    body,
    meta ? JSON.stringify(meta) : null,
    nowIso()
  );
}

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

export function listNotifications(userId: string, limit = 50): NotificationRow[] {
  return all<{
    id: string;
    type: string;
    title: string;
    body: string;
    read_at: string | null;
    created_at: string;
  }>(
    `SELECT id, type, title, body, read_at, created_at FROM notifications
     WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
    userId,
    limit
  ).map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    readAt: r.read_at,
    createdAt: r.created_at,
  }));
}

export function unreadCount(userId: string): number {
  const row = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL`,
    userId
  );
  return row?.n ?? 0;
}

export function markAllRead(userId: string) {
  run(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL`, nowIso(), userId);
}
