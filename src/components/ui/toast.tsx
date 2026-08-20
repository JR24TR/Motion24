"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

export interface ToastApi {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

const KIND_STYLES: Record<ToastKind, string> = {
  success: "border-win/40 bg-win/10 text-ink",
  error: "border-lose/40 bg-lose/10 text-ink",
  info: "border-line-2 bg-surface-2 text-ink",
};

const KIND_ICON: Record<ToastKind, string> = {
  success: "✓",
  error: "!",
  info: "i",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, title: string, message?: string) => {
      const id = nextId++;
      setToasts((t) => [...t.slice(-3), { id, kind, title, message }]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, message) => push("success", title, message),
      error: (title, message) => push("error", title, message),
      info: (title, message) => push("info", title, message),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-sm animate-rise items-start gap-3 rounded-2xl border px-4 py-3 shadow-xl shadow-black/40 backdrop-blur ${KIND_STYLES[t.kind]}`}
          >
            <span
              className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-black"
              aria-hidden
            >
              {KIND_ICON[t.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{t.title}</p>
              {t.message ? <p className="mt-0.5 text-xs leading-relaxed text-mute">{t.message}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-mute transition hover:bg-white/5 hover:text-ink"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

/** Convenience hook that maps an unknown error (ApiClientError) to a toast. */
export function useToastError(): (err: unknown, fallback?: string) => void {
  const toast = useToast();
  return useCallback(
    (err: unknown, fallback = "Something went wrong.") => {
      const message = err instanceof Error && err.message ? err.message : fallback;
      toast.error(message);
    },
    [toast]
  );
}
