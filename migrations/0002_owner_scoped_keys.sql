BEGIN;

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS next_session_number bigint NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'accounts_next_session_number_positive'
      AND conrelid = 'public.accounts'::regclass
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_next_session_number_positive
      CHECK (next_session_number > 0);
  END IF;
END
$$;

ALTER TABLE players
  DROP CONSTRAINT IF EXISTS players_name_key_key;

ALTER TABLE poker_sessions
  ADD COLUMN IF NOT EXISTS record_id uuid DEFAULT gen_random_uuid();

ALTER TABLE poker_sessions
  ALTER COLUMN record_id SET NOT NULL;

ALTER TABLE poker_sessions
  DROP CONSTRAINT IF EXISTS poker_sessions_pkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'poker_sessions_pkey'
      AND conrelid = 'public.poker_sessions'::regclass
  ) THEN
    ALTER TABLE poker_sessions
      ADD CONSTRAINT poker_sessions_pkey PRIMARY KEY (record_id);
  END IF;
END
$$;

DROP INDEX IF EXISTS poker_sessions_session_number_idx;

CREATE UNIQUE INDEX IF NOT EXISTS poker_sessions_legacy_id_idx
  ON poker_sessions (id)
  WHERE owner_id IS NULL;

INSERT INTO app_migrations (version)
VALUES ('0002_owner_scoped_keys')
ON CONFLICT (version) DO NOTHING;

COMMIT;
