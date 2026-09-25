BEGIN;

-- Friend network step 1: identity basics. Every account gets a user code that
-- other people will search for to send a friend request, and an optional
-- display name the person chooses. Every player profile gets its own code,
-- which a host can share with a player who hasn't signed up yet. Codes are
-- identifiers, not secrets: linking a login to a player always needs the
-- host's approval (a later step), so a known code grants nothing.

-- Eight characters from an alphabet without 0/O or 1/I/L. The bytes come from
-- gen_random_uuid(), which uses the server's strong random source; bytes 6 and
-- 8 carry the UUID version and variant, so only fully random bytes are used.
-- Taking each byte modulo 31 favours the first eight characters very slightly
-- (9/256 against 8/256), which is harmless for identifiers.
CREATE OR REPLACE FUNCTION public.new_identity_code()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = pg_catalog
AS $$
  SELECT string_agg(
    substr(
      '23456789ABCDEFGHJKMNPQRSTUVWXYZ',
      get_byte(source.random_bytes, byte_position) % 31 + 1,
      1
    ),
    ''
    ORDER BY byte_position
  )
  FROM (SELECT uuid_send(gen_random_uuid()) AS random_bytes) AS source,
    unnest(ARRAY[0, 1, 2, 3, 4, 5, 10, 11]) AS byte_position
$$;

REVOKE ALL ON FUNCTION public.new_identity_code() FROM PUBLIC;
-- The runtime role evaluates the column defaults below when it provisions an
-- account or adds a player, and calls the function when a person replaces
-- their code.
GRANT EXECUTE ON FUNCTION public.new_identity_code() TO menoka_app;

-- A volatile default is evaluated per row while the column is added, so every
-- existing account and player gets its own code.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS user_code text DEFAULT public.new_identity_code();
ALTER TABLE accounts ALTER COLUMN user_code SET NOT NULL;
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_user_code_format;
ALTER TABLE accounts ADD CONSTRAINT accounts_user_code_format
  CHECK (user_code ~ '^[2-9A-HJKMNP-Z]{8}$');
CREATE UNIQUE INDEX IF NOT EXISTS accounts_user_code_idx
  ON accounts (user_code);

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_display_name_valid;
ALTER TABLE accounts ADD CONSTRAINT accounts_display_name_valid CHECK (
  display_name IS NULL
  OR (
    char_length(display_name) BETWEEN 1 AND 40
    AND display_name = btrim(display_name)
  )
);

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS player_code text DEFAULT public.new_identity_code();
ALTER TABLE players ALTER COLUMN player_code SET NOT NULL;
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_player_code_format;
ALTER TABLE players ADD CONSTRAINT players_player_code_format
  CHECK (player_code ~ '^[2-9A-HJKMNP-Z]{8}$');
CREATE UNIQUE INDEX IF NOT EXISTS players_player_code_idx
  ON players (player_code);

INSERT INTO app_migrations (version)
VALUES ('0010_identity_codes')
ON CONFLICT (version) DO NOTHING;

COMMIT;
