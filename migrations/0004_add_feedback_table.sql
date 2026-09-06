CREATE TABLE feedback (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at INTEGER NOT NULL,
  message    TEXT NOT NULL,
  ip_hash    TEXT,
  user_agent TEXT
);

CREATE INDEX idx_feedback_ip_created ON feedback(ip_hash, created_at);
CREATE INDEX idx_feedback_created_at ON feedback(created_at);
