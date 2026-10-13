BEGIN;

-- Quick ledger games (0025). `game_kind` is 'hands' for a game played hand
-- by hand and 'ledger' for a quick ledger: buy-ins, cash-outs and a final
-- chip count, with no hands or blinds. A quick ledger stores ante 0 and
-- hands 0 and none of the per-hand rules, so the old ante > 0 and hands > 0
-- checks become part of one check per kind.
ALTER TABLE poker_sessions
  ADD COLUMN IF NOT EXISTS game_kind text NOT NULL DEFAULT 'hands'
  CONSTRAINT poker_sessions_game_kind_known CHECK (
    game_kind IN ('hands', 'ledger')
  );

ALTER TABLE poker_sessions
  DROP CONSTRAINT IF EXISTS poker_sessions_kind_shape;
ALTER TABLE poker_sessions
  ADD CONSTRAINT poker_sessions_kind_shape CHECK (
    CASE game_kind
      WHEN 'ledger' THEN
        ante = 0
        AND hands = 0
        AND blind_history IS NULL
        AND rebuy_rules IS NULL
        AND NOT big_blind_ante
        AND rake_rules IS NULL
        AND rake = 0
      ELSE ante > 0 AND hands > 0
    END
  );

ALTER TABLE poker_sessions
  DROP CONSTRAINT IF EXISTS poker_sessions_ante_check;
ALTER TABLE poker_sessions
  DROP CONSTRAINT IF EXISTS poker_sessions_hands_check;

-- Stop if the old checks had other names: a quick ledger couldn't be saved.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.poker_sessions'::regclass
      AND contype = 'c'
      AND conname <> 'poker_sessions_kind_shape'
      AND pg_get_constraintdef(oid) ~ '\((ante|hands) > 0\)'
  ) THEN
    RAISE EXCEPTION 'poker_sessions still has an ante > 0 or hands > 0 check';
  END IF;
END
$$;

-- The admin dashboard shows a quick ledger as such instead of its blinds.
-- Otherwise as 0020; CREATE OR REPLACE keeps the function's privileges.
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
    'kind', session.game_kind,
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

INSERT INTO app_migrations (version)
VALUES ('0025_quick_ledger')
ON CONFLICT (version) DO NOTHING;

COMMIT;
