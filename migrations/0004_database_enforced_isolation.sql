BEGIN;

DO $$
DECLARE
  application_role pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO application_role
  FROM pg_roles
  WHERE rolname = 'menoka_app';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Create the menoka_app login role before this migration';
  END IF;

  IF application_role.rolsuper
    OR application_role.rolcreaterole
    OR application_role.rolcreatedb
    OR application_role.rolbypassrls
  THEN
    RAISE EXCEPTION 'menoka_app must not have administrative or BYPASSRLS capabilities';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_auth_members AS membership
    JOIN pg_roles AS parent ON parent.oid = membership.roleid
    WHERE membership.member = application_role.oid
      AND parent.rolname = 'neon_superuser'
  ) THEN
    RAISE EXCEPTION 'menoka_app must not inherit neon_superuser';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.current_app_auth_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN current_setting('app.current_auth_user_id', true)
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    THEN current_setting('app.current_auth_user_id', true)::uuid
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.current_app_account_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT account.id
  FROM public.accounts AS account
  WHERE account.auth_user_id = public.current_app_auth_user_id()
$$;

REVOKE ALL ON FUNCTION public.current_app_auth_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_app_account_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_app_auth_user_id() TO menoka_app;
GRANT EXECUTE ON FUNCTION public.current_app_account_id() TO menoka_app;

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accounts_runtime_isolation ON accounts;
CREATE POLICY accounts_runtime_isolation ON accounts
  FOR ALL
  TO menoka_app
  USING (auth_user_id = public.current_app_auth_user_id())
  WITH CHECK (auth_user_id = public.current_app_auth_user_id());

DROP POLICY IF EXISTS players_runtime_isolation ON players;
CREATE POLICY players_runtime_isolation ON players
  FOR ALL
  TO menoka_app
  USING (owner_id = public.current_app_account_id())
  WITH CHECK (owner_id = public.current_app_account_id());

DROP POLICY IF EXISTS poker_sessions_runtime_isolation ON poker_sessions;
CREATE POLICY poker_sessions_runtime_isolation ON poker_sessions
  FOR ALL
  TO menoka_app
  USING (owner_id = public.current_app_account_id())
  WITH CHECK (owner_id = public.current_app_account_id());

DROP POLICY IF EXISTS migration_mapping_runtime_isolation ON migration_mapping;
CREATE POLICY migration_mapping_runtime_isolation ON migration_mapping
  FOR SELECT
  TO menoka_app
  USING (target_owner_id = public.current_app_account_id());

DROP POLICY IF EXISTS audit_events_runtime_isolation ON audit_events;
CREATE POLICY audit_events_runtime_isolation ON audit_events
  FOR SELECT
  TO menoka_app
  USING (owner_id = public.current_app_account_id());

REVOKE ALL ON SCHEMA public FROM menoka_app;
GRANT USAGE ON SCHEMA public TO menoka_app;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM menoka_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM menoka_app;

GRANT SELECT, INSERT, UPDATE ON accounts TO menoka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON players TO menoka_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON poker_sessions TO menoka_app;
GRANT USAGE, SELECT ON SEQUENCE poker_sessions_session_number_seq
  TO menoka_app;

INSERT INTO app_migrations (version)
VALUES ('0004_database_enforced_isolation')
ON CONFLICT (version) DO NOTHING;

COMMIT;
