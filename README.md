# ARENA — Private Gaming Platform

A full-stack gaming platform for a private crew: earn virtual **ARC** (Arena Coins), spend
them on games, unlock achievements, and climb leaderboards. **ARC is virtual currency with
no real-world monetary value — it cannot be withdrawn or exchanged for cash.**

## Status

This branch is a **work-in-progress checkpoint** (Phase 1 core + backend for Phases 2–3):

**Implemented & smoke-tested**
- Full relational schema on SQLite (`node:sqlite`, WAL, FKs enforced, atomic `BEGIN IMMEDIATE` transactions)
- Server-side session auth (httpOnly cookie, bcrypt password hashing, DB-backed sessions)
- Registration (with optional referral codes), login, logout, password reset tokens
- ARC ledger: single choke-point (`applyCoinChange`) for every coin mutation — balance check,
  profile update, ledger row and leaderboard aggregate commit atomically; negative balances,
  duplicate daily rewards and replayed payouts are blocked by constraints
- Configurable rewards (`rewards` table) — daily login, victory floor, daily challenge,
  referral, welcome grant, XP grants — no reward values hardcoded
- XP/level system with configurable curve (`settings` table)
- Achievements engine (definitions stored in DB, auto-unlock with ARC + XP payouts)
- Game engine registry + full game-session lifecycle (entry fee → session → server-validated
  finish → reward tiers), seeded with **COIN RUSH** (entry 500 ARC, up to 2,500 ARC)
- Materialized leaderboards (all-time / weekly / monthly)
- Notifications system (in-app)
- Admin APIs: stats, user search, ARC adjustments (reason required), suspend/reactivate,
  game CRUD, reward/settings config, announcements, thumbnail upload — all role-gated on
  the server, every action audit-logged (`admin_actions`)
- Data-driven public landing page (live games, leaderboard preview, platform stats)

**Not yet built (next on this branch)**
- Auth + player UI pages (login/register/forgot, dashboard, games hub, playable COIN RUSH
  client, earn, leaderboard, profile, transactions, achievements, notifications)
- Admin panel UI
- Bottom-nav mobile shell

## Stack

- **Next.js 16** (App Router, TypeScript, server components + route handlers)
- **Tailwind CSS v4** dark gaming design system
- **SQLite** via Node's built-in `node:sqlite` (zero external DB services; atomic transactions)
- **bcryptjs** for password hashing, **zod** for input validation

## Run

```bash
npm install
npm run dev     # http://localhost:3000 — DB auto-creates and seeds on first request
```

The database lives at `data/app.db` (gitignored). Delete it to re-seed from scratch.

## Seeded accounts

| Account | Username | Password | Notes |
|---|---|---|---|
| Admin | `admin` (override with `ADMIN_USERNAME`) | **Set `ADMIN_PASSWORD` before first boot** — if unset, a random temporary password is generated and printed **once** to the server console (dev only). It is never stored in source or returned by any API. | full admin panel access |
| Demo players | `nova`, `pixel`, `raven`, `mite`, `zephyr` | `demo-player` | **dev/test data only** — regular PLAYER accounts with fake `@demo.arena.local` emails, seeded so the leaderboard looks alive. Delete freely. |

## Architecture

```
src/
  app/            pages (server components) + /api route handlers
  server/         backend only — never imported by client components
    db/           schema.sql, connection, transactional bootstrap + seed
    auth/         sessions, password hashing, role guards
    games/        engine registry (add new games here)
    services/     coins ledger, XP/levels, achievements, leaderboards,
                  notifications, players, games, admin, stats
    lib/          errors, validation schemas, ids/time helpers
  components/     (UI layer — coming next)
  lib/            shared client-safe helpers
```

### Key invariants
- `profiles.balance` is only ever written by `applyCoinChange()` (inside a transaction,
  with a matching `transactions` ledger row carrying `balance_after`).
- One reward payout per game session, one daily-bonus/challenge claim per user per day
  (enforced by partial unique indexes, not just app checks).
- Admin APIs verify `role === 'ADMIN'` server-side on every request; admin actions are
  audit-logged with actor, target and reason.

### Known limitations (honest notes)
- Browser games can't be fully trusted on score submission. The server clamps scores to the
  engine's theoretical maximum and validates elapsed time, but a determined client could
  still report a max score — acceptable for a friends-only platform; server-simulated games
  would be needed for stronger guarantees.
- Password reset never returns a usable link in API responses. Reset URLs are logged
  server-side in development; an explicit `ARENA_DEV_RESET_LINKS=true` flag (default off,
  forced off in production) can return them for local testing until a mail provider is
  configured.
