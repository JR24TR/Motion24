"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { post } from "@/lib/api";
import type { Me } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { LevelBadge } from "@/components/ui/level-badge";
import { ArcCoin } from "@/components/ui/arc";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/games", label: "Games", icon: "🎮" },
  { href: "/earn", label: "Earn", icon: "🪙" },
  { href: "/leaderboard", label: "Leaderboard", icon: "🏆" },
  { href: "/transactions", label: "Transactions", icon: "💸" },
  { href: "/achievements", label: "Achievements", icon: "🎯" },
  { href: "/notifications", label: "Notifications", icon: "🔔" },
  { href: "/profile", label: "Profile", icon: "👤" },
  { href: "/rules", label: "Rules", icon: "📜" },
];

/** Primary items shown in the mobile bottom bar. */
const BOTTOM_NAV = NAV.slice(0, 5);

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}

export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await post("/api/auth/logout");
    } catch {
      // ignore — session will still be cleared client-side on navigation
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <div className="min-h-dvh bg-bg">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-bg-2 lg:flex">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-5 pb-4 pt-5" aria-label="MOTION24 dashboard">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-2 text-base font-black text-white shadow-lg shadow-brand/30">
            M
          </span>
          <span className="font-display text-lg font-bold tracking-wide text-ink">
            MOTION<span className="arc-text">24</span>
          </span>
        </Link>

        {/* player card */}
        <div className="mx-3 mb-3 rounded-2xl border border-line bg-surface p-3">
          <div className="flex items-center gap-3">
            <Avatar avatar={me.user.avatar} name={me.user.displayName} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-ink">{me.user.displayName}</p>
              <p className="truncate text-xs text-dim">@{me.user.username}</p>
            </div>
            <LevelBadge level={me.level.level} />
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl border border-line bg-bg-2 px-3 py-2">
            <span className="text-[11px] uppercase tracking-wider text-dim">Balance</span>
            <ArcCoin amount={me.balance} />
          </div>
          <div className="mt-2 px-1">
            <div className="flex justify-between text-[11px] text-dim">
              <span>XP {me.level.xpIntoLevel.toLocaleString()}</span>
              <span>{me.level.xpForNextLevel.toLocaleString()}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand to-brand-2 transition-all"
                style={{ width: `${Math.round(me.level.progress * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* nav */}
        <nav aria-label="Primary" className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                  active
                    ? "bg-brand/15 text-ink"
                    : "text-mute hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <span aria-hidden className="text-base">
                  {item.icon}
                </span>
                {item.label}
                {item.href === "/notifications" && me.unreadNotifications > 0 ? (
                  <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-lose px-1 text-[11px] font-bold text-white">
                    {me.unreadNotifications > 99 ? "99+" : me.unreadNotifications}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={logout}
            disabled={loggingOut}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-lose transition hover:bg-lose/10 disabled:opacity-60"
          >
            {loggingOut ? "Signing out…" : "Log out"}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-line bg-bg/85 px-4 pt-safe backdrop-blur-md lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 py-2.5" aria-label="MOTION24 dashboard">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand to-brand-2 text-sm font-black text-white">
            M
          </span>
          <span className="font-display text-base font-bold text-ink">
            MOTION<span className="arc-text">24</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-line bg-surface px-2 py-1.5">
            <ArcCoin amount={me.balance} className="text-xs" />
          </div>
          <Link
            href="/notifications"
            className="relative grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface text-base"
            aria-label={`Notifications${me.unreadNotifications ? `, ${me.unreadNotifications} unread` : ""}`}
          >
            🔔
            {me.unreadNotifications > 0 ? (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-lose px-0.5 text-[10px] font-bold text-white">
                {me.unreadNotifications > 99 ? "99+" : me.unreadNotifications}
              </span>
            ) : null}
          </Link>
          <Link href="/profile" aria-label="Profile">
            <Avatar avatar={me.user.avatar} name={me.user.displayName} size="sm" />
          </Link>
        </div>
      </header>

      {/* Main content */}
      <div className="lg:pl-64">
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 pb-28 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg-2/95 pb-safe backdrop-blur-md lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around">
          {BOTTOM_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition ${
                  active ? "text-brand-2" : "text-mute"
                }`}
              >
                <span aria-hidden className="text-lg leading-none">
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
