import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { getProfile } from "@/server/services/players";
import { getLevelInfo } from "@/server/services/levels";
import { unreadCount } from "@/server/services/notifications";
import { AppShell } from "@/components/app/app-shell";
import type { Me } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Authenticated application shell. Redirects unauthenticated users to
 * /login and builds the `me` payload from the existing session + services.
 * Private player data is never rendered for unauthenticated clients.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const profile = getProfile(user.id);
  const level = getLevelInfo(profile?.xp ?? 0);
  const unread = unreadCount(user.id);

  const me: Me = {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      avatar: user.avatar,
    },
    balance: profile?.balance ?? 0,
    level,
    unreadNotifications: unread,
  };

  return <AppShell me={me}>{children}</AppShell>;
}
