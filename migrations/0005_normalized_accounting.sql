BEGIN;

ALTER TABLE players
  ADD CONSTRAINT players_owner_id_id_unique UNIQUE (owner_id, id);

ALTER TABLE poker_sessions
  ADD CONSTRAINT poker_sessions_owner_record_unique
  UNIQUE (owner_id, record_id);

CREATE TABLE session_results (
  owner_id uuid NOT NULL,
  session_record_id uuid NOT NULL,
  player_id text NOT NULL,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 10),
  player_name text NOT NULL CHECK (char_length(player_name) BETWEEN 1 AND 80),
  invested bigint NOT NULL CHECK (invested >= 0),
  ending_stack bigint NOT NULL CHECK (ending_stack >= 0),
  net bigint GENERATED ALWAYS AS (ending_stack - invested) STORED,
  accounting_status text NOT NULL CHECK (
    accounting_status IN ('verified', 'legacy_verified', 'unverified')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, session_record_id, player_id),
  UNIQUE (owner_id, session_record_id, position),
  FOREIGN KEY (owner_id, session_record_id)
    REFERENCES poker_sessions (owner_id, record_id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id, player_id)
    REFERENCES players (owner_id, id)
    ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE buy_in_events (
  owner_id uuid NOT NULL,
  session_record_id uuid NOT NULL,
  player_id text NOT NULL,
  sequence smallint NOT NULL CHECK (sequence BETWEEN 1 AND 64),
  kind text NOT NULL CHECK (kind IN ('initial', 'rebuy')),
  amount bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, session_record_id, player_id, sequence),
  FOREIGN KEY (owner_id, session_record_id, player_id)
    REFERENCES session_results (owner_id, session_record_id, player_id)
    ON DELETE CASCADE,
  CONSTRAINT buy_in_events_kind_sequence CHECK (
    (sequence = 1 AND kind = 'initial' AND amount >= 0)
    OR
    (sequence > 1 AND kind = 'rebuy' AND amount > 0)
  )
);

CREATE INDEX session_results_owner_player_idx
  ON session_results (owner_id, player_id, session_record_id);

CREATE INDEX buy_in_events_owner_session_idx
  ON buy_in_events (owner_id, session_record_id, player_id, sequence);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM poker_sessions AS session
    CROSS JOIN LATERAL jsonb_array_elements(session.results) AS result(value)
    WHERE session.owner_id IS NOT NULL
      AND (
        nullif(result.value->>'playerId', '') IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM players AS player
          WHERE player.owner_id = session.owner_id
            AND player.id = result.value->>'playerId'
        )
        OR (
          result.value ? 'buyIns'
          AND CASE
            WHEN jsonb_typeof(result.value->'buyIns') <> 'array' THEN true
            ELSE jsonb_array_length(result.value->'buyIns') = 0
          END
        )
      )
  ) THEN
    RAISE EXCEPTION 'Owned session results have invalid player or buy-in references';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        session.record_id,
        count(*) AS result_count,
        count(DISTINCT result.value->>'playerId') AS player_count,
        sum((result.value->>'end')::bigint) AS total_ending,
        sum((result.value->>'net')::bigint) AS total_net,
        sum(
          CASE
            WHEN result.value ? 'buyIns' THEN (
              SELECT sum(amount.value::bigint)
              FROM jsonb_array_elements_text(result.value->'buyIns')
                AS amount(value)
            )
            ELSE session.starting_stack
          END
        ) AS total_invested,
        bool_and(
          (result.value->>'end')::bigint - (result.value->>'net')::bigint
          = CASE
            WHEN result.value ? 'buyIns' THEN (
              SELECT sum(amount.value::bigint)
              FROM jsonb_array_elements_text(result.value->'buyIns')
                AS amount(value)
            )
            ELSE session.starting_stack
          END
        ) AS individual_balanced
      FROM poker_sessions AS session
      CROSS JOIN LATERAL jsonb_array_elements(session.results) AS result(value)
      WHERE session.owner_id IS NOT NULL
      GROUP BY session.record_id
    ) AS accounting
    WHERE accounting.result_count <> accounting.player_count
      OR NOT accounting.individual_balanced
      OR accounting.total_net <> 0
      OR accounting.total_ending <> accounting.total_invested
  ) THEN
    RAISE EXCEPTION 'Owned session accounting does not reconcile';
  END IF;
END
$$;

INSERT INTO session_results (
  owner_id,
  session_record_id,
  player_id,
  position,
  player_name,
  invested,
  ending_stack,
  accounting_status
)
SELECT
  session.owner_id,
  session.record_id,
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
FROM poker_sessions AS session
CROSS JOIN LATERAL jsonb_array_elements(session.results)
  WITH ORDINALITY AS result(value, position)
WHERE session.owner_id IS NOT NULL;

INSERT INTO buy_in_events (
  owner_id,
  session_record_id,
  player_id,
  sequence,
  kind,
  amount
)
SELECT
  session.owner_id,
  session.record_id,
  result.value->>'playerId',
  buy_in.position,
  CASE WHEN buy_in.position = 1 THEN 'initial' ELSE 'rebuy' END,
  buy_in.value::bigint
FROM poker_sessions AS session
CROSS JOIN LATERAL jsonb_array_elements(session.results) AS result(value)
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE
    WHEN result.value ? 'buyIns' THEN result.value->'buyIns'
    ELSE jsonb_build_array(session.starting_stack)
  END
) WITH ORDINALITY AS buy_in(value, position)
WHERE session.owner_id IS NOT NULL;

ALTER TABLE session_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE buy_in_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY session_results_runtime_isolation ON session_results
  FOR ALL TO menoka_app
  USING (owner_id = public.current_app_account_id())
  WITH CHECK (owner_id = public.current_app_account_id());

CREATE POLICY buy_in_events_runtime_isolation ON buy_in_events
  FOR ALL TO menoka_app
  USING (owner_id = public.current_app_account_id())
  WITH CHECK (owner_id = public.current_app_account_id());

GRANT SELECT, INSERT ON session_results TO menoka_app;
GRANT SELECT, INSERT ON buy_in_events TO menoka_app;

INSERT INTO app_migrations (version)
VALUES ('0005_normalized_accounting')
ON CONFLICT (version) DO NOTHING;

COMMIT;
