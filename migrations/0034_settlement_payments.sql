BEGIN;

-- Settle up payments marked as paid (0034; plan entry "track who has paid
-- (plan)"). One row per payment ticked in a saved game's Settle up: who pays
-- whom, as each player's place in the game's results (0-9, in the order the
-- host's and friends' reads list them) or "house" for the rake, and the
-- amount in hundredths it was ticked at. The app works out the payments
-- (lib/poker/settle-up.ts) and ignores a tick whose payment no longer exists;
-- changing the chip value or continuing the game deletes those.
--
-- Like Splitwise, the host and every friend who played in the game may tick
-- or untick any payment in it (user decision 2026-11-05). Row security is on
-- with no policies and no grants, so menoka_app reaches the table only
-- through the SECURITY DEFINER functions below, which check that right.
-- Rows go with the game and the host's account; `marked_by` is cleared when
-- the account that ticked is deleted ("marked by a former member").
CREATE TABLE IF NOT EXISTS settlement_payments (
  owner_id uuid NOT NULL,
  session_record_id uuid NOT NULL,
  from_key text NOT NULL,
  to_key text NOT NULL,
  cents bigint NOT NULL CHECK (cents > 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  marked_by uuid REFERENCES accounts(id) ON DELETE SET NULL,
  PRIMARY KEY (owner_id, session_record_id, from_key, to_key),
  CONSTRAINT settlement_payments_game
    FOREIGN KEY (owner_id, session_record_id)
    REFERENCES poker_sessions (owner_id, record_id) ON DELETE CASCADE,
  CONSTRAINT settlement_payments_keys CHECK (
    from_key ~ '^([0-9]|house)$'
    AND to_key ~ '^([0-9]|house)$'
    AND from_key <> to_key
  )
);

ALTER TABLE settlement_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON settlement_payments FROM PUBLIC;

-- The game a caller may mark payments in: the host's own saved game, or a
-- friend's game the caller played in (a player linked to them has a verified
-- result), while they are friends and the host is active. The same games
-- friend_group_sessions() shows them. Returns the game's record ID, or NULL.
-- Not granted to the runtime role.
CREATE OR REPLACE FUNCTION public.settlement_game(
  p_caller uuid,
  p_host uuid,
  p_session_id text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT session.record_id
  FROM public.poker_sessions AS session
  JOIN public.accounts AS host ON host.id = session.owner_id
  WHERE session.owner_id = p_host
    AND session.id = p_session_id
    AND session.discarded_at IS NULL
    AND host.lifecycle_state = 'active'
    AND (
      p_caller = p_host
      OR (
        EXISTS (
          SELECT 1 FROM public.friend_connections
          WHERE account_low = LEAST(p_caller, p_host)
            AND account_high = GREATEST(p_caller, p_host)
        )
        AND EXISTS (
          SELECT 1
          FROM public.session_results AS mine
          JOIN public.players AS linked
            ON linked.owner_id = mine.owner_id
           AND linked.id = mine.player_id
          WHERE mine.owner_id = session.owner_id
            AND mine.session_record_id = session.record_id
            AND mine.accounting_status IN ('verified', 'legacy_verified')
            AND linked.linked_account_id = p_caller
        )
      )
    )
$$;

REVOKE ALL ON FUNCTION public.settlement_game(uuid, uuid, text) FROM PUBLIC;

-- Ticks (p_paid) or unticks one payment. The API has already checked that
-- the payment is one Settle up shows for the game; this checks who may.
-- Refuses with payment:not-found for a game the caller can't mark.
CREATE OR REPLACE FUNCTION public.settlement_payment_set(
  p_host uuid,
  p_session_id text,
  p_from text,
  p_to text,
  p_cents bigint,
  p_paid boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.friend_caller();
  game uuid;
BEGIN
  game := public.settlement_game(caller, p_host, p_session_id);
  IF game IS NULL THEN
    RAISE EXCEPTION 'payment:not-found';
  END IF;
  IF p_paid THEN
    INSERT INTO public.settlement_payments (
      owner_id, session_record_id, from_key, to_key, cents, paid_at, marked_by
    )
    VALUES (p_host, game, p_from, p_to, p_cents, now(), caller)
    ON CONFLICT (owner_id, session_record_id, from_key, to_key) DO UPDATE
    SET cents = EXCLUDED.cents,
        paid_at = EXCLUDED.paid_at,
        marked_by = EXCLUDED.marked_by;
  ELSE
    DELETE FROM public.settlement_payments
    WHERE owner_id = p_host
      AND session_record_id = game
      AND from_key = p_from
      AND to_key = p_to;
  END IF;
  INSERT INTO public.audit_events (
    owner_id, actor_auth_user_id, action, target_kind, target_id, details
  )
  VALUES (
    p_host,
    public.current_app_auth_user_id(),
    CASE WHEN p_paid THEN 'settlement.paid' ELSE 'settlement.unpaid' END,
    'session',
    p_session_id,
    jsonb_build_object('from', p_from, 'to', p_to, 'cents', p_cents)
  );
END
$$;

REVOKE ALL ON FUNCTION public.settlement_payment_set(uuid, text, text, text, bigint, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settlement_payment_set(uuid, text, text, text, bigint, boolean) TO menoka_app;

-- The host keeps only the ticks that match the game's payments now
-- (p_keep: [{ "from", "to", "cents" }]), after changing its chip value or
-- continuing it. Returns how many were cleared.
CREATE OR REPLACE FUNCTION public.settlement_payments_keep(
  p_session_id text,
  p_keep jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller uuid := public.friend_caller();
  cleared integer;
BEGIN
  IF jsonb_typeof(p_keep) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'payment:invalid';
  END IF;
  DELETE FROM public.settlement_payments AS payment
  USING public.poker_sessions AS session
  WHERE session.owner_id = caller
    AND session.id = p_session_id
    AND payment.owner_id = caller
    AND payment.session_record_id = session.record_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_keep) AS keep("from" text, "to" text, cents bigint)
      WHERE keep."from" = payment.from_key
        AND keep."to" = payment.to_key
        AND keep.cents = payment.cents
    );
  GET DIAGNOSTICS cleared = ROW_COUNT;
  RETURN cleared;
END
$$;

REVOKE ALL ON FUNCTION public.settlement_payments_keep(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settlement_payments_keep(text, jsonb) TO menoka_app;

-- Every tick the caller can see: in their own saved games, and in friends'
-- games they played in. The API matches them to games by `sessionId` and
-- sends the phone no IDs for friends' games. `markedBy` is the name of the
-- account that ticked it, null once that account is deleted.
CREATE OR REPLACE FUNCTION public.settlement_payments_visible()
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
        'hostAccountId', payment.owner_id,
        'sessionId', session.id,
        'from', payment.from_key,
        'to', payment.to_key,
        'cents', payment.cents,
        'paidAt', (extract(epoch FROM payment.paid_at) * 1000)::bigint,
        'markedBy', marker.display_name,
        'markedByGone', payment.marked_by IS NULL,
        'markedByMe', payment.marked_by = caller
      )
      ORDER BY payment.paid_at
    )
    FROM public.settlement_payments AS payment
    JOIN public.poker_sessions AS session
      ON session.owner_id = payment.owner_id
     AND session.record_id = payment.session_record_id
    LEFT JOIN public.accounts AS marker ON marker.id = payment.marked_by
    WHERE session.discarded_at IS NULL
      AND (
        payment.owner_id = caller
        OR public.settlement_game(caller, payment.owner_id, session.id) IS NOT NULL
      )
  ), '[]'::jsonb);
END
$$;

REVOKE ALL ON FUNCTION public.settlement_payments_visible() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settlement_payments_visible() TO menoka_app;

INSERT INTO app_migrations (version)
VALUES ('0034_settlement_payments')
ON CONFLICT (version) DO NOTHING;

COMMIT;
