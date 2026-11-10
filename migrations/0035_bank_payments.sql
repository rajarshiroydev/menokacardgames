BEGIN;

-- The host as the bank (0035; plan entry "buy-ins paid to the bank (plan)").
-- In a game where the host is the bank, every result records what the player
-- paid the bank at the table for their buy-ins (`bank_paid_in`) and what the
-- bank paid them at the table when they cashed out (`bank_paid_out`), in
-- chips, and the host's own result is marked `is_bank`. Settle up takes these
-- off, so it covers only what is still owed (lib/poker/settle-up.ts). Other
-- games leave all three NULL. The app checks the amounts against the game
-- (lib/poker/session-validation.ts); the check below keeps their shape.
ALTER TABLE session_results
  ADD COLUMN IF NOT EXISTS bank_paid_in bigint,
  ADD COLUMN IF NOT EXISTS bank_paid_out bigint,
  ADD COLUMN IF NOT EXISTS is_bank boolean;

ALTER TABLE session_results
  DROP CONSTRAINT IF EXISTS session_results_bank_shape;
ALTER TABLE session_results
  ADD CONSTRAINT session_results_bank_shape CHECK (
    (bank_paid_in IS NULL) = (bank_paid_out IS NULL)
    AND (bank_paid_in IS NULL OR (bank_paid_in >= 0 AND bank_paid_in <= invested))
    AND (bank_paid_out IS NULL OR (bank_paid_out >= 0 AND bank_paid_out <= ending_stack))
    AND (is_bank IS NULL OR (is_bank AND bank_paid_in IS NOT NULL))
  );

-- At most one bank per game.
CREATE UNIQUE INDEX IF NOT EXISTS session_results_one_bank_idx
  ON session_results (owner_id, session_record_id)
  WHERE is_bank;

-- A result's record of the player's time at the table and, in a bank game,
-- what was paid at the table, as the app sends it (times in ms); only the
-- parts that are set. The saved-games read and friend_group_sessions() both
-- add it to each result, so neither needs changing.
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
    'leftAt', (extract(epoch FROM result.left_at) * 1000)::bigint,
    'bankPaidIn', result.bank_paid_in,
    'bankPaidOut', result.bank_paid_out,
    'bank', CASE WHEN result.is_bank THEN true END
  ))
$$;

REVOKE ALL ON FUNCTION public.result_seat_record(public.session_results) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.result_seat_record(public.session_results) TO menoka_app;

-- A bank that isn't one of the players is paid or pays as "bank" in Settle up.
ALTER TABLE settlement_payments
  DROP CONSTRAINT IF EXISTS settlement_payments_keys;
ALTER TABLE settlement_payments
  ADD CONSTRAINT settlement_payments_keys CHECK (
    from_key ~ '^([0-9]|house|bank)$'
    AND to_key ~ '^([0-9]|house|bank)$'
    AND from_key <> to_key
  );

INSERT INTO app_migrations (version)
VALUES ('0035_bank_payments')
ON CONFLICT (version) DO NOTHING;

COMMIT;
