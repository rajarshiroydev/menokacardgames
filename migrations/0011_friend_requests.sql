BEGIN;

-- Friend network step 2: friend requests. Two accounts become friends when
-- one sends a request by the other's user code and the other accepts. Each
-- side then has exactly one player linked to the other: a player they chose
-- (so an existing player keeps their history) or a new one. Removing a
-- friend ends the connection and unlinks both sides; each host keeps their
-- games. Links and connections change only inside the functions below, which
-- derive the caller from the verified session, never from their arguments.
-- The runtime role has no direct access to the new tables.

-- The account a host's player stands for, once linked by an accepted request.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS linked_account_id uuid
  REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_not_linked_to_owner;
ALTER TABLE players ADD CONSTRAINT players_not_linked_to_owner
  CHECK (
    linked_account_id IS NULL
    OR (owner_id IS NOT NULL AND linked_account_id <> owner_id)
  );
CREATE UNIQUE INDEX IF NOT EXISTS players_owner_linked_account_idx
  ON players (owner_id, linked_account_id)
  WHERE linked_account_id IS NOT NULL;

-- The runtime role may not set or change a link, and may not delete a linked
-- player: removing the friend comes first. The friend functions run as their
-- owner, so this guard doesn't apply to them, nor to the purge's cascades.
CREATE OR REPLACE FUNCTION public.guard_player_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_user <> 'menoka_app' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.linked_account_id IS NOT NULL THEN
      RAISE EXCEPTION 'player links are set only by accepting a friend request';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.linked_account_id IS DISTINCT FROM OLD.linked_account_id THEN
      RAISE EXCEPTION 'player links change only through friend requests';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.linked_account_id IS NOT NULL THEN
    RAISE EXCEPTION 'remove this friend before deleting their player';
  END IF;
  RETURN OLD;
END
$$;

DROP TRIGGER IF EXISTS players_guard_links ON players;
CREATE TRIGGER players_guard_links
  BEFORE INSERT OR UPDATE OR DELETE ON players
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_player_links();

CREATE TABLE IF NOT EXISTS friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  to_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'declined', 'cancelled')
  ),
  -- The sender's own player for the recipient; NULL means a new player.
  from_player_id text REFERENCES players(id) ON DELETE SET NULL,
  -- The recipient's player code the sender says is theirs, if given. Only a
  -- hint for the recipient, who decides.
  claimed_player_code text CHECK (
    claimed_player_code IS NULL
    OR claimed_player_code ~ '^[2-9A-HJKMNP-Z]{8}$'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT friend_requests_not_self CHECK (from_account_id <> to_account_id),
  CONSTRAINT friend_requests_response_time CHECK (
    (status = 'pending') = (responded_at IS NULL)
  )
);

-- At most one pending request between two people, in either direction.
CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_one_pending_pair_idx
  ON friend_requests (
    LEAST(from_account_id, to_account_id),
    GREATEST(from_account_id, to_account_id)
  )
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS friend_requests_to_status_idx
  ON friend_requests (to_account_id, status);
CREATE INDEX IF NOT EXISTS friend_requests_from_status_idx
  ON friend_requests (from_account_id, status, responded_at);

CREATE TABLE IF NOT EXISTS friend_connections (
  account_low uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  account_high uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_low, account_high),
  CONSTRAINT friend_connections_ordered CHECK (account_low < account_high)
);
CREATE INDEX IF NOT EXISTS friend_connections_high_idx
  ON friend_connections (account_high);

-- Row security with no policy and no grants: the runtime role can't touch
-- either table except through the functions below.
ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_connections ENABLE ROW LEVEL SECURITY;

-- The signed-in caller's account, which must be active. Every friend
-- function starts here. Not granted to the runtime role.
CREATE OR REPLACE FUNCTION public.friend_caller()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid;
BEGIN
  SELECT account.id INTO caller
  FROM public.accounts AS account
  WHERE account.auth_user_id = public.current_app_auth_user_id()
    AND account.lifecycle_state = 'active';
  IF caller IS NULL THEN
    RAISE EXCEPTION 'friend:locked';
  END IF;
  RETURN caller;
END
$$;

-- How the caller stands with another account: connected, a pending request
-- either way, or none. Not granted to the runtime role.
CREATE OR REPLACE FUNCTION public.friend_relation(p_caller uuid, p_other uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN p_caller = p_other THEN 'self'
    WHEN EXISTS (
      SELECT 1 FROM public.friend_connections
      WHERE account_low = LEAST(p_caller, p_other)
        AND account_high = GREATEST(p_caller, p_other)
    ) THEN 'friends'
    WHEN EXISTS (
      SELECT 1 FROM public.friend_requests
      WHERE from_account_id = p_caller AND to_account_id = p_other
        AND status = 'pending'
    ) THEN 'request-sent'
    WHEN EXISTS (
      SELECT 1 FROM public.friend_requests
      WHERE from_account_id = p_other AND to_account_id = p_caller
        AND status = 'pending'
    ) THEN 'request-received'
    ELSE 'none'
  END
$$;

CREATE OR REPLACE FUNCTION public.friend_audit(
  p_owner uuid,
  p_action text,
  p_target_kind text,
  p_target_id text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO public.audit_events (owner_id, actor_auth_user_id, action, target_kind, target_id)
  VALUES (p_owner, public.current_app_auth_user_id(), p_action, p_target_kind, p_target_id)
$$;

-- Looks up an active account by exact user code. Returns only its display
-- name and how the caller stands with it; nothing when no active account has
-- that code.
CREATE OR REPLACE FUNCTION public.friend_find(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.friend_caller();
  target public.accounts%ROWTYPE;
BEGIN
  SELECT * INTO target
  FROM public.accounts
  WHERE user_code = p_code AND lifecycle_state = 'active';
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'displayName', target.display_name,
    'relation', public.friend_relation(caller, target.id)
  );
END
$$;

-- Sends a request to the account with this user code. p_my_player_id is the
-- caller's own player for that person (NULL for a new player);
-- p_claimed_player_code is the recipient's player code the caller says is
-- theirs (NULL when not given).
CREATE OR REPLACE FUNCTION public.friend_send(
  p_code text,
  p_my_player_id text,
  p_claimed_player_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.friend_caller();
  caller_name text;
  target public.accounts%ROWTYPE;
  relation text;
  request_id uuid;
BEGIN
  -- Serialises one person's sends, so the pending limit holds.
  SELECT display_name INTO caller_name
  FROM public.accounts WHERE id = caller FOR UPDATE;
  IF caller_name IS NULL THEN
    RAISE EXCEPTION 'friend:name-required';
  END IF;

  SELECT * INTO target
  FROM public.accounts
  WHERE user_code = p_code AND lifecycle_state = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'friend:not-found';
  END IF;

  relation := public.friend_relation(caller, target.id);
  IF relation = 'self' THEN RAISE EXCEPTION 'friend:self'; END IF;
  IF relation = 'friends' THEN RAISE EXCEPTION 'friend:already-friends'; END IF;
  IF relation = 'request-sent' THEN RAISE EXCEPTION 'friend:request-pending'; END IF;
  IF relation = 'request-received' THEN RAISE EXCEPTION 'friend:request-waiting'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.friend_requests
    WHERE from_account_id = caller AND to_account_id = target.id
      AND status = 'declined'
      AND responded_at > now() - interval '7 days'
  ) THEN
    RAISE EXCEPTION 'friend:declined-recently';
  END IF;

  IF (
    SELECT count(*) FROM public.friend_requests
    WHERE from_account_id = caller AND status = 'pending'
  ) >= 20 THEN
    RAISE EXCEPTION 'friend:too-many-pending';
  END IF;

  IF p_my_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.players AS player
    WHERE player.id = p_my_player_id
      AND player.owner_id = caller
      AND player.deleted_at IS NULL
      AND player.linked_account_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.friend_requests AS other
        WHERE other.from_account_id = caller
          AND other.status = 'pending'
          AND other.from_player_id = player.id
      )
  ) THEN
    RAISE EXCEPTION 'friend:player-unavailable';
  END IF;

  BEGIN
    INSERT INTO public.friend_requests (
      from_account_id, to_account_id, from_player_id, claimed_player_code
    )
    VALUES (caller, target.id, p_my_player_id, p_claimed_player_code)
    RETURNING id INTO request_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'friend:request-pending';
  END;

  PERFORM public.friend_audit(caller, 'friend.request_sent', 'friend_request', request_id::text);
  RETURN jsonb_build_object('requestId', request_id, 'displayName', target.display_name);
END
$$;

-- Everything the caller's Friends card shows: friends, requests received and
-- requests sent. Accounts that are locked or being deleted are left out.
CREATE OR REPLACE FUNCTION public.friend_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.friend_caller();
BEGIN
  RETURN jsonb_build_object(
    'friends', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'accountId', other.id,
          'displayName', other.display_name,
          'since', (extract(epoch FROM connection.created_at) * 1000)::bigint,
          'myPlayer', (
            SELECT jsonb_build_object('id', mine.id, 'name', mine.name)
            FROM public.players AS mine
            WHERE mine.owner_id = caller AND mine.linked_account_id = other.id
          ),
          'theirNameForMe', (
            SELECT theirs.name
            FROM public.players AS theirs
            WHERE theirs.owner_id = other.id AND theirs.linked_account_id = caller
          )
        )
        ORDER BY lower(other.display_name), other.id
      )
      FROM public.friend_connections AS connection
      JOIN public.accounts AS other
        ON other.id = CASE
          WHEN connection.account_low = caller THEN connection.account_high
          ELSE connection.account_low
        END
      WHERE caller IN (connection.account_low, connection.account_high)
        AND other.lifecycle_state = 'active'
    ), '[]'::jsonb),
    'received', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'requestId', request.id,
          'displayName', sender.display_name,
          'sentAt', (extract(epoch FROM request.created_at) * 1000)::bigint,
          'claimedPlayerCode', request.claimed_player_code,
          'claimedPlayer', (
            SELECT jsonb_build_object('id', claimed.id, 'name', claimed.name)
            FROM public.players AS claimed
            WHERE claimed.owner_id = caller
              AND claimed.player_code = request.claimed_player_code
              AND claimed.deleted_at IS NULL
              AND claimed.linked_account_id IS NULL
          )
        )
        ORDER BY request.created_at
      )
      FROM public.friend_requests AS request
      JOIN public.accounts AS sender ON sender.id = request.from_account_id
      WHERE request.to_account_id = caller
        AND request.status = 'pending'
        AND sender.lifecycle_state = 'active'
    ), '[]'::jsonb),
    'sent', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'requestId', request.id,
          'displayName', recipient.display_name,
          'sentAt', (extract(epoch FROM request.created_at) * 1000)::bigint,
          'myPlayerName', (
            SELECT mine.name FROM public.players AS mine
            WHERE mine.id = request.from_player_id AND mine.owner_id = caller
          )
        )
        ORDER BY request.created_at
      )
      FROM public.friend_requests AS request
      JOIN public.accounts AS recipient ON recipient.id = request.to_account_id
      WHERE request.from_account_id = caller
        AND request.status = 'pending'
    ), '[]'::jsonb)
  );
END
$$;

-- Accepts a request sent to the caller. The caller links the sender to one of
-- their own active, unlinked players (p_my_player_id), or adds a new player
-- (p_new_player_name, defaulting to the sender's name). On the sender's side,
-- the player the sender chose is linked if it is still free; otherwise a new
-- player is added under the caller's name, numbered if that name is taken.
CREATE OR REPLACE FUNCTION public.friend_accept(
  p_request_id uuid,
  p_my_player_id text,
  p_new_player_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.friend_caller();
  caller_name text;
  request public.friend_requests%ROWTYPE;
  sender public.accounts%ROWTYPE;
  new_name text;
  my_player text;
  their_player text;
  candidate text;
  suffix int := 1;
BEGIN
  SELECT display_name INTO caller_name FROM public.accounts WHERE id = caller;
  IF caller_name IS NULL THEN
    RAISE EXCEPTION 'friend:name-required';
  END IF;

  SELECT * INTO request
  FROM public.friend_requests
  WHERE id = p_request_id AND to_account_id = caller AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'friend:request-not-found';
  END IF;

  SELECT * INTO sender
  FROM public.accounts
  WHERE id = request.from_account_id AND lifecycle_state = 'active';
  IF NOT FOUND OR sender.display_name IS NULL THEN
    RAISE EXCEPTION 'friend:request-not-found';
  END IF;

  -- The caller's side.
  IF p_my_player_id IS NOT NULL THEN
    UPDATE public.players
    SET linked_account_id = sender.id
    WHERE id = p_my_player_id
      AND owner_id = caller
      AND deleted_at IS NULL
      AND linked_account_id IS NULL
    RETURNING id INTO my_player;
    IF my_player IS NULL THEN
      RAISE EXCEPTION 'friend:player-unavailable';
    END IF;
  ELSE
    new_name := regexp_replace(btrim(COALESCE(p_new_player_name, '')), '\s+', ' ', 'g');
    IF new_name = '' THEN
      new_name := sender.display_name;
    END IF;
    IF char_length(new_name) > 80 THEN
      RAISE EXCEPTION 'friend:invalid-name';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.players
      WHERE owner_id = caller AND name_key = lower(new_name)
    ) THEN
      RAISE EXCEPTION 'friend:name-taken';
    END IF;
    INSERT INTO public.players (owner_id, name, name_key, linked_account_id)
    VALUES (caller, new_name, lower(new_name), sender.id)
    RETURNING id INTO my_player;
  END IF;

  -- The sender's side.
  IF request.from_player_id IS NOT NULL THEN
    UPDATE public.players
    SET linked_account_id = caller
    WHERE id = request.from_player_id
      AND owner_id = sender.id
      AND deleted_at IS NULL
      AND linked_account_id IS NULL
    RETURNING id INTO their_player;
  END IF;
  IF their_player IS NULL THEN
    candidate := caller_name;
    WHILE EXISTS (
      SELECT 1 FROM public.players
      WHERE owner_id = sender.id AND name_key = lower(candidate)
    ) LOOP
      suffix := suffix + 1;
      candidate := caller_name || ' (' || suffix || ')';
    END LOOP;
    INSERT INTO public.players (owner_id, name, name_key, linked_account_id)
    VALUES (sender.id, candidate, lower(candidate), caller)
    RETURNING id INTO their_player;
  END IF;

  INSERT INTO public.friend_connections (account_low, account_high)
  VALUES (LEAST(caller, sender.id), GREATEST(caller, sender.id));

  UPDATE public.friend_requests
  SET status = 'accepted', responded_at = now()
  WHERE id = request.id;

  PERFORM public.friend_audit(caller, 'friend.request_accepted', 'friend_request', request.id::text);
  PERFORM public.friend_audit(sender.id, 'friend.connected', 'friend_request', request.id::text);
  RETURN jsonb_build_object('myPlayerId', my_player, 'displayName', sender.display_name);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'friend:already-friends';
END
$$;

CREATE OR REPLACE FUNCTION public.friend_decline(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.friend_caller();
BEGIN
  UPDATE public.friend_requests
  SET status = 'declined', responded_at = now()
  WHERE id = p_request_id AND to_account_id = caller AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'friend:request-not-found';
  END IF;
  PERFORM public.friend_audit(caller, 'friend.request_declined', 'friend_request', p_request_id::text);
END
$$;

CREATE OR REPLACE FUNCTION public.friend_cancel(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.friend_caller();
BEGIN
  UPDATE public.friend_requests
  SET status = 'cancelled', responded_at = now()
  WHERE id = p_request_id AND from_account_id = caller AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'friend:request-not-found';
  END IF;
  PERFORM public.friend_audit(caller, 'friend.request_cancelled', 'friend_request', p_request_id::text);
END
$$;

-- Ends a friendship and unlinks both sides' players. Works even while the
-- other account is locked for deletion.
CREATE OR REPLACE FUNCTION public.friend_remove(p_friend_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.friend_caller();
BEGIN
  DELETE FROM public.friend_connections
  WHERE account_low = LEAST(caller, p_friend_account_id)
    AND account_high = GREATEST(caller, p_friend_account_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'friend:not-friends';
  END IF;

  UPDATE public.players
  SET linked_account_id = NULL
  WHERE (owner_id = caller AND linked_account_id = p_friend_account_id)
     OR (owner_id = p_friend_account_id AND linked_account_id = caller);

  PERFORM public.friend_audit(caller, 'friend.removed', 'account', p_friend_account_id::text);
  PERFORM public.friend_audit(p_friend_account_id, 'friend.removed_by_friend', 'account', caller::text);
END
$$;

REVOKE ALL ON FUNCTION public.guard_player_links() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.friend_caller() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.friend_relation(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.friend_audit(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.friend_find(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.friend_send(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.friend_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.friend_accept(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.friend_decline(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.friend_cancel(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.friend_remove(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.friend_find(text) TO menoka_app;
GRANT EXECUTE ON FUNCTION public.friend_send(text, text, text) TO menoka_app;
GRANT EXECUTE ON FUNCTION public.friend_overview() TO menoka_app;
GRANT EXECUTE ON FUNCTION public.friend_accept(uuid, text, text) TO menoka_app;
GRANT EXECUTE ON FUNCTION public.friend_decline(uuid) TO menoka_app;
GRANT EXECUTE ON FUNCTION public.friend_cancel(uuid) TO menoka_app;
GRANT EXECUTE ON FUNCTION public.friend_remove(uuid) TO menoka_app;

INSERT INTO app_migrations (version)
VALUES ('0011_friend_requests')
ON CONFLICT (version) DO NOTHING;

COMMIT;
