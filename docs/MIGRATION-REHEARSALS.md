# Migration rehearsals

This log records the development-branch rehearsal evidence for each migration. "Production changed: no" below describes each rehearsal at the time. The later rehearsals (0008's claim and the full cutover rehearsal on `cutover-rehearsal`) and the production cutover itself are in the decision history of [`FEATURE-PLAN.md`](./FEATURE-PLAN.md).

## 0001 owner scope foundation

- Date: 2026-09-20
- Project: `wispy-morning-76468301`
- Isolated branch: `multi-user-auth` (`br-little-rain-ay5fufwv`)
- Production changed: no
- Migration: `migrations/0001_owner_scope_foundation.sql`

Pre-migration inventory:

| Check | Value |
| --- | ---: |
| Players | 13 |
| Sessions | 28 |
| Auth users on isolated branch | 1 |
| Discarded players | 0 |
| Discarded sessions | 0 |

Post-migration verification:

| Check | Value |
| --- | ---: |
| Players | 13 |
| Sessions | 28 |
| Accounts | 0 |
| Owned players | 0 |
| Owned sessions | 0 |
| Migration mapping rows | 0 |
| Audit rows | 0 |
| Expected ownership columns | 3 of 3 |
| Expected ownership constraints | 4 of 4 |
| Migration version recorded | yes |

The migration was intentionally expand-only. It created the account lifecycle, nullable ownership keys, owner-local indexes, migration provenance and audit foundations. It did not assign ownership, create application accounts, alter historical results or relax the legacy global uniqueness constraints used by the current API.

Rollback for this development rehearsal is resetting the isolated Neon branch. Do not use a destructive down migration after owner-scoped writes exist. Production application requires separate authorization, a fresh backup/restore rehearsal and the coordinated cutover described in the feature plan.

## 0002 owner-scoped keys

- Date: 2026-09-20
- Project: `wispy-morning-76468301`
- Isolated branch: `multi-user-auth` (`br-little-rain-ay5fufwv`)
- Production changed: no
- Migration: `migrations/0002_owner_scoped_keys.sql`

The migration removed global player-name and client-session-ID uniqueness, added an internal session primary key, and added an account-local session-number counter. The application was changed in the same step so every player and session read, create, discard, restore and permanent-delete query includes the verified account ID.

Isolation rehearsal results:

| Check | Result |
| --- | --- |
| Same normalized player name in two accounts | Passed |
| Same client session ID in two accounts | Passed |
| Foreign-owner player mutation | Matched zero rows |
| One owner's session discard affected the other | No |
| Retried session save duplicated the session | No |
| Retried session save consumed another display number | No |
| Isolation fixtures remaining after test | 0 |
| Legacy players preserved and unowned | 13 |
| Legacy sessions preserved and unowned | 28 |
| Application accounts after test cleanup | 1 |

The authenticated browser showed zero players and zero sessions after cutover, confirming that unowned legacy history is no longer returned by the application. This is the expected pre-backfill state. Row-level security and restricted runtime credentials remain required defense-in-depth work before deployment.

## 0003 reviewed Rajarshi history

- Date: 2026-09-21
- Project: `wispy-morning-76468301`
- Isolated branch: `multi-user-auth` (`br-little-rain-ay5fufwv`)
- Production changed: no
- Data migration: `migrations/data/0003_backfill_rajarshi_reviewed_history.sql`

Only cohorts A–G and J–L from the reviewed ownership manifest were cloned into the authenticated Rajarshi ledger. Cohorts H–I and M remained unowned. The migration retained every source row, replaced legacy player references with owner-local player IDs, assigned chronological local session numbers 1–24 and advanced the account counter to 25. Ratan was added to the friend list without fabricated history.

Reconciliation:

| Check | Result |
| --- | ---: |
| Owner-local friend profiles | 9 |
| Owner-local sessions | 24 |
| Owner-local results | 72 |
| Player provenance mappings | 8 |
| Session provenance mappings | 24 |
| Session fields matching source | 24 of 24 |
| Result values matching source, excluding replaced player IDs | 24 of 24 |
| Foreign or missing owner-local player references | 0 |
| Unbalanced copied sessions | 0 |
| Next owner-local session number | 25 |
| Legacy players retained | 13 |
| Legacy sessions retained | 28 |

An idempotent rerun of the player and session copy created no duplicate profiles or sessions. Browser verification showed 9 private players, 24 private sessions and the expected standings/session history.

## 0004 database-enforced isolation

- Date: 2026-09-21
- Project: `wispy-morning-76468301`
- Isolated branch: `multi-user-auth` (`br-little-rain-ay5fufwv`)
- Production changed: no
- Migration: `migrations/0004_database_enforced_isolation.sql`

The application now connects as the SQL-created `menoka_app` role. The role has login permission but no superuser, role-management, database-creation or `BYPASSRLS` capability and does not inherit `neon_superuser`. The runtime can use only the account, player and session operations required by the current APIs. Migration credentials remain separate.

Every application query runs in a transaction that sets the server-verified Neon Auth UUID with transaction-local scope. Row-level policies map that UUID to the internal account and deny rows owned by any other account. Existing explicit owner predicates remain in the queries as an additional application check.

Isolation rehearsal results:

| Check | Result |
| --- | --- |
| No authenticated transaction context | Zero account and player rows visible |
| Account A reads Account B/player B | Zero rows |
| Account B reads Account A/player A | Zero rows |
| Account A updates Account B player by guessed ID | Zero rows |
| Account A inserts a player owned by Account B | Rejected by row policy |
| Runtime reads migration ledger | Permission denied |
| Context after pooled HTTP connection reuse | Cleared; zero rows without a new context |
| Browser with restricted credential | 9 players and 24 sessions loaded successfully |
| Isolation fixtures remaining after test | 0 |

The rehearsal also found that roles created through Neon's role API inherit `neon_superuser` and therefore bypass row security. That role type is explicitly rejected for runtime use. The application role must be created through SQL with the attributes recorded in the migration README, then given an independently initialized credential.

The unused API-created rehearsal role was deleted after explicit user approval. Only the restricted `menoka_app` runtime role remains in application configuration.

## 0005 normalized accounting

- Date: 2026-09-21
- Project: `wispy-morning-76468301`
- Isolated branch: `multi-user-auth` (`br-little-rain-ay5fufwv`)
- Production changed: no
- Migration: `migrations/0005_normalized_accounting.sql`

The migration created owner-bound session results and ordered buy-in events. It rejected incomplete player references and required each owned legacy result and whole session to reconcile before backfill. The original JSON remains on the session as an immutable compatibility snapshot; application reads now use the relational records.

Reconciliation:

| Check | Result |
| --- | ---: |
| Owned sessions | 24 |
| Normalized results | 72 |
| Buy-in events | 72 |
| Unbalanced sessions | 0 |
| Buy-in/event investment mismatches | 0 |
| Relational/snapshot result mismatches | 0 |
| Accounting row policies | 2 |
| Migration version recorded | yes |

A restricted `menoka_app` smoke test created a temporary account and saved a balanced two-player session through the same atomic query used by the API. The first request saved one session, two results and two events; repeating the same client session ID saved zero rows and left the next local number at 2. Cleanup removed the temporary account and every dependent row.

The initial cleanup attempt exposed that an immediate `RESTRICT` player-history foreign key could be checked before the parallel session cascade during whole-account deletion. The final migration uses a deferred `NO ACTION` check instead. It still rejects direct deletion of a player with history at transaction commit, while allowing all account-owned rows to cascade together. Runtime grants on both accounting tables are limited to `SELECT` and `INSERT`.

## 0006 account deletion requests

- Date: 2026-09-24
- Project: `wispy-morning-76468301`
- Isolated branch: `multi-user-auth` (`br-little-rain-ay5fufwv`)
- Production changed: no
- Migration: `migrations/0006_account_deletion_requests.sql`

Pre-migration: 1 account (active), 9 owned players, 24 owned sessions, 72 results, 0 audit events, no lifecycle trigger, no runtime audit grants.

Restricted-role rehearsal (as `menoka_app`, one transaction, rolled back):

| Check | Result |
| --- | --- |
| Runs as the restricted role | Passed |
| Request locks the account | Passed |
| Database stamps the request time, ignoring a supplied date | Passed |
| Repeated request changes nothing | Passed |
| Backdating a pending request is rejected | Passed |
| App role cannot move an account to `purging` | Passed |
| Audit events for another account are rejected by row policy | Passed |
| Another account cannot be locked | Passed |
| Recovery inside the grace period reactivates the account | Passed |
| Audit trail records request and cancellation | Passed |
| Another account cannot read the audit trail | Passed |
| Ordinary account updates, such as session numbering, still work | Passed |

Post-migration: the same counts, with the migration recorded, the trigger present and runtime `audit_events` grants of `INSERT, SELECT`. No fixtures remained.

Browser round trip: a request locked the dev account and left zero live Neon Auth sessions, and the ledger APIs returned 401. After sign-in, the locked screen showed the 30-day deadline. Recovery restored 9 players, 24 sessions and 72 results, and the audit trail showed `account.deletion_requested → account.deletion_cancelled`.

Rollback for development is branch reset. The migration only adds a policy, a grant and a trigger; it changes no data.

## 0007 account purge

- Date: 2026-09-24
- Project: `wispy-morning-76468301`
- Isolated branch: `multi-user-auth` (`br-little-rain-ay5fufwv`)
- Production changed: no
- Migration: `migrations/0007_account_purge.sql`

Setup: `menoka_purge` was created with SQL as `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`. It got a random in-database password, then a Neon console reset whose value only the user handled.

Purge-role permission probes (10 of 10 passed): it connects as `menoka_purge` and can call `purge_auth_identity_exists`. It cannot read `accounts`, `players`, `poker_sessions`, `session_results`, `audit_events`, `account_purges` or `neon_auth.user`, and cannot delete from `accounts`.

End-to-end run through `GET /api/cron/purge-accounts`:

| Check | Result |
| --- | --- |
| No or wrong bearer secret | 401 |
| Overdue fixture (Auth user, account 31 days past request, 1 player, 1 audit event) | Purged in one run (`due 1, purged 1, failed 0`) |
| Fixture Auth user and sessions | 0 remaining |
| Fixture account, player and audit rows | 0 remaining |
| Purge log | Complete after 1 attempt, no error, Auth user ID cleared |
| Second run | `due 0` |
| Other accounts | Real ledger at 9 players, 24 sessions, 72 results; second host account unchanged |
| Healthchecks.io | Start and success pings sent without errors |

Rollback for development is branch reset. The migration adds a table, functions and grants. It deletes data only when the job runs, and only for accounts past their 30-day deadline.

## 0009 live views

- Date: 2026-09-25
- Isolated branch: `multi-user-auth` (`br-little-rain-ay5fufwv`)
- Production changed: no
- Migration: `migrations/0009_live_views.sql`, applied as the owner in one transaction, no errors

Run as `menoka_app` from `.env.local` inside one `DO` block that ends by raising an exception, so every fixture was rolled back (12 of 12 passed):

| Check | Result |
| --- | --- |
| Host writes its own row | Allowed |
| Host inserts a row for another owner | Refused (42501, row security) |
| Second host lists rows | 0 |
| Second host updates or deletes the first host's row | 0 rows each |
| No signed-in host, direct select | 0 rows |
| No signed-in host, `read_live_view` with the right token hash | Returns the standings |
| Unknown token hash | 0 rows |
| Expiry more than 12 hours after the update | Refused (check constraint) |
| Expired link | 0 rows |
| Account in `deletion_requested` | 0 rows |
| Stopped link (row deleted) | 0 rows |

Afterwards: 2 accounts and 0 `live_views` rows, as before. A browser round trip on the same branch (see the plan entry) left 0 rows and four `live_view.*` audit events on the real dev account.

Rollback: `DROP FUNCTION public.read_live_view(bytea); DROP TABLE live_views; DELETE FROM app_migrations WHERE version = '0009_live_views';`. Only live links are lost.

## 0010 identity codes

- Date: 2026-09-25
- Isolated branch: `multi-user-auth` (`br-little-rain-ay5fufwv`)
- Production changed: no
- Migration: `migrations/0010_identity_codes.sql`, applied as the owner in one transaction, no errors
- Before: 2 accounts, 22 players (9 owned), 24 owned games, 72 results. After: the same counts, 2 distinct user codes and 22 distinct player codes, all matching the format.
- Generator: 20,000 sample codes were all valid and all different, and all 31 characters appeared in the first position. `menoka_app` can execute it; `menoka_purge` can't.

Run as `menoka_app` from `.env.local` inside one `DO` block that ends by raising an exception, so every fixture was rolled back (12 of 12 passed):

| Check | Result |
| --- | --- |
| New account gets a valid code by default | Yes |
| New player gets a valid code by default | Yes |
| Host saves its own display name | 1 row |
| Untrimmed name, 41-character name, malformed code | Refused (check constraint) each |
| Host replaces its code and writes the audit event | New code, differs from the old one |
| Second host looks up the first by old code, new code or ID | 0 rows |
| Second host renames or re-codes the first | 0 rows each |
| Second host looks up the first host's player by code | 0 rows |
| No signed-in user lists accounts | 0 rows |
| Locked account (deletion requested) saves a name through the app's `lifecycle_state = 'active'` condition | 0 rows |

Afterwards: 2 accounts, 22 players, no replacement audit events, as before. A browser round trip on the same branch (see the plan entry) then set the real dev account's name to "Rajarshi Roy" and replaced its code once, leaving one `account.user_code_replaced` audit event.

Rollback: see `migrations/README.md`.

## 0011 friend requests

- Date: 2026-09-25
- Isolated branch: `multi-user-auth` (`br-little-rain-ay5fufwv`)
- Production changed: no
- Migration: `migrations/0011_friend_requests.sql`, applied as the owner in one transaction. The first attempt failed and rolled back: the check `linked_account_id IS DISTINCT FROM owner_id` rejected legacy players with no owner (both NULL). It became `linked_account_id IS NULL OR (owner_id IS NOT NULL AND linked_account_id <> owner_id)`, and the second attempt succeeded.

Run as `menoka_app` from `.env.local` with three fixture accounts (host A, friend B, stranger C, plus 20 extra accounts for the limit) inside one `DO` block that ends by raising an exception, so everything was rolled back (40 of 40 passed):

| Area | Checks |
| --- | --- |
| No direct access | Reading `friend_requests` or `friend_connections`, inserting a connection, and calling the internal helpers `friend_caller` and `friend_audit`: permission denied each |
| Links only through requests | Inserting a player with a link, or changing a link: refused by the trigger |
| Find | Returns only name and relation (`none`, `self`, `friends`) |
| Send | Needs a name; refuses own code, unknown code, another host's player, a duplicate, and a reverse request while one waits |
| Only the recipient answers | Stranger can't accept, decline or cancel, and sees an empty overview; the sender can't accept their own request |
| Accept | Recipient sees the claimed player; can't link another host's player or reuse a taken name; accepting links the chosen players on both sides; both overviews show the friend, the linked player and the other side's name; a new request then says "already friends" |
| Protection | A linked player can't be deleted but can be discarded and restored; the stranger still sees no players and can't remove the friendship |
| Remove | Unlinks both sides and keeps every player |
| Name clash | A new player on the sender's side becomes "Host A (2)" |
| Decline and cancel | Asking again within 7 days after a decline is refused; cancel then resend works |
| Limits | The 21st pending request is refused |
| Locked accounts | A locked caller is refused; a locked account can't be found and its requests are hidden; no signed-in user is refused |

As the owner, also rolled back: deleting an account the way the purge does left the friend's player in place and unlinked, and removed the deleted account's players, friendship and requests.

Browser round trip on the same branch (see the plan entry), with a temporary "Test Friend" fixture account created as the owner, which acted through the same functions: accept with a claimed player, remove, send with a chosen player and a claimed code, the fixture accepting it, cancel, and decline. Afterwards the fixture account was deleted: 2 accounts, 22 players, 0 links, 0 requests, 0 friendships, 24 owned games and 72 results, as before. The dev account keeps audit events from the round trip.

Rollback: see `migrations/README.md`.

## 0012 group standings

- Date: 2026-09-25
- Isolated branch: `multi-user-auth` (`br-little-rain-ay5fufwv`)
- Production changed: no
- Migration: `migrations/0012_group_standings.sql`, applied as the owner in one transaction, no errors

Run as `menoka_app` inside one `DO` block that ends by raising an exception, so everything was rolled back (10 of 10 passed). A fixture friend sent a request claiming Debraj in the real dev ledger, and the dev host accepted it through `friend_accept`:

| Check | Result |
| --- | --- |
| Before linking, and while the request waits | No groups |
| After accepting | One group: host "Rajarshi Roy", your player "Debraj", 24 saved games, 72 verified results |
| Friend reads the host's `poker_sessions` or `session_results` directly | 0 rows (row security unchanged) |
| Stranger | No groups |
| Host discards a game | 23 games |
| Host locked for deletion | No groups; visible again after recovery |
| Friend removes the host | No groups |
| Locked caller | Refused (`friend:locked`) |

Browser round trip on the same branch (see the plan entry) with a temporary "Test Host" fixture (two games, linked to the dev account) created as the owner. Afterwards the fixture and the player it added to the dev list were deleted: 2 accounts, 22 players, no links or friendships, 24 owned games and 72 results.

Rollback: see `migrations/README.md`.

## Production application

- Date: 2026-09-25
- Branch: `br-small-sea-ayumyssr` (production)
- Applied: 0001, 0002, 0004, 0005, 0006, 0007 and 0008, one transaction each, no errors. `data/0003` is development only.
- After: 7 `app_migrations` rows, 32 unowned games, 15 unowned players, 0 accounts; `menoka_app` and `menoka_purge` not superusers, no `BYPASSRLS`, not in `neon_superuser`.
- Then the claim for Rajarshi returned 27, and standings matched the rehearsal. Details are in the plan's "2026-09-25 multi-user production cutover" entry.
- Later the same day, with the user's go-ahead: 0009 applied in one transaction, no errors. Before: 0001–0008 except 0003, no `live_views`, 1 account, 27 owned games. After: `0009_live_views` recorded, row security on, 0 rows, 27 owned games. The preview branch `br-tiny-forest-ayt6f3fe` got 0009 earlier from the user in the Neon editor.
