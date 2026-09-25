BEGIN;

-- Copies reviewed legacy games into one host's private ledger, after that host
-- has signed in once. Used at cutover for Rajarshi and later for hosts whose
-- games stay unowned until they sign in. Owner-only: the runtime roles cannot
-- execute it. Source rows stay unowned and untouched; the copies get
-- owner-local players, local game numbers, normalized results and buy-ins,
-- and provenance rows in migration_mapping. Rerunning it for the same games
-- changes nothing and returns 0.
CREATE OR REPLACE FUNCTION public.claim_reviewed_history(
  p_target_account uuid,
  p_session_numbers bigint[],
  p_friend_names text[],
  p_decision text
) RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expected integer := cardinality(p_session_numbers);
  v_already integer;
  v_claimed integer;
  v_source_results integer;
BEGIN
  IF p_decision IS NULL OR btrim(p_decision) = '' THEN
    RAISE EXCEPTION 'Name the recorded ownership decision';
  END IF;

  IF v_expected IS NULL OR v_expected = 0 THEN
    RAISE EXCEPTION 'List at least one legacy game number';
  END IF;

  IF (SELECT count(DISTINCT n) FROM unnest(p_session_numbers) AS n) <> v_expected THEN
    RAISE EXCEPTION 'Legacy game numbers must not repeat';
  END IF;

  PERFORM 1
  FROM accounts
  WHERE id = p_target_account AND lifecycle_state = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target account is missing or inactive';
  END IF;

  IF (
    SELECT count(*)
    FROM poker_sessions
    WHERE owner_id IS NULL AND session_number = ANY (p_session_numbers)
  ) <> v_expected THEN
    RAISE EXCEPTION 'Expected % unowned legacy games, found a different set', v_expected;
  END IF;

  SELECT count(*) INTO v_already
  FROM poker_sessions AS source
  JOIN migration_mapping AS mapping
    ON mapping.source_kind = 'session'
   AND mapping.source_id = source.record_id::text
   AND mapping.target_owner_id = p_target_account
   AND mapping.review_status = 'migrated'
  WHERE source.owner_id IS NULL
    AND source.session_number = ANY (p_session_numbers);

  IF v_already = v_expected THEN
    RETURN 0;
  ELSIF v_already > 0 THEN
    RAISE EXCEPTION 'Only % of % games were claimed before; review before retrying', v_already, v_expected;
  END IF;

  -- Every participant must be on the reviewed friend list.
  IF EXISTS (
    SELECT 1
    FROM poker_sessions AS source
    CROSS JOIN LATERAL jsonb_array_elements(source.results) AS result(value)
    LEFT JOIN players AS legacy
      ON legacy.owner_id IS NULL
     AND legacy.id = result.value->>'playerId'
    WHERE source.owner_id IS NULL
      AND source.session_number = ANY (p_session_numbers)
      AND (
        legacy.id IS NULL
        OR legacy.name_key NOT IN (
          SELECT lower(regexp_replace(btrim(friend), '\s+', ' ', 'g'))
          FROM unnest(p_friend_names) AS friend
        )
      )
  ) THEN
    RAISE EXCEPTION 'A player in these games is missing or not on the friend list';
  END IF;

  INSERT INTO players (owner_id, name, name_key)
  SELECT
    p_target_account,
    btrim(friend),
    lower(regexp_replace(btrim(friend), '\s+', ' ', 'g'))
  FROM unnest(p_friend_names) AS friend
  ON CONFLICT (owner_id, name_key) WHERE owner_id IS NOT NULL DO NOTHING;

  INSERT INTO migration_mapping (
    source_kind, source_id, target_owner_id, target_id,
    review_status, provenance, reviewed_at, migrated_at
  )
  SELECT DISTINCT ON (legacy.id)
    'player',
    legacy.id,
    p_target_account,
    destination.id,
    'migrated',
    jsonb_build_object(
      'decision', p_decision,
      'manifest', 'docs/HISTORICAL-OWNERSHIP.md'
    ),
    now(),
    now()
  FROM poker_sessions AS source
  CROSS JOIN LATERAL jsonb_array_elements(source.results) AS result(value)
  JOIN players AS legacy
    ON legacy.owner_id IS NULL
   AND legacy.id = result.value->>'playerId'
  JOIN players AS destination
    ON destination.owner_id = p_target_account
   AND destination.name_key = legacy.name_key
  WHERE source.owner_id IS NULL
    AND source.session_number = ANY (p_session_numbers)
  ON CONFLICT (source_kind, source_id, target_owner_id)
    WHERE target_owner_id IS NOT NULL
  DO NOTHING;

  -- A second claim in the same transaction must not trip over the first.
  DROP TABLE IF EXISTS pg_temp.claim_session_copy;
  CREATE TEMP TABLE claim_session_copy ON COMMIT DROP AS
  SELECT
    source.record_id AS source_record_id,
    gen_random_uuid() AS target_record_id,
    source.session_number AS source_number,
    account.next_session_number - 1 + row_number() OVER (
      ORDER BY source.played_at, source.created_at, source.record_id
    ) AS local_number
  FROM poker_sessions AS source
  CROSS JOIN accounts AS account
  WHERE account.id = p_target_account
    AND source.owner_id IS NULL
    AND source.session_number = ANY (p_session_numbers);

  INSERT INTO poker_sessions (
    record_id, owner_id, owner_session_number, id, game_name, played_at,
    ended_at, ante, starting_stack, hands, blind_history, results, discarded_at
  )
  SELECT
    copy.target_record_id,
    p_target_account,
    copy.local_number,
    source.id,
    source.game_name,
    source.played_at,
    source.ended_at,
    source.ante,
    source.starting_stack,
    source.hands,
    source.blind_history,
    (
      SELECT jsonb_agg(
        result.value || jsonb_build_object(
          'playerId', destination.id,
          'name', destination.name
        )
        ORDER BY result.position
      )
      FROM jsonb_array_elements(source.results)
        WITH ORDINALITY AS result(value, position)
      JOIN migration_mapping AS mapping
        ON mapping.source_kind = 'player'
       AND mapping.source_id = result.value->>'playerId'
       AND mapping.target_owner_id = p_target_account
      JOIN players AS destination
        ON destination.owner_id = p_target_account
       AND destination.id = mapping.target_id
    ),
    source.discarded_at
  FROM claim_session_copy AS copy
  JOIN poker_sessions AS source ON source.record_id = copy.source_record_id;

  INSERT INTO session_results (
    owner_id, session_record_id, player_id, position, player_name,
    invested, ending_stack, accounting_status
  )
  SELECT
    p_target_account,
    copy.target_record_id,
    result.value->>'playerId',
    result.position,
    result.value->>'name',
    CASE
      WHEN result.value ? 'buyIns' THEN (
        SELECT sum(amount.value::bigint)
        FROM jsonb_array_elements_text(result.value->'buyIns') AS amount(value)
      )
      ELSE session.starting_stack
    END,
    (result.value->>'end')::bigint,
    'legacy_verified'
  FROM claim_session_copy AS copy
  JOIN poker_sessions AS session ON session.record_id = copy.target_record_id
  CROSS JOIN LATERAL jsonb_array_elements(session.results)
    WITH ORDINALITY AS result(value, position);

  INSERT INTO buy_in_events (
    owner_id, session_record_id, player_id, sequence, kind, amount
  )
  SELECT
    p_target_account,
    copy.target_record_id,
    result.value->>'playerId',
    buy_in.position,
    CASE WHEN buy_in.position = 1 THEN 'initial' ELSE 'rebuy' END,
    buy_in.value::bigint
  FROM claim_session_copy AS copy
  JOIN poker_sessions AS session ON session.record_id = copy.target_record_id
  CROSS JOIN LATERAL jsonb_array_elements(session.results) AS result(value)
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN result.value ? 'buyIns' THEN result.value->'buyIns'
      ELSE jsonb_build_array(session.starting_stack)
    END
  ) WITH ORDINALITY AS buy_in(value, position);

  INSERT INTO migration_mapping (
    source_kind, source_id, target_owner_id, target_id,
    review_status, provenance, reviewed_at, migrated_at
  )
  SELECT
    'session',
    copy.source_record_id::text,
    p_target_account,
    copy.target_record_id::text,
    'migrated',
    jsonb_build_object(
      'decision', p_decision,
      'manifest', 'docs/HISTORICAL-OWNERSHIP.md',
      'sourceSessionNumber', copy.source_number
    ),
    now(),
    now()
  FROM claim_session_copy AS copy;

  UPDATE accounts
  SET
    next_session_number = next_session_number + v_expected,
    updated_at = now()
  WHERE id = p_target_account;

  -- Reconcile the copies against their sources.
  SELECT count(*) INTO v_claimed FROM claim_session_copy;

  SELECT count(*) INTO v_source_results
  FROM claim_session_copy AS copy
  JOIN poker_sessions AS source ON source.record_id = copy.source_record_id
  CROSS JOIN LATERAL jsonb_array_elements(source.results);

  IF v_claimed <> v_expected THEN
    RAISE EXCEPTION 'Claimed % games instead of %', v_claimed, v_expected;
  END IF;

  IF (
    SELECT count(*)
    FROM claim_session_copy AS copy
    JOIN session_results AS result
      ON result.owner_id = p_target_account
     AND result.session_record_id = copy.target_record_id
  ) <> v_source_results THEN
    RAISE EXCEPTION 'Claimed results do not match the source results';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM claim_session_copy AS copy
    JOIN poker_sessions AS source ON source.record_id = copy.source_record_id
    JOIN poker_sessions AS target ON target.record_id = copy.target_record_id
    CROSS JOIN LATERAL (
      SELECT
        (SELECT sum(r.net) FROM session_results AS r
          WHERE r.owner_id = p_target_account
            AND r.session_record_id = copy.target_record_id) AS target_net,
        (SELECT sum(r.ending_stack) FROM session_results AS r
          WHERE r.owner_id = p_target_account
            AND r.session_record_id = copy.target_record_id) AS target_ending,
        (SELECT sum(r.invested) FROM session_results AS r
          WHERE r.owner_id = p_target_account
            AND r.session_record_id = copy.target_record_id) AS target_invested,
        (SELECT coalesce(bool_and(
            r.net = (source_result.value->>'net')::bigint
            AND r.ending_stack = (source_result.value->>'end')::bigint
          ), false)
          FROM jsonb_array_elements(source.results)
            WITH ORDINALITY AS source_result(value, position)
          JOIN session_results AS r
            ON r.owner_id = p_target_account
           AND r.session_record_id = copy.target_record_id
           AND r.position = source_result.position) AS results_match,
        (SELECT sum(e.amount) FROM buy_in_events AS e
          WHERE e.owner_id = p_target_account
            AND e.session_record_id = copy.target_record_id) AS target_buy_ins
    ) AS totals
    WHERE totals.target_net <> 0
       OR totals.target_ending <> totals.target_invested
       OR totals.target_buy_ins <> totals.target_invested
       OR NOT totals.results_match
       OR target.discarded_at IS DISTINCT FROM source.discarded_at
  ) THEN
    RAISE EXCEPTION 'Claimed game accounting does not reconcile with its source';
  END IF;

  RETURN v_claimed;
END
$$;

REVOKE ALL ON FUNCTION public.claim_reviewed_history(uuid, bigint[], text[], text)
  FROM PUBLIC;

INSERT INTO app_migrations (version)
VALUES ('0008_claim_reviewed_history')
ON CONFLICT (version) DO NOTHING;

COMMIT;
