BEGIN;

-- The host's chip set (0036; plan entry "count chips by colour (plan)"): the
-- colours of their physical chips and what each is worth, so a quick ledger's
-- count can be entered colour by colour. A JSON array of up to 8
-- {"colour": "black", "value": 50000} objects, values in hundredths of the
-- game's counting unit (lib/poker/chip-set.ts checks colours, values and
-- duplicates). NULL until the host makes one. It lives on the account, so
-- deleting the account deletes it; nothing about it is saved with games.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS chip_set jsonb;

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_chip_set_shape;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_chip_set_shape CHECK (
    chip_set IS NULL
    OR (
      jsonb_typeof(chip_set) = 'array'
      AND jsonb_array_length(chip_set) BETWEEN 1 AND 8
      AND octet_length(chip_set::text) <= 1024
    )
  );

INSERT INTO app_migrations (version)
VALUES ('0036_chip_sets')
ON CONFLICT (version) DO NOTHING;

COMMIT;
