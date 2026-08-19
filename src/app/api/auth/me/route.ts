import { handle } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/services/players";
import { getLevelInfo } from "@/server/services/levels";
import { unreadCount } from "@/server/services/notifications";

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const profile = getProfile(user.id);
    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        avatar: profile?.avatar ?? "🎮",
      },
      balance: profile?.balance ?? 0,
      level: getLevelInfo(profile?.xp ?? 0),
      unreadNotifications: unreadCount(user.id),
    };
  });
}
