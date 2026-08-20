"use client";

import { useCallback, useEffect, useState } from "react";
import { api, post, isUnauthorized, redirectToLogin } from "@/lib/api";
import type { NotificationsResponse, NotificationItem } from "@/lib/account-types";
import { useAccount } from "@/components/app/account-provider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const TYPE_ICON: Record<string, string> = {
  DAILY_BONUS: "🎁",
  GAME_REWARD: "🏆",
  ACHIEVEMENT: "🎯",
  LEVEL_UP: "⚡",
  REFERRAL: "🤝",
  CHALLENGE: "⚔️",
  ANNOUNCEMENT: "📢",
  ADMIN: "🛠️",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function Notifications() {
  const toast = useToast();
  const { refresh } = useAccount();
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<NotificationsResponse>("/api/notifications");
      setData(res);
    } catch (err) {
      if (isUnauthorized(err)) {
        redirectToLogin();
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markAllRead() {
    setMarking(true);
    try {
      await post("/api/notifications");
      await refresh(); // clears the shell notification badge immediately
      await load();
      toast.success("All notifications marked as read");
    } catch (err) {
      if (isUnauthorized(err)) {
        redirectToLogin();
        return;
      }
      toast.error(err instanceof Error ? err.message : "Could not mark notifications as read.");
    } finally {
      setMarking(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface/60" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-8 text-center">
        <p className="text-3xl" aria-hidden>⚠️</p>
        <h2 className="mt-3 font-display text-lg font-bold text-ink">Couldn't load notifications</h2>
        <p className="mt-1 text-sm text-mute">{error ?? "Notifications unavailable."}</p>
        <Button className="mt-5" onClick={() => void load()}>Try again</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black text-ink">Notifications</h1>
          <p className="mt-0.5 text-sm text-mute">
            {data.unread > 0 ? `${data.unread} unread` : "You're all caught up"}
          </p>
        </div>
        <Button variant="secondary" size="sm" loading={marking} disabled={data.unread === 0} onClick={markAllRead}>
          Mark all as read
        </Button>
      </header>

      {data.notifications.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-3xl" aria-hidden>🔔</p>
          <h2 className="mt-3 font-display text-lg font-bold text-ink">No notifications</h2>
          <p className="mt-1 text-sm text-mute">You'll see game results, rewards and updates here.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.notifications.map((n: NotificationItem) => (
            <Card key={n.id} className={`flex items-start gap-3 p-4 ${n.readAt ? "opacity-70" : ""}`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-xl" aria-hidden>
                {TYPE_ICON[n.type] ?? "🔔"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={`truncate text-sm font-bold text-ink ${n.readAt ? "" : ""}`}>{n.title}</p>
                  {!n.readAt ? (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-brand-2" aria-label="Unread" />
                  ) : null}
                </div>
                {n.body ? <p className="mt-0.5 text-sm text-mute">{n.body}</p> : null}
                <p className="mt-1 text-xs text-dim">{formatDate(n.createdAt)}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
