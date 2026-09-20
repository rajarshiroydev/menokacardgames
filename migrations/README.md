# Database migrations

Apply these files in numeric order with migration credentials. Application runtime credentials must not perform DDL.

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

Data migrations under `migrations/data/` require a reviewed ownership manifest and an explicit target account ID. Run `0003_backfill_rajarshi_reviewed_history.sql` with `psql -v target_account_id=<internal-account-uuid>`. It clones the approved records, keeps source rows unowned, records provenance and aborts if its reconciliation checks fail.

Rollback during development is branch reset. Production rollback must use the release plan's authenticated read-only mode and reconciled forward migration; do not blindly drop ownership structures after owner-scoped writes exist.
