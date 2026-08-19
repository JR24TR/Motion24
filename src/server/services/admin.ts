import { get, run, all } from "@/server/db/client";
import { uuid, nowIso } from "@/server/lib/util";
import { ERRORS } from "@/server/lib/errors";
import { applyCoinChange } from "./coins";
import { pushNotification } from "./notifications";
import { withTx } from "@/server/db/client";

export type AdminAction = {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  reason: string | null;
  createdAt: string;
};

/** Every privileged mutation funnels through here — the audit log is law. */
export function recordAdminAction(
  adminId: string,
  action: string,
  target: { type: string; id?: string; label?: string },
  reason?: string,
  meta?: Record<string, unknown>
) {
  run(
    `INSERT INTO admin_actions (id, admin_id, action, target_type, target_id, target_label, reason, meta, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    uuid(),
    adminId,
    action,
    target.type,
    target.id ?? null,
    target.label ?? null,
    reason ?? null,
    meta ? JSON.stringify(meta) : null,
    nowIso()
  );
}

export function listAdminActions(limit = 100, action?: string): AdminAction[] {
  const where = action ? "WHERE a.action = ?" : "";
  const params: (string | number)[] = action ? [action] : [];
  return all<{
    id: string; admin_id: string; action: string; target_type: string; target_id: string;
    target_label: string; reason: string; created_at: string; admin_name: string;
  }>(
    `SELECT a.id, a.admin_id, a.action, a.target_type, a.target_id, a.target_label, a.reason, a.created_at,
       u.display_name AS admin_name
     FROM admin_actions a JOIN users u ON u.id = a.admin_id
     ${where} ORDER BY a.created_at DESC LIMIT ?`,
    ...params,
    limit
  ).map((r) => ({
    id: r.id,
    adminId: r.admin_id,
    adminName: r.admin_name,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    targetLabel: r.target_label,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}

// ---- user management ------------------------------------------------------

export type AdminUserRow = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: string;
  status: string;
  avatar: string;
  balance: number;
  gamesPlayed: number;
  gamesWon: number;
  createdAt: string;
  lastLoginAt: string | null;
};

export function searchUsers(query: string, limit = 50): AdminUserRow[] {
  const q = `%${query.trim()}%`;
  return all<{
    id: string; username: string; display_name: string; email: string; role: string; status: string;
    avatar: string; balance: number; games_played: number; games_won: number; created_at: string; last_login_at: string | null;
  }>(
    `SELECT u.id, u.username, u.display_name, u.email, u.role, u.status, p.avatar, u.created_at, u.last_login_at,
       p.balance, p.games_played, p.games_won
     FROM users u JOIN profiles p ON p.user_id = u.id
     WHERE u.username LIKE ? OR u.display_name LIKE ? OR u.email LIKE ?
     ORDER BY u.created_at DESC LIMIT ?`,
    q,
    q,
    q,
    limit
  ).map((r) => ({
    id: r.id, username: r.username, displayName: r.display_name, email: r.email,
    role: r.role, status: r.status, avatar: r.avatar, balance: r.balance,
    gamesPlayed: r.games_played, gamesWon: r.games_won, createdAt: r.created_at, lastLoginAt: r.last_login_at,
  }));
}

/** Admin ARC adjustment — reason mandatory, ledger row mandatory. */
export function adjustBalance(
  adminId: string,
  adminName: string,
  userId: string,
  amount: number,
  reason: string
): { balance: number } {
  return withTx(() => {
    const user = get<{ display_name: string; username: string }>(
      `SELECT display_name, username FROM users WHERE id = ?`,
      userId
    );
    if (!user) throw ERRORS.NOT_FOUND("user");
    const res = applyCoinChange({
      userId,
      amount,
      type: "ADMIN_ADJUSTMENT",
      description: `${amount > 0 ? "Admin credit" : "Admin debit"} — ${reason}`,
      meta: { adminId, reason },
    });
    recordAdminAction(adminId, amount > 0 ? "COINS_ADD" : "COINS_REMOVE", { type: "USER", id: userId, label: user.username }, reason, { amount });
    pushNotification(
      userId,
      "ADMIN",
      `${amount > 0 ? "+" : ""}${amount.toLocaleString()} ARC adjustment`,
      `Reason: ${reason}`
    );
    return { balance: res.balance };
  });
}

export function setUserStatus(
  adminId: string,
  userId: string,
  status: "ACTIVE" | "SUSPENDED",
  reason: string
) {
  return withTx(() => {
    const user = get<{ username: string; role: string }>(`SELECT username, role FROM users WHERE id = ?`, userId);
    if (!user) throw ERRORS.NOT_FOUND("user");
    if (user.role === "ADMIN") throw ERRORS.BAD_REQUEST("Admin accounts cannot be suspended.");
    run(`UPDATE users SET status = ?, updated_at = ? WHERE id = ?`, status, nowIso(), userId);
    if (status === "SUSPENDED") {
      run(`DELETE FROM sessions WHERE user_id = ?`, userId); // kill active logins immediately
      pushNotification(userId, "ADMIN", "Account suspended", `Reason: ${reason}`);
    } else {
      pushNotification(userId, "ADMIN", "Account reactivated", "Welcome back to the Arena. Play nice!");
    }
    recordAdminAction(
      adminId,
      status === "SUSPENDED" ? "USER_SUSPEND" : "USER_UNSUSPEND",
      { type: "USER", id: userId, label: user.username },
      reason
    );
  });
}

// ---- announcements ---------------------------------------------------------

export function broadcastAnnouncement(adminId: string, title: string, body: string) {
  return withTx(() => {
    const users = all<{ id: string }>(`SELECT id FROM users WHERE status = 'ACTIVE' AND role = 'PLAYER'`);
    for (const u of users) pushNotification(u.id, "ANNOUNCEMENT", title, body);
    recordAdminAction(adminId, "ANNOUNCEMENT", { type: "PLATFORM" }, undefined, { title, body, recipients: users.length });
    return users.length;
  });
}
