BEGIN;

-- Avatars. Players don't upload photos; everyone shows as one of the drawings
-- in lib/avatars.ts, stored by id. People with an account choose their own,
-- and every host who has them as a friend shows that choice (the same rule as
-- names); a host chooses for their guests. Everyone gets one at random until
-- they choose. The app accepts only ids it can draw; the database checks the
-- shape, so drawings added later need no migration.

-- A random pick from the avatars that exist today (p01 to p20). Used as the
-- column default, so it must be executable by the runtime role.
CREATE OR REPLACE FUNCTION public.random_avatar()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog
AS $$
  SELECT 'p' || lpad((1 + floor(random() * 20))::int::text, 2, '0')
$$;

REVOKE ALL ON FUNCTION public.random_avatar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.random_avatar() TO menoka_app;

-- A volatile default gives every existing row its own pick.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS avatar text NOT NULL DEFAULT public.random_avatar()
    CONSTRAINT accounts_avatar_id CHECK (avatar ~ '^[a-z][a-z0-9-]{1,31}$');
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS avatar text NOT NULL DEFAULT public.random_avatar()
    CONSTRAINT players_avatar_id CHECK (avatar ~ '^[a-z][a-z0-9-]{1,31}$');

-- The avatar a host's player shows as: a linked, active friend's own choice,
-- the host's own choice for their own player, otherwise the one stored on the
-- player (the host's choice for a guest). Mirrors player_display_names().
-- Internal: not granted to the runtime role.
CREATE OR REPLACE FUNCTION public.shown_avatar(p_owner uuid, p_player text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    CASE WHEN friend.lifecycle_state = 'active' THEN friend.avatar END,
    CASE WHEN host.self_player_id = player.id THEN host.avatar END,
    player.avatar
  )
  FROM public.players AS player
  JOIN public.accounts AS host ON host.id = player.owner_id
  LEFT JOIN public.accounts AS friend ON friend.id = player.linked_account_id
  WHERE player.owner_id = p_owner AND player.id = p_player
$$;

REVOKE ALL ON FUNCTION public.shown_avatar(uuid, text) FROM PUBLIC;

-- The avatar each of the caller's players shows as. Row security hides other
-- accounts, so this reveals friends' choices the way player_display_names()
-- reveals their names.
CREATE OR REPLACE FUNCTION public.player_avatars()
RETURNS TABLE (player_id text, avatar text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.friend_caller();
BEGIN
  RETURN QUERY
  SELECT player.id, public.shown_avatar(caller, player.id)
  FROM public.players AS player
  WHERE player.owner_id = caller;
END
$$;

REVOKE ALL ON FUNCTION public.player_avatars() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_avatars() TO menoka_app;

-- Finding someone by user code also shows their avatar. Otherwise as 0011.
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
    'avatar', target.avatar,
    'relation', public.friend_relation(caller, target.id)
  );
END
$$;

REVOKE ALL ON FUNCTION public.friend_find(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.friend_find(text) TO menoka_app;

-- Friends and requests carry each person's avatar. Otherwise as 0011.
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
          'avatar', other.avatar,
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
          'avatar', sender.avatar,
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
          'avatar', recipient.avatar,
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

REVOKE ALL ON FUNCTION public.friend_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.friend_overview() TO menoka_app;

-- Each result in a group's games carries the avatar that player shows as in
-- the host's list, so friends see the same faces. Otherwise as 0013.
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
                'avatar', public.shown_avatar(result.owner_id, result.player_id),
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
VALUES ('0015_avatars')
ON CONFLICT (version) DO NOTHING;

COMMIT;
