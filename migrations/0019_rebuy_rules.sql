BEGIN;

-- Rebuy limits a host chose for a game: the most rebuys each player may make
-- and the big blind at which rebuys close, either null for no limit. NULL for
-- the column means no limits, which is every game saved before this one.
-- The API validates the shape (lib/poker/session-validation.ts); the check
-- below only keeps it a JSON object. menoka_app already has INSERT, UPDATE
-- and SELECT on poker_sessions, and row security covers the new column.
ALTER TABLE poker_sessions
  ADD COLUMN IF NOT EXISTS rebuy_rules jsonb
  CONSTRAINT poker_sessions_rebuy_rules_object CHECK (
    rebuy_rules IS NULL OR jsonb_typeof(rebuy_rules) = 'object'
  );

INSERT INTO app_migrations (version)
VALUES ('0019_rebuy_rules')
ON CONFLICT (version) DO NOTHING;

COMMIT;
