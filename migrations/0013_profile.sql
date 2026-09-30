BEGIN;

-- The Profile tab. Each host chooses the currency their games are counted in
-- (a label for chips; nothing is converted), and every account has its own
-- player in its own list, tied to the account, so the games it hosts count
-- toward its profile the same way friends' games do.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR'
    CONSTRAINT accounts_currency_code CHECK (currency ~ '^[A-Z]{3}$'),
  ADD COLUMN IF NOT EXISTS self_player_id text;

-- The account's own player must be one of its own players. Deleting that
-- player clears the link; deleting the account deletes its players anyway.
ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_self_player_owned;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_self_player_owned
  FOREIGN KEY (id, self_player_id) REFERENCES players (owner_id, id)
  ON DELETE SET NULL (self_player_id);

-- Gives an account with a name its own player, once. The stored name is the
-- account's name, numbered like friend_accept does ("Asha (2)") when the host
-- already has a player called that; the app shows the account's name anyway.
-- Never picks an existing player: a name says nothing about who someone is,
-- so an existing player becomes the account's own only by a reviewed data
-- step (see migrations/README.md). Not granted to the runtime role.
CREATE OR REPLACE FUNCTION public.ensure_self_player(p_account uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  account public.accounts%ROWTYPE;
  candidate text;
  suffix int := 1;
  created text;
BEGIN
  SELECT * INTO account FROM public.accounts WHERE id = p_account FOR UPDATE;
  IF NOT FOUND OR account.display_name IS NULL THEN
    RETURN NULL;
  END IF;
  IF account.self_player_id IS NOT NULL THEN
    RETURN account.self_player_id;
  END IF;
  candidate := account.display_name;
  WHILE EXISTS (
    SELECT 1 FROM public.players
    WHERE owner_id = account.id AND name_key = lower(candidate)
  ) LOOP
    suffix := suffix + 1;
    candidate := account.display_name || ' (' || suffix || ')';
  END LOOP;
  INSERT INTO public.players (owner_id, name, name_key)
  VALUES (account.id, candidate, lower(candidate))
  RETURNING id INTO created;
  UPDATE public.accounts SET self_player_id = created WHERE id = account.id;
  RETURN created;
END
$$;

REVOKE ALL ON FUNCTION public.ensure_self_player(uuid) FROM PUBLIC;

-- Makes an existing player the account's own, for a host whose history was
-- recorded before own players existed (Rajarshi's "Rajarshi"; Emon's and
-- Rahul Basak's rows after their claims). Only for a person's own confirmed
-- decision, run by the owner; never by the app. The empty own player made
-- automatically before is deleted when it has no games, links or requests;
-- otherwise it stays as an ordinary player. Returns what it did.
CREATE OR REPLACE FUNCTION public.adopt_self_player(p_account uuid, p_player text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  previous text;
BEGIN
  SELECT self_player_id INTO previous
  FROM public.accounts WHERE id = p_account FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'account % not found', p_account;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.players
    WHERE id = p_player AND owner_id = p_account
      AND linked_account_id IS NULL AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'player % is not an active, unlinked player of account %',
      p_player, p_account;
  END IF;
  IF previous = p_player THEN
    RETURN 'already the own player';
  END IF;

  UPDATE public.accounts SET self_player_id = p_player WHERE id = p_account;
  IF previous IS NULL THEN
    RETURN 'set; there was no own player before';
  END IF;

  DELETE FROM public.players AS player
  WHERE player.id = previous
    AND player.linked_account_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.session_results AS result
      WHERE result.owner_id = p_account AND result.player_id = player.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.friend_requests AS request
      WHERE request.from_player_id = player.id AND request.status = 'pending'
    );
  IF FOUND THEN
    RETURN 'set; the empty automatic own player was deleted';
  END IF;
  RETURN 'set; the previous own player has history, so it stays as an ordinary player';
END
$$;

REVOKE ALL ON FUNCTION public.adopt_self_player(uuid, text) FROM PUBLIC;

-- An account gets its own player as soon as it has a name: when a new person
-- saves their name on the first-sign-in screen.
CREATE OR REPLACE FUNCTION public.create_self_player()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.ensure_self_player(NEW.id);
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION public.create_self_player() FROM PUBLIC;

DROP TRIGGER IF EXISTS accounts_create_self_player ON accounts;
CREATE TRIGGER accounts_create_self_player
  AFTER INSERT OR UPDATE OF display_name ON accounts
  FOR EACH ROW
  WHEN (NEW.display_name IS NOT NULL AND NEW.self_player_id IS NULL)
  EXECUTE FUNCTION public.create_self_player();

-- Only the database sets which player is the account's own; the app can't
-- point it at another player.
CREATE OR REPLACE FUNCTION public.guard_self_player_choice()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user = 'menoka_app'
    AND NEW.self_player_id IS DISTINCT FROM OLD.self_player_id THEN
    RAISE EXCEPTION 'the account''s own player is set by the database';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS accounts_guard_self_player ON accounts;
CREATE TRIGGER accounts_guard_self_player
  BEFORE UPDATE OF self_player_id ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_self_player_choice();

-- The account's own player can't be linked to a friend or removed from the
-- list. friend_accept runs as the owner, so this check doesn't depend on the
-- role; a link attempt gets the error the friend functions already use for a
-- player that can't be linked.
CREATE OR REPLACE FUNCTION public.guard_self_player()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.accounts
    WHERE id = NEW.owner_id AND self_player_id = NEW.id
  ) THEN
    IF NEW.linked_account_id IS NOT NULL THEN
      RAISE EXCEPTION 'friend:player-unavailable';
    END IF;
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      RAISE EXCEPTION 'your own player can''t be removed';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS players_guard_self_link ON players;
DROP FUNCTION IF EXISTS public.guard_self_player_link();
DROP TRIGGER IF EXISTS players_guard_self ON players;
CREATE TRIGGER players_guard_self
  BEFORE UPDATE OF linked_account_id, deleted_at ON players
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_self_player();

-- The name each of the caller's players goes by. People with an account
-- choose their own name: a linked friend shows as the name they saved, and
-- the host's own player as the host's name. Everyone else keeps the name the
-- host gave them. Row security hides other accounts, so this is a
-- SECURITY DEFINER function that reveals only names of the caller's friends.
CREATE OR REPLACE FUNCTION public.player_display_names()
RETURNS TABLE (player_id text, display_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.friend_caller();
BEGIN
  RETURN QUERY
  SELECT
    player.id,
    COALESCE(
      CASE WHEN friend.lifecycle_state = 'active' THEN friend.display_name END,
      CASE WHEN me.self_player_id = player.id THEN me.display_name END,
      player.name
    )
  FROM public.players AS player
  JOIN public.accounts AS me ON me.id = player.owner_id
  LEFT JOIN public.accounts AS friend ON friend.id = player.linked_account_id
  WHERE player.owner_id = caller;
END
$$;

REVOKE ALL ON FUNCTION public.player_display_names() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_display_names() TO menoka_app;

-- Group standings now say which currency the host counts in. Otherwise the
-- same as 0012.
CREATE OR REPLACE FUNCTION public.friend_group_sessions()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.friend_caller();
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'hostAccountId', host.id,
        'hostName', host.display_name,
        'currency', host.currency,
        'myPlayerId', linked.id,
        'myPlayerName', linked.name,
        'sessions', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', session.id,
              'date', (extract(epoch FROM session.played_at) * 1000)::bigint,
              'startStack', session.starting_stack,
              'hands', session.hands,
              'results', normalized.results
            )
            ORDER BY session.played_at, session.created_at
          )
          FROM public.poker_sessions AS session
          JOIN LATERAL (
            SELECT jsonb_agg(
              jsonb_build_object(
                'playerId', result.player_id,
                'name', result.player_name,
                'net', result.net,
                'end', result.ending_stack,
                'buyIns', COALESCE(buy_ins.buy_ins, '[]'::jsonb)
              )
              ORDER BY result.position
            ) AS results
            FROM public.session_results AS result
            LEFT JOIN LATERAL (
              SELECT jsonb_agg(event.amount ORDER BY event.sequence) AS buy_ins
              FROM public.buy_in_events AS event
              WHERE event.owner_id = result.owner_id
                AND event.session_record_id = result.session_record_id
                AND event.player_id = result.player_id
            ) AS buy_ins ON true
            WHERE result.owner_id = session.owner_id
              AND result.session_record_id = session.record_id
              AND result.accounting_status IN ('verified', 'legacy_verified')
            HAVING count(*) > 0
          ) AS normalized ON true
          WHERE session.owner_id = host.id
            AND session.discarded_at IS NULL
        ), '[]'::jsonb)
      )
      ORDER BY lower(host.display_name), host.id
    )
    FROM public.players AS linked
    JOIN public.accounts AS host ON host.id = linked.owner_id
    WHERE linked.linked_account_id = caller
      AND host.lifecycle_state = 'active'
      AND EXISTS (
        SELECT 1 FROM public.friend_connections
        WHERE account_low = LEAST(caller, host.id)
          AND account_high = GREATEST(caller, host.id)
      )
  ), '[]'::jsonb);
END
$$;

REVOKE ALL ON FUNCTION public.friend_group_sessions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.friend_group_sessions() TO menoka_app;

INSERT INTO app_migrations (version)
VALUES ('0013_profile')
ON CONFLICT (version) DO NOTHING;

COMMIT;
