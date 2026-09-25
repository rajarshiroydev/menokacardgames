BEGIN;

-- Requires the menoka_purge role, created beforehand with SQL as an
-- unprivileged login (see migrations/README.md). It receives no table
-- privileges: it can only call the functions below.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'menoka_purge') THEN
    RAISE EXCEPTION 'create the menoka_purge role before applying this migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'menoka_purge'
      AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)
  ) THEN
    RAISE EXCEPTION 'menoka_purge must not be an administrative role';
  END IF;
END
$$;

-- One row per purged account. It deliberately has no foreign key so it
-- outlives the account; the Auth user ID is cleared once the purge is done.
CREATE TABLE account_purges (
  account_id uuid PRIMARY KEY,
  auth_user_id uuid,
  deletion_requested_at timestamptz NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  identity_deleted_at timestamptz,
  data_deleted_at timestamptz,
  completed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text CHECK (char_length(last_error) <= 500),
  last_attempt_at timestamptz,
  CONSTRAINT account_purges_completion_consistent CHECK (
    completed_at IS NULL
    OR (identity_deleted_at IS NOT NULL AND data_deleted_at IS NOT NULL AND auth_user_id IS NULL)
  )
);

ALTER TABLE account_purges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON account_purges FROM PUBLIC;

-- Moves every account past its 30-day grace period to purging and returns
-- all unfinished purges, including ones a previous run could not finish.
CREATE FUNCTION public.purge_claim_due_accounts(max_accounts integer)
RETURNS TABLE (account_id uuid, auth_user_id uuid, attempts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  WITH due AS (
    UPDATE accounts AS account
    SET lifecycle_state = 'purging', updated_at = now()
    WHERE account.lifecycle_state = 'deletion_requested'
      AND account.deletion_requested_at <= now() - interval '30 days'
    RETURNING account.id, account.auth_user_id, account.deletion_requested_at
  )
  INSERT INTO account_purges (account_id, auth_user_id, deletion_requested_at)
  SELECT due.id, due.auth_user_id, due.deletion_requested_at FROM due
  ON CONFLICT ON CONSTRAINT account_purges_pkey DO NOTHING;

  RETURN QUERY
  SELECT purge.account_id, purge.auth_user_id, purge.attempts
  FROM account_purges AS purge
  WHERE purge.completed_at IS NULL
  ORDER BY purge.claimed_at
  LIMIT greatest(1, least(max_accounts, 100));
END
$$;

-- True while the Neon Auth user still exists, so the job can confirm a
-- deletion without relying on the provider's response code.
CREATE FUNCTION public.purge_auth_identity_exists(target_auth_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM neon_auth."user" WHERE id = target_auth_user_id
  )
$$;

CREATE FUNCTION public.purge_record_identity_deleted(target_account_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE account_purges
  SET identity_deleted_at = coalesce(identity_deleted_at, now())
  WHERE account_id = target_account_id AND completed_at IS NULL
$$;

-- Deletes the account and, through ON DELETE CASCADE, every row it owns.
-- Only accounts already claimed for purging whose identity is gone qualify.
CREATE FUNCTION public.purge_delete_account_data(target_account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  purge account_purges%ROWTYPE;
BEGIN
  SELECT * INTO purge FROM account_purges
  WHERE account_id = target_account_id AND completed_at IS NULL
  FOR UPDATE;
  IF NOT FOUND OR purge.identity_deleted_at IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM accounts
  WHERE id = target_account_id AND lifecycle_state = 'purging';

  UPDATE account_purges
  SET data_deleted_at = now(),
      completed_at = now(),
      auth_user_id = NULL,
      last_error = NULL,
      last_attempt_at = now(),
      attempts = attempts + 1
  WHERE account_id = target_account_id;
  RETURN true;
END
$$;

CREATE FUNCTION public.purge_record_failure(target_account_id uuid, failure text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE account_purges
  SET attempts = attempts + 1,
      last_error = left(failure, 500),
      last_attempt_at = now()
  WHERE account_id = target_account_id AND completed_at IS NULL
$$;

REVOKE ALL ON FUNCTION public.purge_claim_due_accounts(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_auth_identity_exists(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_record_identity_deleted(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_delete_account_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_record_failure(uuid, text) FROM PUBLIC;

GRANT USAGE ON SCHEMA public TO menoka_purge;
GRANT EXECUTE ON FUNCTION public.purge_claim_due_accounts(integer) TO menoka_purge;
GRANT EXECUTE ON FUNCTION public.purge_auth_identity_exists(uuid) TO menoka_purge;
GRANT EXECUTE ON FUNCTION public.purge_record_identity_deleted(uuid) TO menoka_purge;
GRANT EXECUTE ON FUNCTION public.purge_delete_account_data(uuid) TO menoka_purge;
GRANT EXECUTE ON FUNCTION public.purge_record_failure(uuid, text) TO menoka_purge;

INSERT INTO app_migrations (version)
VALUES ('0007_account_purge')
ON CONFLICT (version) DO NOTHING;

COMMIT;
