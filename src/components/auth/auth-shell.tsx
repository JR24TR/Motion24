import Link from "next/link";
import type { ReactNode } from "react";

/** Shared centered shell for all authentication pages. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div className="grid-backdrop absolute inset-0" aria-hidden />
      <div className="relative w-full max-w-md">
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5"
            aria-label="MOTION24 home"
          >
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 text-lg font-black text-white shadow-lg shadow-brand/30">
              M
            </span>
            <span className="font-display text-xl font-bold tracking-wide text-ink">
              MOTION<span className="arc-text">24</span>
            </span>
          </Link>
        </div>
        <div className="card animate-rise p-6 sm:p-7">
          <h1 className="font-display text-2xl font-black text-ink">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm leading-relaxed text-mute">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-5 text-center text-sm text-mute">{footer}</div> : null}
        <p className="mt-8 text-center text-xs text-dim">
          ARC is virtual currency with no real-world value.
        </p>
      </div>
    </main>
  );
}
