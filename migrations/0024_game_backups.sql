BEGIN;

-- A copy of each game in progress, so a host can carry on from another
-- device if theirs dies. The host's device sends the whole game state every
-- few seconds while playing. One row per game (its save ID); the device that
-- writes it owns it until another device restores the game, which hands the
-- game over. Saving or discarding the game deletes the row, and a row nobody
-- updates for 7 days expires and is deleted by the daily purge job.
CREATE TABLE IF NOT EXISTS game_backups (
  owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  game_id text NOT NULL CHECK (game_id ~ '^[A-Za-z0-9._:-]{1,100}$'),
  device_id text NOT NULL CHECK (device_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  state jsonb NOT NULL CHECK (
    jsonb_typeof(state) = 'object' AND pg_column_size(state) < 262144
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  PRIMARY KEY (owner_id, game_id),
  CONSTRAINT game_backups_expiry_bounded CHECK (
    expires_at <= updated_at + interval '7 days'
  )
);

CREATE INDEX IF NOT EXISTS game_backups_expires_idx
  ON game_backups (expires_at);

ALTER TABLE game_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS game_backups_runtime_isolation ON game_backups;
CREATE POLICY game_backups_runtime_isolation ON game_backups
  FOR ALL
  TO menoka_app
  USING (owner_id = public.current_app_account_id())
  WITH CHECK (owner_id = public.current_app_account_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON game_backups TO menoka_app;

-- The daily purge job deletes expired backups. It runs as menoka_purge,
-- which has no table privileges, so it goes through this function.
CREATE OR REPLACE FUNCTION public.purge_expired_game_backups()
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH expired AS (
    DELETE FROM public.game_backups
    WHERE expires_at <= now()
    RETURNING 1
  )
  SELECT count(*)::integer FROM expired
$$;

REVOKE ALL ON FUNCTION public.purge_expired_game_backups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_game_backups() TO menoka_purge;

INSERT INTO app_migrations (version)
VALUES ('0024_game_backups')
ON CONFLICT (version) DO NOTHING;

COMMIT;
