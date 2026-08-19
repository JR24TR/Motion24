import Link from "next/link";
import { publicPlatformStats } from "@/server/services/stats";
import { listGames } from "@/server/services/games";
import { getLeaderboard } from "@/server/services/leaderboard";

export const dynamic = "force-dynamic";

export default function LandingPage() {
  const stats = publicPlatformStats();
  const games = listGames({ activeOnly: true });
  const top = getLeaderboard("ALL", 5);

  return (
    <main className="min-h-dvh">
      {/* nav */}
      <header className="sticky top-0 z-20 border-b border-line/60 bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-2 text-lg font-black text-white shadow-lg shadow-brand/30">
              A
            </span>
            <span className="font-display text-lg font-bold tracking-wide">ARENA</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-xl px-4 py-2 text-sm font-semibold text-mute transition hover:bg-surface-2 hover:text-ink"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-xl bg-gradient-to-r from-brand to-brand-2 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-brand/25 transition hover:brightness-110"
            >
              Create account
            </Link>
          </nav>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="grid-backdrop absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-16 text-center sm:pt-24">
          <p className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-4 py-1.5 text-xs font-semibold tracking-wider text-mute uppercase">
            <span className="h-2 w-2 rounded-full bg-win" /> Private club · Invite your crew
          </p>
          <h1 className="font-display text-4xl font-black leading-tight sm:text-6xl">
            Play. Earn <span className="arc-text">ARC</span>.
            <br />
            <span className="gradient-text">Rule the Arena.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-mute sm:text-lg">
            A private gaming platform for you and your friends. Earn Arena Coins, spend them
            on games, unlock achievements and fight for the top of the leaderboard.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="w-full rounded-2xl bg-gradient-to-r from-brand to-brand-2 px-8 py-4 text-base font-bold text-white shadow-xl shadow-brand/30 transition hover:brightness-110 sm:w-auto"
            >
              Create your account
            </Link>
            <a
              href="#games"
              className="w-full rounded-2xl border border-line bg-surface px-8 py-4 text-base font-semibold text-ink transition hover:border-line-2 sm:w-auto"
            >
              Preview the games
            </a>
          </div>
          <dl className="mx-auto mt-12 grid max-w-2xl grid-cols-3 gap-3">
            {[
              { label: "Players", value: stats.players },
              { label: "Games played", value: stats.played },
              { label: "ARC in circulation", value: stats.arcOut },
            ].map((s) => (
              <div key={s.label} className="card px-3 py-4">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-dim">
                  {s.label}
                </dt>
                <dd className="tnum mt-1 font-display text-xl font-bold text-ink sm:text-2xl">
                  {s.value.toLocaleString()}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* how it works */}
      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="font-display text-2xl font-bold sm:text-3xl">How the Arena works</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: "🪙",
              title: "Earn ARC",
              text: "Daily login bonuses, game victories, challenges, achievements and referral rewards all pay out in Arena Coins.",
            },
            {
              icon: "🎮",
              title: "Spend & play",
              text: "Use ARC to enter games. Skill decides your reward tier — from a small consolation to the max payout.",
            },
            {
              icon: "🏆",
              title: "Climb the ranks",
              text: "Every coin you earn moves you up the weekly, monthly and all-time leaderboards. Chase XP and level up.",
            },
          ].map((c) => (
            <div key={c.title} className="card p-5">
              <div className="text-3xl">{c.icon}</div>
              <h3 className="font-display mt-3 text-lg font-bold">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-mute">{c.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-xl border border-line bg-surface/60 p-3 text-xs leading-relaxed text-dim">
          ARC (Arena Coins) is a virtual currency for this platform only. It has no real-world
          monetary value, cannot be withdrawn and cannot be exchanged for cash.
        </p>
      </section>

      {/* games preview */}
      <section id="games" className="mx-auto max-w-6xl px-4 py-12">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Games</h2>
          <span className="text-sm text-dim">{games.length} live</span>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {games.map((g) => (
            <div key={g.id} className="card relative overflow-hidden p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface-2 text-2xl">
                  {g.icon}
                </div>
                <span className="rounded-full border border-line bg-surface-2 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-mute">
                  {g.difficulty}
                </span>
              </div>
              <h3 className="font-display mt-4 text-xl font-bold">{g.name}</h3>
              <p className="mt-1 line-clamp-2 text-sm text-mute">{g.description}</p>
              <div className="mt-4 flex items-center gap-3 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-dim">Entry</p>
                  <p className="tnum font-bold text-lose">{g.entryCost.toLocaleString()} ARC</p>
                </div>
                <div className="h-8 w-px bg-line" />
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-dim">Reward up to</p>
                  <p className="tnum font-bold text-arc">{g.maxReward.toLocaleString()} ARC</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* leaderboard preview */}
      <section className="mx-auto max-w-6xl px-4 py-12 pb-24">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Leaderboard</h2>
          <span className="text-sm text-dim">All-time top {Math.min(5, Math.max(top.length, 1))}</span>
        </div>
        <div className="card mt-6 divide-y divide-line/60">
          {top.length === 0 && (
            <p className="p-6 text-center text-sm text-dim">
              No coins earned yet — the first legend is still unwritten.
            </p>
          )}
          {top.map((row) => (
            <div key={row.userId} className="flex items-center gap-3 p-4">
              <span
                className={`tnum grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-black ${
                  row.rank === 1
                    ? "bg-arc/20 text-arc"
                    : row.rank <= 3
                      ? "bg-brand/20 text-brand-2"
                      : "bg-surface-2 text-mute"
                }`}
              >
                {row.rank}
              </span>
              <span className="text-xl">{row.avatar}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{row.displayName}</p>
                <p className="truncate text-xs text-dim">@{row.username}</p>
              </div>
              <div className="text-right">
                <p className="tnum text-sm font-bold text-arc">{row.coins.toLocaleString()} ARC</p>
                <p className="text-xs text-dim">{row.wins} wins</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line/60 py-8 text-center text-xs text-dim">
        ARENA · a private gaming community · ARC has no cash value and cannot be withdrawn
      </footer>
    </main>
  );
}
