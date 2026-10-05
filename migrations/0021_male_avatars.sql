BEGIN;

-- The avatars are now 20 Lorelei faces (lib/avatars.ts), 15 of them male, and
-- the ids p01-p20 point at new faces. Everyone using the app is a man (the
-- user, 2026-10-05), so every account and player gets a random male face
-- instead of whichever new face their old id now shows.
--
-- The old ids are kept in avatar_backup_0021 for rollback. Running the file
-- again changes nothing: it stops once 0021 is recorded in app_migrations.
-- No grants: only the migration owner can read the backup.

CREATE TABLE IF NOT EXISTS avatar_backup_0021 (
  kind text NOT NULL CHECK (kind IN ('account', 'player')),
  owner_id uuid,
  id text NOT NULL,
  avatar text NOT NULL,
  PRIMARY KEY (kind, id)
);
ALTER TABLE avatar_backup_0021 ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  -- Must match the male faces in lib/avatars.ts.
  male constant text[] := ARRAY[
    'p01', 'p02', 'p04', 'p05', 'p06', 'p07', 'p09', 'p10',
    'p11', 'p12', 'p14', 'p15', 'p16', 'p18', 'p19'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM app_migrations WHERE version = '0021_male_avatars') THEN
    RAISE NOTICE '0021_male_avatars already applied; nothing changed';
    RETURN;
  END IF;

  INSERT INTO avatar_backup_0021 (kind, owner_id, id, avatar)
  SELECT 'account', NULL, id::text, avatar FROM accounts
  UNION ALL
  SELECT 'player', owner_id, id, avatar FROM players;

  -- random() is evaluated per row, so each one gets its own pick.
  UPDATE accounts SET avatar = male[1 + floor(random() * array_length(male, 1))::int];
  UPDATE players SET avatar = male[1 + floor(random() * array_length(male, 1))::int];

  IF EXISTS (SELECT 1 FROM accounts WHERE NOT avatar = ANY (male))
     OR EXISTS (SELECT 1 FROM players WHERE NOT avatar = ANY (male)) THEN
    RAISE EXCEPTION '0021: an account or player was left without a male avatar';
  END IF;

  INSERT INTO app_migrations (version) VALUES ('0021_male_avatars');
END $$;

COMMIT;
