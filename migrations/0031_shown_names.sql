BEGIN;

-- Chosen names in friends' views (0031).
-- The name a host's player goes by for others: the name they chose for
-- anyone with an active account, the host's own name for the host's own
-- player, otherwise the name the host gave the guest. The name counterpart of
-- shown_avatar(); like player_display_names(), but for any host, so it is not
-- granted to the app and only runs inside functions that check who may see.
CREATE OR REPLACE FUNCTION public.shown_name(p_owner uuid, p_player text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    CASE WHEN friend.lifecycle_state = 'active' THEN friend.display_name END,
    CASE WHEN host.self_player_id = player.id THEN host.display_name END,
    player.name
  )
  FROM public.players AS player
  JOIN public.accounts AS host ON host.id = player.owner_id
  LEFT JOIN public.accounts AS friend ON friend.id = player.linked_account_id
  WHERE player.owner_id = p_owner AND player.id = p_player
$$;

REVOKE ALL ON FUNCTION public.shown_name(uuid, text) FROM PUBLIC;

-- Friends' views of a host's games (their group standings and games) name
-- players as the host's own lists do, instead of the name saved with each
-- result: someone who joined from an invite as "Lakshmi" no longer shows as
-- the guest "Lakshmi T.", and a renamed guest shows their new name. The
-- saved name stays as the fallback. Otherwise as 0028.
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
        'myPlayerName', COALESCE(public.shown_name(host.id, linked.id), linked.name),
        'sessions', COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', session.id,
              'date', (extract(epoch FROM session.played_at) * 1000)::bigint,
              'chipUnit', session.chip_unit,
              'startStack', session.starting_stack,
              'hands', session.hands,
              'ended', (extract(epoch FROM session.ended_at) * 1000)::bigint,
              'kind', session.game_kind,
              'ante', session.ante,
              'blindHistory', session.blind_history,
              'rebuyRules', session.rebuy_rules,
              'bigBlindAnte', session.big_blind_ante,
              'rakeRules', session.rake_rules,
              'rake', session.rake,
              'chipValue', CASE
                WHEN session.chip_value_chips IS NULL THEN NULL
                ELSE jsonb_build_object(
                  'chips', session.chip_value_chips,
                  'cents', session.chip_value_cents
                )
              END,
              'results', normalized.results
            )
            ORDER BY session.played_at, session.created_at
          )
          FROM public.poker_sessions AS session
          JOIN LATERAL (
            SELECT jsonb_agg(
              jsonb_build_object(
                'playerId', result.player_id,
                'name', COALESCE(
                  public.shown_name(result.owner_id, result.player_id),
                  result.player_name
                ),
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
              ) || public.result_seat_record(result)
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
            AND EXISTS (
              SELECT 1 FROM public.session_results AS mine
              WHERE mine.owner_id = session.owner_id
                AND mine.session_record_id = session.record_id
                AND mine.player_id = linked.id
                AND mine.accounting_status IN ('verified', 'legacy_verified')
            )
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
VALUES ('0031_shown_names')
ON CONFLICT (version) DO NOTHING;

COMMIT;
