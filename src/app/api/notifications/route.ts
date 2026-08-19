import { handle } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { listNotifications, markAllRead, unreadCount } from "@/server/services/notifications";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    return { notifications: listNotifications(user.id), unread: unreadCount(user.id) };
  });
}

export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    markAllRead(user.id);
    return { ok: true };
  });
}
