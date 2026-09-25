BEGIN;

-- Live standings players open through a share link while a game is played.
-- One row per host: sharing again replaces the link. Only the SHA-256 hash of
-- the link's token is stored. The row holds the standings the server derived
-- from the host's last update and stops being readable 12 hours after it.
CREATE TABLE IF NOT EXISTS live_views (
  owner_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  snapshot jsonb NOT NULL CHECK (
    jsonb_typeof(snapshot) = 'object' AND pg_column_size(snapshot) < 16384
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '12 hours',
  CONSTRAINT live_views_expiry_bounded CHECK (
    expires_at <= updated_at + interval '12 hours'
  )
);

ALTER TABLE live_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS live_views_runtime_isolation ON live_views;
CREATE POLICY live_views_runtime_isolation ON live_views
  FOR ALL
  TO menoka_app
  USING (owner_id = public.current_app_account_id())
  WITH CHECK (owner_id = public.current_app_account_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON live_views TO menoka_app;

-- The public read behind a share link. It runs without a signed-in host, so
-- it bypasses row security and returns only the derived standings and their time,
-- and nothing once the link has expired or the host's account is locked.
CREATE OR REPLACE FUNCTION public.read_live_view(p_token_hash bytea)
RETURNS TABLE (snapshot jsonb, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT live.snapshot, live.updated_at
  FROM public.live_views AS live
  JOIN public.accounts AS account ON account.id = live.owner_id
  WHERE live.token_hash = p_token_hash
    AND live.expires_at > now()
    AND account.lifecycle_state = 'active'
$$;

REVOKE ALL ON FUNCTION public.read_live_view(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_live_view(bytea) TO menoka_app;

INSERT INTO app_migrations (version)
VALUES ('0009_live_views')
ON CONFLICT (version) DO NOTHING;

COMMIT;
