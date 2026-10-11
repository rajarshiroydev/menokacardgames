BEGIN;

-- Big blind ante and house rake (0023). `big_blind_ante`: the big blind
-- also posted an ante of one big blind each hand. `rake_rules`: the house's
-- cut, { "percent": 0.1-10, "cap": chips }, NULL for none; the API validates
-- the contents. `rake`: chips the house took, so a game's results add up to
-- minus it rather than zero (lib/poker/accounting.ts).
ALTER TABLE poker_sessions
  ADD COLUMN IF NOT EXISTS big_blind_ante boolean NOT NULL DEFAULT false;

ALTER TABLE poker_sessions
  ADD COLUMN IF NOT EXISTS rake_rules jsonb
  CONSTRAINT poker_sessions_rake_rules_object CHECK (
    rake_rules IS NULL OR jsonb_typeof(rake_rules) = 'object'
  );

ALTER TABLE poker_sessions
  ADD COLUMN IF NOT EXISTS rake bigint NOT NULL DEFAULT 0
  CONSTRAINT poker_sessions_rake_not_negative CHECK (rake >= 0);

ALTER TABLE poker_sessions
  DROP CONSTRAINT IF EXISTS poker_sessions_rake_needs_rules;
ALTER TABLE poker_sessions
  ADD CONSTRAINT poker_sessions_rake_needs_rules CHECK (
    rake = 0 OR rake_rules IS NOT NULL
  );

-- friend_group_sessions() returns each game's `rake` too, so a friend's view
-- can check a raked game's chips (they add up to minus the rake). Otherwise
-- as 0022. menoka_app already has the table privileges, and row security
-- covers the new columns.
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
VALUES ('0023_ante_and_rake')
ON CONFLICT (version) DO NOTHING;

COMMIT;
