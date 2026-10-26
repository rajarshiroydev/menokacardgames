BEGIN;

-- Late joins, cash-outs and hands played (0028): games started from
-- 2026-10-26 record, for each player, the hands they were dealt in (hand by
-- hand), the first hand a late joiner could play and when they joined, and
-- the last hand before a cash-out and when. Older results keep NULLs, which
-- the app shows as before. The app validates the values against the game
-- (lib/poker/session-validation.ts); the check below keeps their shape.
-- friend_group_sessions() returns them on each result too. Otherwise as 0027.
ALTER TABLE session_results
  ADD COLUMN IF NOT EXISTS hands_played integer,
  ADD COLUMN IF NOT EXISTS joined_hand integer,
  ADD COLUMN IF NOT EXISTS joined_at timestamptz,
  ADD COLUMN IF NOT EXISTS left_hand integer,
  ADD COLUMN IF NOT EXISTS left_at timestamptz;

ALTER TABLE session_results
  DROP CONSTRAINT IF EXISTS session_results_seat_record_shape;
ALTER TABLE session_results
  ADD CONSTRAINT session_results_seat_record_shape CHECK (
    (hands_played IS NULL OR hands_played >= 0)
    AND (joined_hand IS NULL OR (joined_hand >= 2 AND joined_at IS NOT NULL))
    AND (left_hand IS NULL OR (left_hand >= 0 AND left_at IS NOT NULL))
    AND (joined_at IS NULL OR left_at IS NULL OR left_at >= joined_at)
  );

-- A result's record of the player's time at the table, as the app sends it
-- (times in ms); only the parts that are set.
CREATE OR REPLACE FUNCTION public.result_seat_record(result public.session_results)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'handsPlayed', result.hands_played,
    'joinedHand', result.joined_hand,
    'joinedAt', (extract(epoch FROM result.joined_at) * 1000)::bigint,
    'leftHand', result.left_hand,
    'leftAt', (extract(epoch FROM result.left_at) * 1000)::bigint
  ))
$$;

REVOKE ALL ON FUNCTION public.result_seat_record(public.session_results) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.result_seat_record(public.session_results) TO menoka_app;

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
VALUES ('0028_seat_records')
ON CONFLICT (version) DO NOTHING;

COMMIT;
