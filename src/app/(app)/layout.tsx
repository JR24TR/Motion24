import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/session";
import { getProfile } from "@/server/services/players";
import { getLevelInfo } from "@/server/services/levels";
import { unreadCount } from "@/server/services/notifications";
import { AppShell } from "@/components/app/app-shell";
import { AccountProvider } from "@/components/app/account-provider";
import type { MeResponse } from "@/lib/account-types";

export const dynamic = "force-dynamic";

/**
 * Authenticated application shell. Redirects unauthenticated users to /login,
 * refuses to render the player shell for suspended accounts, and builds the
 * `me` payload from the existing session + services. Private player data is
 * never rendered for unauthenticated clients.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // Suspended accounts must not get the normal authenticated shell.
  if (user.status === "SUSPENDED") redirect("/login");

  const profile = getProfile(user.id);
  const level = getLevelInfo(profile?.xp ?? 0);
  const unread = unreadCount(user.id);

  const me: MeResponse = {
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

  return (
    <AccountProvider initialMe={me}>
      <AppShell>{children}</AppShell>
    </AccountProvider>
  );
}
