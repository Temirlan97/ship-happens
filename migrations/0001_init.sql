CREATE TABLE runs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  session_secret     TEXT NOT NULL UNIQUE,
  created_at         INTEGER NOT NULL,
  finished_at        INTEGER,
  duration_seconds   INTEGER,
  last_checkpoint_at INTEGER,
  checkpoint_count   INTEGER NOT NULL DEFAULT 0,
  claimed_sprint     INTEGER NOT NULL DEFAULT 0,
  claimed_budget     INTEGER,
  claimed_income     INTEGER,
  claimed_salaries   INTEGER,
  claimed_lost       INTEGER,
  claimed_kills      INTEGER,
  suspicious         INTEGER NOT NULL DEFAULT 0,
  suspicious_reason  TEXT,
  player_name        TEXT,
  name_set_at        INTEGER,
  approved           INTEGER NOT NULL DEFAULT 1,
  ip_hash            TEXT,
  user_agent         TEXT
);

CREATE INDEX idx_runs_leaderboard ON runs(approved, suspicious, claimed_sprint DESC, claimed_budget DESC);
CREATE INDEX idx_runs_created_at ON runs(created_at);
