BEGIN;

-- The application records its own account lifecycle events.
DROP POLICY IF EXISTS audit_events_runtime_isolation ON audit_events;
CREATE POLICY audit_events_runtime_isolation ON audit_events
  FOR SELECT TO menoka_app
  USING (owner_id = public.current_app_account_id());

CREATE POLICY audit_events_runtime_insert ON audit_events
  FOR INSERT TO menoka_app
  WITH CHECK (
    owner_id = public.current_app_account_id()
    AND actor_auth_user_id = public.current_app_auth_user_id()
  );

GRANT SELECT, INSERT ON audit_events TO menoka_app;

-- The runtime role may only request deletion or cancel it inside the
-- 30-day grace period. Purging is reserved for the separate purge job.
CREATE OR REPLACE FUNCTION public.guard_account_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user <> 'menoka_app' THEN
    RETURN NEW;
  END IF;

  IF NEW.lifecycle_state = OLD.lifecycle_state THEN
    IF NEW.deletion_requested_at IS DISTINCT FROM OLD.deletion_requested_at THEN
      RAISE EXCEPTION 'deletion time cannot change without a lifecycle change';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.lifecycle_state = 'active' AND NEW.lifecycle_state = 'deletion_requested' THEN
    NEW.deletion_requested_at := now();
    RETURN NEW;
  END IF;

  IF OLD.lifecycle_state = 'deletion_requested' AND NEW.lifecycle_state = 'active' THEN
    IF OLD.deletion_requested_at <= now() - interval '30 days' THEN
      RAISE EXCEPTION 'the recovery period has ended';
    END IF;
    NEW.deletion_requested_at := NULL;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'account lifecycle change from % to % is not allowed',
    OLD.lifecycle_state, NEW.lifecycle_state;
END
$$;

DROP TRIGGER IF EXISTS accounts_guard_lifecycle ON accounts;
CREATE TRIGGER accounts_guard_lifecycle
  BEFORE UPDATE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_account_lifecycle();

INSERT INTO app_migrations (version)
VALUES ('0006_account_deletion_requests')
ON CONFLICT (version) DO NOTHING;

COMMIT;
