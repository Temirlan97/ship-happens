-- Backs the rate-limit COUNT query in functions/_shared/rateLimit.js
-- (WHERE ip_hash = ? AND created_at > ?).
CREATE INDEX idx_runs_ip_created ON runs(ip_hash, created_at);
