-- ============================================================
-- ARENA platform — relational schema (SQLite)
-- All coin mutations happen inside DB transactions only.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name   TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'PLAYER' CHECK (role IN ('PLAYER','ADMIN')),
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
  referral_code  TEXT NOT NULL UNIQUE,
  referred_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  last_login_at  TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE TABLE IF NOT EXISTS profiles (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar             TEXT NOT NULL DEFAULT '🎮',
  bio                TEXT NOT NULL DEFAULT '',
  xp                 INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  balance            INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  games_played       INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  games_won          INTEGER NOT NULL DEFAULT 0 CHECK (games_won >= 0),
  lifetime_earned    INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
  lifetime_spent     INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- Server-side sessions (token hash stored; raw token lives in httpOnly cookie)
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT '🎮',
  thumbnail   TEXT,
  difficulty  TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (difficulty IN ('EASY','MEDIUM','HARD')),
  entry_cost  INTEGER NOT NULL DEFAULT 0 CHECK (entry_cost >= 0),
  max_reward  INTEGER NOT NULL DEFAULT 0 CHECK (max_reward >= 0),
  engine      TEXT NOT NULL,
  config      TEXT NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  play_count  INTEGER NOT NULL DEFAULT 0 CHECK (play_count >= 0),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id     TEXT NOT NULL REFERENCES games(id),
  status      TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','ABANDONED','EXPIRED')),
  entry_cost  INTEGER NOT NULL DEFAULT 0,
  score       INTEGER,
  is_win      INTEGER NOT NULL DEFAULT 0,
  reward      INTEGER NOT NULL DEFAULT 0,
  xp_earned   INTEGER NOT NULL DEFAULT 0,
  started_at  TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_gs_user ON game_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_gs_status ON game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_gs_game ON game_sessions(game_id);

-- Append-only coin ledger. `amount` is signed; `balance_after` snapshots state.
CREATE TABLE IF NOT EXISTS transactions (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount          INTEGER NOT NULL,
  type            TEXT NOT NULL CHECK (type IN (
                    'EARN','SPEND','GAME_ENTRY','GAME_REWARD','DAILY_BONUS',
                    'ACHIEVEMENT','REFERRAL','ADMIN_ADJUSTMENT','CHALLENGE',
                    'REFUND','WELCOME','EVENT')),
  description     TEXT NOT NULL,
  balance_after   INTEGER NOT NULL,
  game_session_id TEXT REFERENCES game_sessions(id),
  day_key         TEXT,
  meta            TEXT,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_user_created ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_type_created ON transactions(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at DESC);
-- one-per-day dedupe guard (daily bonus / daily challenges)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_daily_dedupe
  ON transactions(user_id, type, day_key) WHERE day_key IS NOT NULL;
-- one reward transaction per game session
CREATE UNIQUE INDEX IF NOT EXISTS idx_tx_session_reward
  ON transactions(game_session_id) WHERE game_session_id IS NOT NULL AND type IN ('GAME_REWARD','REFUND');

CREATE TABLE IF NOT EXISTS achievements (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL,
  criteria    TEXT NOT NULL, -- JSON, e.g. {"type":"WINS","value":5}
  xp_reward   INTEGER NOT NULL DEFAULT 0 CHECK (xp_reward >= 0),
  arc_reward  INTEGER NOT NULL DEFAULT 0 CHECK (arc_reward >= 0),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, achievement_id)
);

-- Admin-configurable reward values (single source of truth, no hardcoding)
CREATE TABLE IF NOT EXISTS rewards (
  code        TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  arc_amount  INTEGER NOT NULL DEFAULT 0,
  xp_amount   INTEGER NOT NULL DEFAULT 0,
  updated_by  TEXT,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Materialized leaderboard aggregates, maintained inside the same
-- transaction as every coin/game event. period_key rolls weekly/monthly.
CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period       TEXT NOT NULL CHECK (period IN ('ALL','WEEKLY','MONTHLY')),
  period_key   TEXT NOT NULL,
  coins_earned INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  wins         INTEGER NOT NULL DEFAULT 0,
  xp           INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL,
  UNIQUE (user_id, period, period_key)
);
CREATE INDEX IF NOT EXISTS idx_lb_rank ON leaderboard_entries(period, period_key, coins_earned DESC);

CREATE TABLE IF NOT EXISTS admin_actions (
  id           TEXT PRIMARY KEY,
  admin_id     TEXT NOT NULL REFERENCES users(id),
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    TEXT,
  target_label TEXT,
  reason       TEXT,
  meta         TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions(created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  meta       TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);
