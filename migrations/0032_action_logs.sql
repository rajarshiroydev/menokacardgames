BEGIN;

-- Saved action logs (0032). `action_log`: the game's log when it was saved,
-- { "players": [{ "id"?, "name" }], "lines": [text, ...] }, newest line
-- first, with the players in seat order as the lines name them. NULL for
-- games saved before this, imported games and games saved without one. The
-- API validates the contents (lib/poker/session-validation.ts); the database
-- keeps the shape and a ceiling on lines. menoka_app already has the table
-- privileges, and row security covers the new column. Friends' views
-- (friend_group_sessions) don't return it.
ALTER TABLE poker_sessions
  ADD COLUMN IF NOT EXISTS action_log jsonb
  CONSTRAINT poker_sessions_action_log_shape CHECK (
    action_log IS NULL OR (
      jsonb_typeof(action_log) = 'object'
      AND jsonb_typeof(action_log -> 'players') = 'array'
      AND jsonb_typeof(action_log -> 'lines') = 'array'
      AND jsonb_array_length(action_log -> 'lines') <= 5000
    )
  );

INSERT INTO app_migrations (version)
VALUES ('0032_action_logs')
ON CONFLICT (version) DO NOTHING;

COMMIT;
