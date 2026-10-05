BEGIN;

-- Admin dashboard (read only). Row security limits menoka_app to the signed-in
-- person's own rows, so the dashboard reads everything through the
-- SECURITY DEFINER functions below. Each starts with admin_caller(), which
-- allows only an active account whose Auth user is listed in app_admins.
-- The runtime role has no grant on app_admins: an admin is added by the
-- migration owner with SQL, never inferred from an email or a name.
-- Nothing here changes data, except that admin_account_detail() records each
-- look at one person's detail in audit_events.

CREATE TABLE IF NOT EXISTS app_admins (
  auth_user_id uuid PRIMARY KEY,
  added_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_admins FROM PUBLIC;

-- The caller's account when they are an admin; otherwise admin:forbidden.
-- Not granted to the runtime role.
CREATE OR REPLACE FUNCTION public.admin_caller()
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
  JOIN public.app_admins AS admin ON admin.auth_user_id = account.auth_user_id
  WHERE account.auth_user_id = public.current_app_auth_user_id()
    AND account.lifecycle_state = 'active';
  IF caller IS NULL THEN
    RAISE EXCEPTION 'admin:forbidden';
  END IF;
  RETURN caller;
END
$$;

-- Milliseconds since the epoch, the form the app uses for dates.
CREATE OR REPLACE FUNCTION public.admin_ms(p_time timestamptz)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT (extract(epoch FROM p_time) * 1000)::bigint
$$;

-- What kind of player a row is: the host's own player, a friend (linked to an
-- account) or a guest.
CREATE OR REPLACE FUNCTION public.admin_player_kind(p_player public.players)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = p_player.owner_id AND self_player_id = p_player.id
    ) THEN 'own'
    WHEN p_player.linked_account_id IS NOT NULL THEN 'friend'
    ELSE 'guest'
  END
$$;

-- One account as a dashboard row.
CREATE OR REPLACE FUNCTION public.admin_account_row(p_account uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'id', account.id,
    'email', auth_user.email,
    'emailVerified', COALESCE(auth_user."emailVerified", false),
    'authName', auth_user.name,
    'displayName', account.display_name,
    'userCode', account.user_code,
    'avatar', account.avatar,
    'currency', account.currency,
    'state', account.lifecycle_state,
    'deletionRequestedAt', public.admin_ms(account.deletion_requested_at),
    'joinedAt', public.admin_ms(COALESCE(auth_user."createdAt", account.created_at)),
    'lastSignInAt', (
      SELECT public.admin_ms(max(auth_session."createdAt"))
      FROM neon_auth.session AS auth_session
      WHERE auth_session."userId" = account.auth_user_id
    ),
    'isAdmin', EXISTS (
      SELECT 1 FROM public.app_admins WHERE auth_user_id = account.auth_user_id
    ),
    'gamesHosted', (
      SELECT count(*) FROM public.poker_sessions
      WHERE owner_id = account.id AND discarded_at IS NULL
    ),
    'lastGameAt', (
      SELECT public.admin_ms(max(played_at)) FROM public.poker_sessions
      WHERE owner_id = account.id AND discarded_at IS NULL
    ),
    'handsPlayed', (
      SELECT COALESCE(sum(hands), 0) FROM public.poker_sessions
      WHERE owner_id = account.id AND discarded_at IS NULL
    ),
    'guests', (
      SELECT count(*) FROM public.players AS player
      WHERE player.owner_id = account.id
        AND player.deleted_at IS NULL
        AND public.admin_player_kind(player) = 'guest'
    ),
    'friends', (
      SELECT count(*) FROM public.friend_connections
      WHERE account.id IN (account_low, account_high)
    ),
    'gamesPlayedAsFriend', (
      SELECT count(*)
      FROM public.session_results AS result
      JOIN public.players AS player
        ON player.owner_id = result.owner_id AND player.id = result.player_id
      JOIN public.poker_sessions AS session
        ON session.owner_id = result.owner_id
        AND session.record_id = result.session_record_id
      WHERE player.linked_account_id = account.id
        AND session.discarded_at IS NULL
    )
  )
  FROM public.accounts AS account
  LEFT JOIN neon_auth."user" AS auth_user ON auth_user.id = account.auth_user_id
  WHERE account.id = p_account
$$;

-- One game with its results, for the games table and a person's detail.
CREATE OR REPLACE FUNCTION public.admin_game_row(p_owner uuid, p_record uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'recordId', session.record_id,
    'number', session.owner_session_number,
    'name', session.game_name,
    'hostId', host.id,
    'hostName', host.display_name,
    'hostAvatar', host.avatar,
    'currency', host.currency,
    'playedAt', public.admin_ms(session.played_at),
    'endedAt', public.admin_ms(session.ended_at),
    'hands', session.hands,
    'bigBlind', session.ante,
    'startingStack', session.starting_stack,
    'results', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'playerId', result.player_id,
          'name', COALESCE(
            CASE WHEN friend.lifecycle_state = 'active' THEN friend.display_name END,
            CASE WHEN host.self_player_id = player.id THEN host.display_name END,
            result.player_name
          ),
          'avatar', public.shown_avatar(player.owner_id, player.id),
          'kind', public.admin_player_kind(player),
          'invested', result.invested,
          'endingStack', result.ending_stack,
          'net', result.net,
          'rebuys', (
            SELECT count(*) FROM public.buy_in_events AS buy_in
            WHERE buy_in.owner_id = result.owner_id
              AND buy_in.session_record_id = result.session_record_id
              AND buy_in.player_id = result.player_id
              AND buy_in.kind = 'rebuy'
          )
        )
        ORDER BY result.net DESC, result.position
      )
      FROM public.session_results AS result
      JOIN public.players AS player
        ON player.owner_id = result.owner_id AND player.id = result.player_id
      LEFT JOIN public.accounts AS friend ON friend.id = player.linked_account_id
      WHERE result.owner_id = session.owner_id
        AND result.session_record_id = session.record_id
    ), '[]'::jsonb)
  )
  FROM public.poker_sessions AS session
  JOIN public.accounts AS host ON host.id = session.owner_id
  WHERE session.owner_id = p_owner AND session.record_id = p_record
$$;

-- Headline numbers and the last 12 weeks of sign-ups and games.
CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.admin_caller();
  RETURN jsonb_build_object(
    'generatedAt', public.admin_ms(now()),
    'accounts', (
      SELECT jsonb_build_object(
        'total', count(*),
        'named', count(*) FILTER (WHERE account.display_name IS NOT NULL),
        'new7d', count(*) FILTER (WHERE account.created_at > now() - interval '7 days'),
        'new30d', count(*) FILTER (WHERE account.created_at > now() - interval '30 days'),
        'deletionRequested', count(*) FILTER (WHERE account.lifecycle_state <> 'active')
      )
      FROM public.accounts AS account
    ),
    'signedIn7d', (
      SELECT count(DISTINCT auth_session."userId")
      FROM neon_auth.session AS auth_session
      JOIN public.accounts AS account ON account.auth_user_id = auth_session."userId"
      WHERE auth_session."createdAt" > now() - interval '7 days'
    ),
    'activeHosts30d', (
      SELECT count(DISTINCT owner_id) FROM public.poker_sessions
      WHERE discarded_at IS NULL AND owner_id IS NOT NULL
        AND played_at > now() - interval '30 days'
    ),
    'players', (
      SELECT jsonb_build_object(
        'guests', count(*) FILTER (WHERE kind = 'guest'),
        'friends', count(*) FILTER (WHERE kind = 'friend'),
        'own', count(*) FILTER (WHERE kind = 'own')
      )
      FROM (
        SELECT public.admin_player_kind(player) AS kind
        FROM public.players AS player
        WHERE player.owner_id IS NOT NULL AND player.deleted_at IS NULL
      ) AS kinds
    ),
    'games', (
      SELECT jsonb_build_object(
        'total', count(*),
        'last7d', count(*) FILTER (WHERE played_at > now() - interval '7 days'),
        'last30d', count(*) FILTER (WHERE played_at > now() - interval '30 days'),
        'hands', COALESCE(sum(hands), 0),
        'minutes', COALESCE(sum(extract(epoch FROM ended_at - played_at) / 60)::bigint, 0)
      )
      FROM public.poker_sessions
      WHERE discarded_at IS NULL AND owner_id IS NOT NULL
    ),
    'friendships', (SELECT count(*) FROM public.friend_connections),
    'pendingRequests', (
      SELECT count(*) FROM public.friend_requests WHERE status = 'pending'
    ),
    'liveNow', (
      SELECT count(*) FROM public.live_views WHERE expires_at > now()
    ),
    'weeks', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'start', public.admin_ms(week.start),
          'signups', (
            SELECT count(*) FROM public.accounts
            WHERE created_at >= week.start AND created_at < week.start + interval '7 days'
          ),
          'games', (
            SELECT count(*) FROM public.poker_sessions
            WHERE discarded_at IS NULL AND owner_id IS NOT NULL
              AND played_at >= week.start AND played_at < week.start + interval '7 days'
          )
        )
        ORDER BY week.start
      )
      FROM generate_series(
        date_trunc('week', now()) - interval '11 weeks',
        date_trunc('week', now()),
        interval '1 week'
      ) AS week(start)
    )
  );
END
$$;

-- Every account, newest first.
CREATE OR REPLACE FUNCTION public.admin_accounts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.admin_caller();
  RETURN COALESCE((
    SELECT jsonb_agg(public.admin_account_row(account.id) ORDER BY account.created_at DESC)
    FROM public.accounts AS account
  ), '[]'::jsonb);
END
$$;

-- Every guest (a player who is neither a host's own player nor linked to a
-- friend's account), with the host who added them and how they have done.
CREATE OR REPLACE FUNCTION public.admin_guests()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.admin_caller();
  RETURN COALESCE((
    SELECT jsonb_agg(item ORDER BY (item->>'addedAt')::bigint DESC)
    FROM (
      SELECT jsonb_build_object(
        'id', player.id,
        'name', player.name,
        'avatar', public.shown_avatar(player.owner_id, player.id),
        'code', player.player_code,
        'hostId', host.id,
        'hostName', host.display_name,
        'hostEmail', auth_user.email,
        'currency', host.currency,
        'addedAt', public.admin_ms(player.created_at),
        'removed', player.deleted_at IS NOT NULL,
        'games', COALESCE(stats.games, 0),
        'net', COALESCE(stats.net, 0),
        'lastPlayedAt', public.admin_ms(stats.last_played)
      ) AS item
      FROM public.players AS player
      JOIN public.accounts AS host ON host.id = player.owner_id
      LEFT JOIN neon_auth."user" AS auth_user ON auth_user.id = host.auth_user_id
      LEFT JOIN LATERAL (
        SELECT count(*) AS games, sum(result.net) AS net, max(session.played_at) AS last_played
        FROM public.session_results AS result
        JOIN public.poker_sessions AS session
          ON session.owner_id = result.owner_id
          AND session.record_id = result.session_record_id
        WHERE result.owner_id = player.owner_id
          AND result.player_id = player.id
          AND session.discarded_at IS NULL
      ) AS stats ON true
      WHERE public.admin_player_kind(player) = 'guest'
    ) AS guests
  ), '[]'::jsonb);
END
$$;

-- The most recent games across every host (at most 500).
CREATE OR REPLACE FUNCTION public.admin_games(p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.admin_caller();
  RETURN COALESCE((
    SELECT jsonb_agg(public.admin_game_row(recent.owner_id, recent.record_id) ORDER BY recent.played_at DESC)
    FROM (
      SELECT owner_id, record_id, played_at
      FROM public.poker_sessions
      WHERE discarded_at IS NULL AND owner_id IS NOT NULL
      ORDER BY played_at DESC, created_at DESC
      LIMIT greatest(1, least(p_limit, 500))
    ) AS recent
  ), '[]'::jsonb);
END
$$;

-- Migrations, unfinished purges, accounts waiting to be deleted and the most
-- recent audit events.
CREATE OR REPLACE FUNCTION public.admin_system()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.admin_caller();
  RETURN jsonb_build_object(
    'migrations', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('version', version, 'appliedAt', public.admin_ms(applied_at))
        ORDER BY version DESC
      )
      FROM public.app_migrations
    ), '[]'::jsonb),
    'purges', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'accountId', account_id,
          'claimedAt', public.admin_ms(claimed_at),
          'attempts', attempts,
          'lastError', last_error,
          'lastAttemptAt', public.admin_ms(last_attempt_at),
          'completedAt', public.admin_ms(completed_at)
        )
        ORDER BY claimed_at DESC
      )
      FROM (
        SELECT * FROM public.account_purges ORDER BY claimed_at DESC LIMIT 50
      ) AS recent_purges
    ), '[]'::jsonb),
    'pendingDeletions', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'accountId', account.id,
          'name', account.display_name,
          'email', auth_user.email,
          'state', account.lifecycle_state,
          'requestedAt', public.admin_ms(account.deletion_requested_at),
          'deadline', public.admin_ms(account.deletion_requested_at + interval '30 days')
        )
        ORDER BY account.deletion_requested_at
      )
      FROM public.accounts AS account
      LEFT JOIN neon_auth."user" AS auth_user ON auth_user.id = account.auth_user_id
      WHERE account.lifecycle_state <> 'active'
    ), '[]'::jsonb),
    'audit', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'at', public.admin_ms(event.created_at),
          'action', event.action,
          'targetKind', event.target_kind,
          'ownerId', event.owner_id,
          'ownerName', account.display_name
        )
        ORDER BY event.created_at DESC
      )
      FROM (
        SELECT * FROM public.audit_events ORDER BY created_at DESC LIMIT 40
      ) AS event
      LEFT JOIN public.accounts AS account ON account.id = event.owner_id
    ), '[]'::jsonb)
  );
END
$$;

-- One person in full: their account row, every player in their ledger, their
-- latest games, friends and pending requests. Each call is recorded in the
-- admin's own audit events, so it is not STABLE.
CREATE OR REPLACE FUNCTION public.admin_account_detail(p_account uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.admin_caller();
  detail jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.audit_events (owner_id, actor_auth_user_id, action, target_kind, target_id)
  VALUES (caller, public.current_app_auth_user_id(), 'admin.view_account', 'account', p_account::text);

  SELECT jsonb_build_object(
    'account', public.admin_account_row(p_account),
    'players', COALESCE((
      SELECT jsonb_agg(item ORDER BY item->>'kind' DESC, (item->>'games')::bigint DESC, item->>'name')
      FROM (
        SELECT jsonb_build_object(
          'id', player.id,
          'name', COALESCE(
            CASE WHEN friend.lifecycle_state = 'active' THEN friend.display_name END,
            player.name
          ),
          'avatar', public.shown_avatar(player.owner_id, player.id),
          'code', player.player_code,
          'kind', public.admin_player_kind(player),
          'linkedAccountId', player.linked_account_id,
          'removed', player.deleted_at IS NOT NULL,
          'games', COALESCE(stats.games, 0),
          'net', COALESCE(stats.net, 0),
          'lastPlayedAt', public.admin_ms(stats.last_played)
        ) AS item
        FROM public.players AS player
        LEFT JOIN public.accounts AS friend ON friend.id = player.linked_account_id
        LEFT JOIN LATERAL (
          SELECT count(*) AS games, sum(result.net) AS net, max(session.played_at) AS last_played
          FROM public.session_results AS result
          JOIN public.poker_sessions AS session
            ON session.owner_id = result.owner_id
            AND session.record_id = result.session_record_id
          WHERE result.owner_id = player.owner_id
            AND result.player_id = player.id
            AND session.discarded_at IS NULL
        ) AS stats ON true
        WHERE player.owner_id = p_account
      ) AS players
    ), '[]'::jsonb),
    'games', COALESCE((
      SELECT jsonb_agg(public.admin_game_row(recent.owner_id, recent.record_id) ORDER BY recent.played_at DESC)
      FROM (
        SELECT owner_id, record_id, played_at
        FROM public.poker_sessions
        WHERE owner_id = p_account AND discarded_at IS NULL
        ORDER BY played_at DESC, created_at DESC
        LIMIT 50
      ) AS recent
    ), '[]'::jsonb),
    'friends', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'accountId', other.id,
          'name', other.display_name,
          'avatar', other.avatar,
          'since', public.admin_ms(connection.created_at)
        )
        ORDER BY connection.created_at DESC
      )
      FROM public.friend_connections AS connection
      JOIN public.accounts AS other
        ON other.id = CASE
          WHEN connection.account_low = p_account THEN connection.account_high
          ELSE connection.account_low
        END
      WHERE p_account IN (connection.account_low, connection.account_high)
    ), '[]'::jsonb),
    'requests', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'direction', CASE WHEN request.from_account_id = p_account THEN 'sent' ELSE 'received' END,
          'otherName', other.display_name,
          'createdAt', public.admin_ms(request.created_at)
        )
        ORDER BY request.created_at DESC
      )
      FROM public.friend_requests AS request
      JOIN public.accounts AS other
        ON other.id = CASE
          WHEN request.from_account_id = p_account THEN request.to_account_id
          ELSE request.from_account_id
        END
      WHERE request.status = 'pending'
        AND p_account IN (request.from_account_id, request.to_account_id)
    ), '[]'::jsonb)
  ) INTO detail;

  RETURN detail;
END
$$;

REVOKE ALL ON FUNCTION public.admin_caller() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_ms(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_player_kind(public.players) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_account_row(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_game_row(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_accounts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_guests() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_games(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_system() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_account_detail(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_overview() TO menoka_app;
GRANT EXECUTE ON FUNCTION public.admin_accounts() TO menoka_app;
GRANT EXECUTE ON FUNCTION public.admin_guests() TO menoka_app;
GRANT EXECUTE ON FUNCTION public.admin_games(integer) TO menoka_app;
GRANT EXECUTE ON FUNCTION public.admin_system() TO menoka_app;
GRANT EXECUTE ON FUNCTION public.admin_account_detail(uuid) TO menoka_app;

INSERT INTO app_migrations (version)
VALUES ('0018_admin_dashboard')
ON CONFLICT (version) DO NOTHING;

COMMIT;
