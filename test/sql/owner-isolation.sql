BEGIN;

INSERT INTO accounts (id, auth_user_id)
VALUES
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000202');

INSERT INTO players (id, owner_id, name, name_key)
VALUES
  ('isolation-a-shared', '00000000-0000-4000-8000-000000000101', 'Shared Name', 'shared name'),
  ('isolation-a-opponent', '00000000-0000-4000-8000-000000000101', 'Opponent', 'opponent'),
  ('isolation-b-shared', '00000000-0000-4000-8000-000000000102', 'Shared Name', 'shared name'),
  ('isolation-b-opponent', '00000000-0000-4000-8000-000000000102', 'Opponent', 'opponent');

INSERT INTO poker_sessions (
  owner_id,
  owner_session_number,
  id,
  played_at,
  ended_at,
  ante,
  starting_stack,
  hands,
  results
)
VALUES
  (
    '00000000-0000-4000-8000-000000000101',
    1,
    'same-client-session-id',
    '2026-09-20T00:00:00Z',
    '2026-09-20T01:00:00Z',
    100,
    1000,
    1,
    '[{"playerId":"isolation-a-shared","name":"Shared Name","net":100,"end":1100},{"playerId":"isolation-a-opponent","name":"Opponent","net":-100,"end":900}]'::jsonb
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    1,
    'same-client-session-id',
    '2026-09-20T00:00:00Z',
    '2026-09-20T01:00:00Z',
    100,
    1000,
    1,
    '[{"playerId":"isolation-b-shared","name":"Shared Name","net":100,"end":1100},{"playerId":"isolation-b-opponent","name":"Opponent","net":-100,"end":900}]'::jsonb
  );

UPDATE players
SET deleted_at = now()
WHERE id = 'isolation-a-shared'
  AND owner_id = '00000000-0000-4000-8000-000000000102';

UPDATE poker_sessions
SET discarded_at = now()
WHERE id = 'same-client-session-id'
  AND owner_id = '00000000-0000-4000-8000-000000000101';

DO $$
BEGIN
  IF (
    SELECT count(*) FROM players
    WHERE owner_id = '00000000-0000-4000-8000-000000000101'
  ) <> 2 THEN
    RAISE EXCEPTION 'owner A player isolation failed';
  END IF;

  IF (
    SELECT count(*) FROM players
    WHERE owner_id = '00000000-0000-4000-8000-000000000102'
  ) <> 2 THEN
    RAISE EXCEPTION 'owner B player isolation failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM players
    WHERE id = 'isolation-a-shared' AND deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'cross-owner player mutation was permitted';
  END IF;

  IF (
    SELECT count(*) FROM poker_sessions
    WHERE id = 'same-client-session-id'
  ) <> 2 THEN
    RAISE EXCEPTION 'owner-scoped client session IDs collided';
  END IF;

  IF (
    SELECT count(*) FROM poker_sessions
    WHERE owner_id = '00000000-0000-4000-8000-000000000101'
      AND discarded_at IS NOT NULL
  ) <> 1 THEN
    RAISE EXCEPTION 'owner A session mutation failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM poker_sessions
    WHERE owner_id = '00000000-0000-4000-8000-000000000102'
      AND discarded_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'owner A mutation crossed into owner B';
  END IF;
END
$$;

INSERT INTO accounts (id, auth_user_id)
VALUES (
  '00000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000203'
);

WITH owner_lock AS MATERIALIZED (
  SELECT pg_advisory_xact_lock(
    hashtextextended('00000000-0000-4000-8000-000000000103', 0)
  )
),
existing AS MATERIALIZED (
  SELECT session.record_id
  FROM poker_sessions AS session, owner_lock
  WHERE session.owner_id = '00000000-0000-4000-8000-000000000103'
    AND session.id = 'retry-session'
),
allocated AS (
  UPDATE accounts
  SET next_session_number = next_session_number + 1
  WHERE id = '00000000-0000-4000-8000-000000000103'
    AND NOT EXISTS (SELECT 1 FROM existing)
  RETURNING next_session_number - 1 AS session_number
)
INSERT INTO poker_sessions (
  owner_id,
  owner_session_number,
  id,
  played_at,
  ended_at,
  ante,
  starting_stack,
  hands,
  results
)
SELECT
  '00000000-0000-4000-8000-000000000103',
  allocated.session_number,
  'retry-session',
  '2026-09-20T00:00:00Z',
  '2026-09-20T01:00:00Z',
  100,
  1000,
  1,
  '[{"playerId":"one","name":"One","net":100,"end":1100},{"playerId":"two","name":"Two","net":-100,"end":900}]'::jsonb
FROM allocated
ON CONFLICT (owner_id, id) WHERE owner_id IS NOT NULL DO NOTHING;

WITH owner_lock AS MATERIALIZED (
  SELECT pg_advisory_xact_lock(
    hashtextextended('00000000-0000-4000-8000-000000000103', 0)
  )
),
existing AS MATERIALIZED (
  SELECT session.record_id
  FROM poker_sessions AS session, owner_lock
  WHERE session.owner_id = '00000000-0000-4000-8000-000000000103'
    AND session.id = 'retry-session'
),
allocated AS (
  UPDATE accounts
  SET next_session_number = next_session_number + 1
  WHERE id = '00000000-0000-4000-8000-000000000103'
    AND NOT EXISTS (SELECT 1 FROM existing)
  RETURNING next_session_number - 1 AS session_number
)
INSERT INTO poker_sessions (
  owner_id,
  owner_session_number,
  id,
  played_at,
  ended_at,
  ante,
  starting_stack,
  hands,
  results
)
SELECT
  '00000000-0000-4000-8000-000000000103',
  allocated.session_number,
  'retry-session',
  '2026-09-20T00:00:00Z',
  '2026-09-20T01:00:00Z',
  100,
  1000,
  1,
  '[{"playerId":"one","name":"One","net":100,"end":1100},{"playerId":"two","name":"Two","net":-100,"end":900}]'::jsonb
FROM allocated
ON CONFLICT (owner_id, id) WHERE owner_id IS NOT NULL DO NOTHING;

DO $$
BEGIN
  IF (
    SELECT next_session_number
    FROM accounts
    WHERE id = '00000000-0000-4000-8000-000000000103'
  ) <> 2 THEN
    RAISE EXCEPTION 'idempotent retry consumed a session number';
  END IF;

  IF (
    SELECT count(*)
    FROM poker_sessions
    WHERE owner_id = '00000000-0000-4000-8000-000000000103'
      AND id = 'retry-session'
      AND owner_session_number = 1
  ) <> 1 THEN
    RAISE EXCEPTION 'idempotent session save failed';
  END IF;
END
$$;

ROLLBACK;
