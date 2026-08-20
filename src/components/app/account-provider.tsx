"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, isUnauthorized, redirectToLogin } from "@/lib/api";
import type { MeResponse } from "@/lib/account-types";

interface AccountContextValue {
  /** Live account snapshot (balance, level, unread count, user). */
  me: MeResponse;
  /** Re-fetch the account from GET /api/auth/me (server stays authoritative). */
  refresh: () => Promise<void>;
  refreshing: boolean;
}

const AccountContext = createContext<AccountContextValue | null>(null);

/**
 * Client-side account state. Seeded with the server-rendered value so there is
 * no flash, then kept fresh via GET /api/auth/me whenever `refresh()` runs
 * (after economy-changing actions such as finishing a game or claiming a daily
 * reward). The server remains the source of truth — this context only mirrors it.
 */
export function AccountProvider({
  initialMe,
  children,
}: {
  initialMe: MeResponse;
  children: ReactNode;
}) {
  const [me, setMe] = useState<MeResponse>(initialMe);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await api<MeResponse>("/api/auth/me");
      setMe(fresh);
    } catch (err) {
      if (isUnauthorized(err)) {
        redirectToLogin();
      }
      // otherwise keep the last known value; do not mutate balance locally
    } finally {
      setRefreshing(false);
    }
  }, []);

  const value = useMemo(
    () => ({ me, refresh, refreshing }),
    [me, refresh, refreshing]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used within AccountProvider");
  return ctx;
}
