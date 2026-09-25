# Database migrations

Apply these files in numeric order with migration credentials. Application runtime credentials must not perform DDL.

**Status:** production (Neon branch `br-small-sea-ayumyssr`) has 0001, 0002 and 0004–0009, applied on 2026-09-25. `data/0003` ran only on the development branch; production uses the 0008 claim function instead. Always target Neon branches by ID, not by console name.

Migration workflow:

1. Create or reset an isolated Neon branch from the intended parent.
2. Record source row counts and reconciliation totals.
3. Apply the next migration transactionally.
4. Run schema assertions, application tests and migration reconciliation.
5. Record the migration in `app_migrations` only as part of the same transaction.
6. Obtain separate authorization before applying a rehearsed migration to production.

`0001_owner_scope_foundation.sql` is an expand-only migration. It leaves legacy players and sessions unowned and keeps the current global constraints so the pre-cutover application remains usable. A later coordinated migration will remove global uniqueness, make ownership mandatory, install row-level security and revoke broad runtime access only after all routes use the owner-scoped data layer.

`0002_owner_scoped_keys.sql` is the coordinated application cutover migration. It removes global player-name and session-ID assumptions, introduces an internal session primary key and gives each account an atomic display-number counter. It preserves unowned legacy records for reviewed backfill. Apply it only with application code that scopes every player and session query by the verified account.

`0004_database_enforced_isolation.sql` enables row-level security, creates the transaction-local authenticated-user context helpers and grants only the tables and operations used by the application to the `menoka_app` role. Create that role with SQL as an unprivileged login (`NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`) before applying the migration, then initialize its password through Neon. Do not use a role created by Neon's role API for application traffic because those roles inherit `neon_superuser` and bypass row security. The migration refuses an administrative or `BYPASSRLS` role. Keep migration credentials separate because the table owner deliberately retains full visibility for reviewed migrations and reconciliation.

`0005_normalized_accounting.sql` creates owner-bound session-result and buy-in-event records, backfills every owned session and aborts unless player references, individual investments and whole-session chip totals reconcile. The relational records become authoritative for reads and analytics; `poker_sessions.results` remains an immutable compatibility snapshot during the transition.

`0006_account_deletion_requests.sql` lets the runtime role write audit events for its own account only, and adds a lifecycle guard trigger. For `menoka_app`, the trigger allows only active → deletion requested (stamping the database's own time) and deletion requested → active within 30 days. It rejects backdating and any move to `purging`, which is reserved for the future purge job and its separate credentials.

`0007_account_purge.sql` adds the purge job's database side. Create the purge login first with SQL, as for `menoka_app`: `CREATE ROLE menoka_purge LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`. Neon's console cannot reset the password of a role created without one ("cannot update password for role without password"). First give it a random password that nobody sees: `DO $$ BEGIN EXECUTE format('ALTER ROLE menoka_purge WITH PASSWORD %L', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')); END $$`. Then use **Reset password** in the Neon console to get the real credential. The migration refuses an administrative role. `menoka_purge` gets no table privileges, only `EXECUTE` on five `SECURITY DEFINER` functions. They claim accounts more than 30 days past their request (marking them `purging`), check whether a Neon Auth user still exists, record progress or failures in `account_purges`, and delete a claimed account whose identity is gone, cascading to everything it owns. `account_purges` has no foreign key, so its record outlives the account; the Auth user ID is cleared on completion. Every step can be repeated safely.

`0008_claim_reviewed_history.sql` adds the owner-only function `claim_reviewed_history(account, game numbers, friend names, decision)`. It copies reviewed unowned legacy games into one host's ledger with that host's friend profiles, normalized results, buy-ins and provenance, and aborts unless every total reconciles. Rerunning it returns 0. Who gets which games is in `docs/HISTORICAL-OWNERSHIP.md`.

`0009_live_views.sql` adds `live_views` for the live standings link: one row per host, the SHA-256 of the link token, the server-derived standings and an expiry at most 12 hours after the last update. `menoka_app` gets owner-scoped row security on it, and `read_live_view(token_hash)`, a `SECURITY DEFINER` function, lets the public link read one row without a signed-in host, but only while it hasn't expired and the account is active. Rows cascade on account deletion. Status: applied 2026-09-25 to the development branch, the preview branch `br-tiny-forest-ayt6f3fe` (by the user in the Neon editor) and production `br-small-sea-ayumyssr`, before the code that uses it was released.

Data migrations under `migrations/data/` require a reviewed ownership manifest and an explicit target account ID. `0003_backfill_rajarshi_reviewed_history.sql` is the development-branch predecessor of 0008, kept for the record. Run it with `psql -v target_account_id=<internal-account-uuid>`. It clones the approved records, keeps source rows unowned, records provenance and aborts if its reconciliation checks fail.

Rollback during development is branch reset. Production rollback must use the release plan's authenticated read-only mode and reconciled forward migration; do not blindly drop ownership structures after owner-scoped writes exist.
