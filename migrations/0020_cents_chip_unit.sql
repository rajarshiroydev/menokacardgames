BEGIN;

-- Games counted in cents, for small stakes like 0.25/0.50. A game's
-- chip_unit says what its stored amounts mean: 'whole' is one chip per
-- currency unit, as every game before this one; 'cents' is hundredths, so a
-- stored 25 is 0.25. Amounts stay whole numbers (bigint) either way, so
-- nothing already saved is rewritten. The API validates the unit
-- (lib/poker/session-validation.ts); menoka_app already has INSERT and
-- SELECT on poker_sessions, and row security covers the new column.
ALTER TABLE poker_sessions
  ADD COLUMN IF NOT EXISTS chip_unit text NOT NULL DEFAULT 'whole'
  CONSTRAINT poker_sessions_chip_unit_known CHECK (
    chip_unit IN ('whole', 'cents')
  );

-- A stored amount in currency units, for totals across games that may use
-- different units: chip_amount(1275, 'cents') is 12.75. Not granted; only
-- the SECURITY DEFINER functions below use it.
CREATE OR REPLACE FUNCTION public.chip_amount(p_chips bigint, p_unit text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE WHEN p_unit = 'cents' THEN p_chips / 100.0 ELSE p_chips::numeric END
$$;

REVOKE ALL ON FUNCTION public.chip_amount(bigint, text) FROM PUBLIC;

-- Each game a friend sees also carries its unit, so the server adds games in
-- cents and whole chips correctly. Otherwise as 0016.
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
              'chipUnit', session.chip_unit,
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
                'accountId', CASE
                  WHEN result.player_id = host.self_player_id THEN host.id
                  ELSE (
                    SELECT player.linked_account_id
                    FROM public.players AS player
                    WHERE player.owner_id = result.owner_id
                      AND player.id = result.player_id
                  )
                END,
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

-- Admin dashboard (0018): a game carries its unit, and a player's net across
-- games is added in currency units. Otherwise as 0018.
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
    'chipUnit', session.chip_unit,
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
        SELECT count(*) AS games, sum(public.chip_amount(result.net, session.chip_unit)) AS net, max(session.played_at) AS last_played
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
          SELECT count(*) AS games, sum(public.chip_amount(result.net, session.chip_unit)) AS net, max(session.played_at) AS last_played
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

INSERT INTO app_migrations (version)
VALUES ('0020_cents_chip_unit')
ON CONFLICT (version) DO NOTHING;

COMMIT;
