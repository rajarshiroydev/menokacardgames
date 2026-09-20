\set ON_ERROR_STOP on

\if :{?target_account_id}
\else
  \echo 'Pass the reviewed internal account UUID with -v target_account_id=...'
  \quit 3
\endif

BEGIN;

CREATE TEMP TABLE backfill_target_account (
  id uuid PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO backfill_target_account (id)
SELECT id
FROM accounts
WHERE id = :'target_account_id'::uuid
  AND lifecycle_state = 'active';

DO $$
BEGIN
  IF (SELECT count(*) FROM backfill_target_account) <> 1 THEN
    RAISE EXCEPTION 'Target account is missing or inactive';
  END IF;

  IF (
    SELECT count(*)
    FROM poker_sessions
    WHERE owner_id IS NULL
      AND session_number IN (
        5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
        21, 22, 23, 26, 27, 28, 29, 31
      )
  ) <> 24 THEN
    RAISE EXCEPTION 'Reviewed source session set no longer contains 24 rows';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM poker_sessions AS session
    CROSS JOIN backfill_target_account AS target
    WHERE session.owner_id = target.id
      AND NOT EXISTS (
        SELECT 1
        FROM migration_mapping AS mapping
        WHERE mapping.source_kind = 'session'
          AND mapping.target_owner_id = target.id
          AND mapping.target_id = session.record_id::text
          AND mapping.review_status = 'migrated'
      )
  ) THEN
    RAISE EXCEPTION 'Target account has sessions outside this reviewed backfill';
  END IF;
END
$$;

WITH friend (name) AS (
  VALUES
    ('Rajarshi'),
    ('Debraj'),
    ('Pratik'),
    ('Rahul Basak'),
    ('Ratan'),
    ('Shubhankar'),
    ('Soham'),
    ('Utsav'),
    ('Abhirup')
)
INSERT INTO players (owner_id, name, name_key)
SELECT
  target.id,
  friend.name,
  lower(regexp_replace(btrim(friend.name), '\s+', ' ', 'g'))
FROM backfill_target_account AS target
CROSS JOIN friend
ON CONFLICT (owner_id, name_key) WHERE owner_id IS NOT NULL DO UPDATE
SET name = EXCLUDED.name;

INSERT INTO migration_mapping (
  source_kind,
  source_id,
  target_owner_id,
  target_id,
  review_status,
  provenance,
  reviewed_at,
  migrated_at
)
SELECT
  'player',
  source.id,
  target.id,
  destination.id,
  'migrated',
  jsonb_build_object(
    'decision', 'confirmed_by_rajarshi',
    'manifest', 'docs/HISTORICAL-OWNERSHIP.md'
  ),
  now(),
  now()
FROM backfill_target_account AS target
JOIN players AS source
  ON source.owner_id IS NULL
JOIN players AS destination
  ON destination.owner_id = target.id
 AND destination.name_key = source.name_key
WHERE source.name_key IN (
  'rajarshi',
  'debraj',
  'pratik',
  'rahul basak',
  'shubhankar',
  'soham',
  'utsav',
  'abhirup'
)
ON CONFLICT (source_kind, source_id, target_owner_id)
  WHERE target_owner_id IS NOT NULL
DO UPDATE SET
  target_id = EXCLUDED.target_id,
  review_status = EXCLUDED.review_status,
  provenance = EXCLUDED.provenance,
  reviewed_at = EXCLUDED.reviewed_at,
  migrated_at = EXCLUDED.migrated_at;

WITH reviewed_source AS (
  SELECT
    source.*,
    row_number() OVER (
      ORDER BY source.played_at, source.created_at, source.record_id
    ) AS local_number
  FROM poker_sessions AS source
  WHERE source.owner_id IS NULL
    AND source.session_number IN (
      5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      21, 22, 23, 26, 27, 28, 29, 31
    )
),
mapped_source AS (
  SELECT
    source.record_id,
    source.id,
    source.local_number,
    source.game_name,
    source.played_at,
    source.ended_at,
    source.ante,
    source.starting_stack,
    source.hands,
    source.blind_history,
    source.discarded_at,
    jsonb_agg(
      result.value
        || jsonb_build_object(
          'playerId', destination.id,
          'name', destination.name
        )
      ORDER BY result.position
    ) AS results
  FROM reviewed_source AS source
  CROSS JOIN backfill_target_account AS target
  CROSS JOIN LATERAL jsonb_array_elements(source.results)
    WITH ORDINALITY AS result(value, position)
  JOIN migration_mapping AS mapping
    ON mapping.source_kind = 'player'
   AND mapping.source_id = result.value->>'playerId'
   AND mapping.target_owner_id = target.id
   AND mapping.review_status = 'migrated'
  JOIN players AS destination
    ON destination.id = mapping.target_id
   AND destination.owner_id = target.id
  GROUP BY
    source.record_id,
    source.id,
    source.local_number,
    source.game_name,
    source.played_at,
    source.ended_at,
    source.ante,
    source.starting_stack,
    source.hands,
    source.blind_history,
    source.discarded_at
)
INSERT INTO poker_sessions (
  owner_id,
  owner_session_number,
  id,
  game_name,
  played_at,
  ended_at,
  ante,
  starting_stack,
  hands,
  blind_history,
  results,
  discarded_at
)
SELECT
  target.id,
  source.local_number,
  source.id,
  source.game_name,
  source.played_at,
  source.ended_at,
  source.ante,
  source.starting_stack,
  source.hands,
  source.blind_history,
  source.results,
  source.discarded_at
FROM mapped_source AS source
CROSS JOIN backfill_target_account AS target
ON CONFLICT (owner_id, id) WHERE owner_id IS NOT NULL DO NOTHING;

INSERT INTO migration_mapping (
  source_kind,
  source_id,
  target_owner_id,
  target_id,
  review_status,
  provenance,
  reviewed_at,
  migrated_at
)
SELECT
  'session',
  source.record_id::text,
  target.id,
  destination.record_id::text,
  'migrated',
  jsonb_build_object(
    'decision', 'confirmed_by_rajarshi',
    'manifest', 'docs/HISTORICAL-OWNERSHIP.md',
    'sourceSessionNumber', source.session_number,
    'cohort', CASE
      WHEN source.session_number = 5 THEN 'A'
      WHEN source.session_number BETWEEN 6 AND 7 THEN 'B'
      WHEN source.session_number = 8 THEN 'C'
      WHEN source.session_number BETWEEN 9 AND 12 THEN 'D'
      WHEN source.session_number BETWEEN 13 AND 21 THEN 'E'
      WHEN source.session_number = 22 THEN 'F'
      WHEN source.session_number = 23 THEN 'G'
      WHEN source.session_number = 26 THEN 'J'
      WHEN source.session_number BETWEEN 27 AND 29 THEN 'K'
      WHEN source.session_number = 31 THEN 'L'
    END
  ),
  now(),
  now()
FROM backfill_target_account AS target
JOIN poker_sessions AS source
  ON source.owner_id IS NULL
 AND source.session_number IN (
   5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
   21, 22, 23, 26, 27, 28, 29, 31
 )
JOIN poker_sessions AS destination
  ON destination.owner_id = target.id
 AND destination.id = source.id
ON CONFLICT (source_kind, source_id, target_owner_id)
  WHERE target_owner_id IS NOT NULL
DO UPDATE SET
  target_id = EXCLUDED.target_id,
  review_status = EXCLUDED.review_status,
  provenance = EXCLUDED.provenance,
  reviewed_at = EXCLUDED.reviewed_at,
  migrated_at = EXCLUDED.migrated_at;

UPDATE accounts AS account
SET
  next_session_number = greatest(
    account.next_session_number,
    ledger.next_session_number
  ),
  updated_at = now()
FROM (
  SELECT
    target.id,
    coalesce(max(session.owner_session_number), 0) + 1 AS next_session_number
  FROM backfill_target_account AS target
  LEFT JOIN poker_sessions AS session ON session.owner_id = target.id
  GROUP BY target.id
) AS ledger
WHERE account.id = ledger.id;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM poker_sessions AS session
    CROSS JOIN backfill_target_account AS target
    WHERE session.owner_id = target.id
  ) <> 24 THEN
    RAISE EXCEPTION 'Backfill did not produce exactly 24 owned sessions';
  END IF;

  IF (
    SELECT count(*)
    FROM players AS player
    CROSS JOIN backfill_target_account AS target
    WHERE player.owner_id = target.id
  ) <> 9 THEN
    RAISE EXCEPTION 'Backfill did not produce exactly 9 friend profiles';
  END IF;

  IF (
    SELECT count(*)
    FROM poker_sessions AS session
    CROSS JOIN backfill_target_account AS target
    CROSS JOIN LATERAL jsonb_array_elements(session.results) AS result
    WHERE session.owner_id = target.id
  ) <> 72 THEN
    RAISE EXCEPTION 'Backfill did not preserve exactly 72 session results';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM poker_sessions AS session
    CROSS JOIN backfill_target_account AS target
    WHERE session.owner_id = target.id
      AND (
        SELECT sum((result->>'net')::bigint)
        FROM jsonb_array_elements(session.results) AS result
      ) <> 0
  ) THEN
    RAISE EXCEPTION 'Backfill produced an unbalanced session';
  END IF;

  IF (
    SELECT next_session_number
    FROM accounts AS account
    JOIN backfill_target_account AS target ON target.id = account.id
  ) <> 25 THEN
    RAISE EXCEPTION 'Backfill did not advance the local session counter to 25';
  END IF;
END
$$;

INSERT INTO app_migrations (version)
VALUES ('0003_backfill_rajarshi_reviewed_history')
ON CONFLICT (version) DO NOTHING;

COMMIT;
