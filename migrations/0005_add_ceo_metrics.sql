-- Pure telemetry for the CEO feature — not displayed anywhere yet (not the
-- game-over stats card, not admin.html), collected for later analytics.
ALTER TABLE runs ADD COLUMN ceo_gender TEXT;
ALTER TABLE runs ADD COLUMN ceo_ability_uses INTEGER;
ALTER TABLE runs ADD COLUMN ceo_crisis_ms INTEGER;
ALTER TABLE runs ADD COLUMN ceo_peak_state INTEGER;
