BEGIN;

-- What the chips cost (0026): `chip_value_chips` stored chips (in the game's
-- chip_unit) cost `chip_value_cents` hundredths of the host's currency. Both
-- NULL is no chip value: a chip is one unit of the currency, as before. Only
-- results in money and settling up use it, so a host can change it after
-- saving; the chips, results and buy-ins never change with it.
ALTER TABLE poker_sessions
  ADD COLUMN IF NOT EXISTS chip_value_chips bigint,
  ADD COLUMN IF NOT EXISTS chip_value_cents bigint;

ALTER TABLE poker_sessions
  DROP CONSTRAINT IF EXISTS poker_sessions_chip_value_shape;
ALTER TABLE poker_sessions
  ADD CONSTRAINT poker_sessions_chip_value_shape CHECK (
    (chip_value_chips IS NULL AND chip_value_cents IS NULL)
    OR (
      chip_value_chips >= 1
      AND chip_value_cents BETWEEN 1 AND 100000000000
    )
  );

-- A friend's group and the Profile stats count each game's results in
-- money, so friend_group_sessions() also returns the chip value. Otherwise
-- as 0023.
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
VALUES ('0026_chip_value')
ON CONFLICT (version) DO NOTHING;

COMMIT;
