BEGIN;

CREATE TABLE IF NOT EXISTS app_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE,
  lifecycle_state text NOT NULL DEFAULT 'active' CHECK (
    lifecycle_state IN ('active', 'deletion_requested', 'purging')
  ),
  deletion_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT accounts_deletion_state_consistent CHECK (
    (lifecycle_state = 'active' AND deletion_requested_at IS NULL)
    OR
    (lifecycle_state IN ('deletion_requested', 'purging') AND deletion_requested_at IS NOT NULL)
  )
);

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS owner_id uuid;

ALTER TABLE poker_sessions
  ADD COLUMN IF NOT EXISTS owner_id uuid,
  ADD COLUMN IF NOT EXISTS owner_session_number bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'players_owner_id_fkey'
      AND conrelid = 'public.players'::regclass
  ) THEN
    ALTER TABLE players
      ADD CONSTRAINT players_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES accounts(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'poker_sessions_owner_id_fkey'
      AND conrelid = 'public.poker_sessions'::regclass
  ) THEN
    ALTER TABLE poker_sessions
      ADD CONSTRAINT poker_sessions_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES accounts(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'poker_sessions_owner_number_pair'
      AND conrelid = 'public.poker_sessions'::regclass
  ) THEN
    ALTER TABLE poker_sessions
      ADD CONSTRAINT poker_sessions_owner_number_pair
      CHECK (
        (owner_id IS NULL AND owner_session_number IS NULL)
        OR
        (owner_id IS NOT NULL AND owner_session_number IS NOT NULL)
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS players_owner_name_key_idx
  ON players (owner_id, name_key)
  WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS players_owner_active_name_idx
  ON players (owner_id, lower(name))
  WHERE owner_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS poker_sessions_owner_number_idx
  ON poker_sessions (owner_id, owner_session_number)
  WHERE owner_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS poker_sessions_owner_client_id_idx
  ON poker_sessions (owner_id, id)
  WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS poker_sessions_owner_played_at_idx
  ON poker_sessions (owner_id, played_at DESC, created_at DESC)
  WHERE owner_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS migration_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind text NOT NULL CHECK (source_kind IN ('player', 'session')),
  source_id text NOT NULL,
  target_owner_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  target_id text,
  review_status text NOT NULL DEFAULT 'pending' CHECK (
    review_status IN ('pending', 'approved', 'quarantined', 'migrated')
  ),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(provenance) = 'object'
  ),
  reviewed_at timestamptz,
  migrated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS migration_mapping_owner_source_idx
  ON migration_mapping (source_kind, source_id, target_owner_id)
  WHERE target_owner_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  actor_auth_user_id uuid NOT NULL,
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 100),
  target_kind text NOT NULL CHECK (char_length(target_kind) BETWEEN 1 AND 60),
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(details) = 'object'
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_owner_created_at_idx
  ON audit_events (owner_id, created_at DESC);

INSERT INTO app_migrations (version)
VALUES ('0001_owner_scope_foundation')
ON CONFLICT (version) DO NOTHING;

COMMIT;
