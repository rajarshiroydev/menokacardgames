CREATE TABLE IF NOT EXISTS poker_sessions (
  id text PRIMARY KEY,
  played_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL,
  ante bigint NOT NULL CHECK (ante > 0),
  starting_stack bigint NOT NULL CHECK (starting_stack >= 0),
  hands integer NOT NULL CHECK (hands > 0),
  results jsonb NOT NULL CHECK (
    jsonb_typeof(results) = 'array'
    AND jsonb_array_length(results) BETWEEN 2 AND 10
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS poker_sessions_played_at_idx
  ON poker_sessions (played_at DESC);
