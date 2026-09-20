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

Rollback during development is branch reset. Production rollback must use the release plan's authenticated read-only mode and reconciled forward migration; do not blindly drop ownership structures after owner-scoped writes exist.
