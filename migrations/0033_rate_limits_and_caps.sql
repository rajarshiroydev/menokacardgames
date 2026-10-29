BEGIN;

-- Per-account rate limits and storage caps (0033, pre-launch audit step 4;
-- plan entry "rate limits and storage caps: plan").
--
-- rate_limits: one row per account and bucket, holding the start of the
-- current fixed window and how much of it is used. The app calls
-- consume_rate_limit() inside the transaction that loads the account or
-- does the work, so a refused request writes nothing. The limits themselves
-- live in the app (lib/security/limits.ts). Row security on and no grants:
-- only the function touches the table. Rows go with the account.
CREATE TABLE IF NOT EXISTS rate_limits (
  owner_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  bucket text NOT NULL CHECK (bucket ~ '^[a-z][a-z-]{0,31}$'),
  window_start timestamptz NOT NULL,
  used bigint NOT NULL CHECK (used >= 0),
  PRIMARY KEY (owner_id, bucket)
);

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rate_limits FROM PUBLIC;

-- Adds p_cost to the signed-in account's use of p_bucket in the current
-- window (p_window_seconds long, starting with the first use). Raises
-- 'rate:limited:<bucket>:<seconds until the window ends>' when that takes it
-- over p_limit; the error rolls the transaction back, count included.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_bucket text,
  p_cost bigint,
  p_limit bigint,
  p_window_seconds integer
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.current_app_account_id();
  window_length interval := make_interval(secs => p_window_seconds);
  counted public.rate_limits%ROWTYPE;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'rate:no-account';
  END IF;
  IF p_cost < 0 OR p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'rate:invalid';
  END IF;

  INSERT INTO public.rate_limits AS counter (owner_id, bucket, window_start, used)
  VALUES (caller, p_bucket, now(), p_cost)
  ON CONFLICT (owner_id, bucket) DO UPDATE
  SET window_start = CASE
        WHEN counter.window_start + window_length <= now() THEN now()
        ELSE counter.window_start
      END,
      used = CASE
        WHEN counter.window_start + window_length <= now() THEN p_cost
        ELSE counter.used + p_cost
      END
  RETURNING * INTO counted;

  IF counted.used > p_limit THEN
    RAISE EXCEPTION 'rate:limited:%:%',
      p_bucket,
      greatest(
        1,
        ceil(extract(epoch FROM counted.window_start + window_length - now()))
      )::integer;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, bigint, bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, bigint, bigint, integer) TO menoka_app;

-- Storage caps. Each check skips a row that already exists, because the
-- app's inserts use ON CONFLICT: a retried save or a player added again is
-- not a new row. An advisory lock per account serialises concurrent inserts
-- so the cap holds. Raised errors: 'quota:players', 'quota:games'.

-- At most 500 players per account.
CREATE OR REPLACE FUNCTION public.cap_players()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.owner_id IS NULL OR EXISTS (
    SELECT 1 FROM public.players
    WHERE owner_id = NEW.owner_id AND name_key = NEW.name_key
  ) THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cap:players:' || NEW.owner_id::text, 0));
  IF (SELECT count(*) FROM public.players WHERE owner_id = NEW.owner_id) >= 500 THEN
    RAISE EXCEPTION 'quota:players';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.cap_players() FROM PUBLIC;

DROP TRIGGER IF EXISTS players_cap ON players;
CREATE TRIGGER players_cap
  BEFORE INSERT ON players
  FOR EACH ROW
  EXECUTE FUNCTION public.cap_players();

-- At most 5,000 saved games per account, discarded ones included.
CREATE OR REPLACE FUNCTION public.cap_poker_sessions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.owner_id IS NULL OR EXISTS (
    SELECT 1 FROM public.poker_sessions
    WHERE owner_id = NEW.owner_id AND id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cap:poker_sessions:' || NEW.owner_id::text, 0));
  IF (SELECT count(*) FROM public.poker_sessions WHERE owner_id = NEW.owner_id) >= 5000 THEN
    RAISE EXCEPTION 'quota:games';
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.cap_poker_sessions() FROM PUBLIC;

DROP TRIGGER IF EXISTS poker_sessions_cap ON poker_sessions;
CREATE TRIGGER poker_sessions_cap
  BEFORE INSERT ON poker_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.cap_poker_sessions();

-- At most 5 unfinished-game backups per account (user decision 2026-10-29:
-- drop, don't refuse). A new game's backup first deletes the account's
-- backups beyond the 4 most recently updated, expired ones first. The
-- dropped game's device keeps its own copy.
CREATE OR REPLACE FUNCTION public.cap_game_backups()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.game_backups
    WHERE owner_id = NEW.owner_id AND game_id = NEW.game_id
  ) THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('cap:game_backups:' || NEW.owner_id::text, 0));
  DELETE FROM public.game_backups
  WHERE owner_id = NEW.owner_id
    AND game_id IN (
      SELECT game_id FROM public.game_backups
      WHERE owner_id = NEW.owner_id
      ORDER BY (expires_at > now()) DESC, updated_at DESC
      OFFSET 4
    );
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION public.cap_game_backups() FROM PUBLIC;

DROP TRIGGER IF EXISTS game_backups_cap ON game_backups;
CREATE TRIGGER game_backups_cap
  BEFORE INSERT ON game_backups
  FOR EACH ROW
  EXECUTE FUNCTION public.cap_game_backups();

INSERT INTO app_migrations (version)
VALUES ('0033_rate_limits_and_caps')
ON CONFLICT (version) DO NOTHING;

COMMIT;
