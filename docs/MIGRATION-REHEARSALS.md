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

## 0013 profile (own players and currency)

- **Testbed** (`br-young-night-b5xphgw8`, fake data, 2026-09-30): applied and re-applied as the owner; every named persona got its own player. As `menoka_app`, in transactions that always rolled back: naming a new account creates its own player (numbered "Test Newbie (2)" when the name was taken); pointing an account at another player is refused ("the account's own player is set by the database"); removing the own player is refused; linking it to a friend is refused (`friend:player-unavailable`); a name change shows through `player_display_names()` while the tie stays. As the owner, rolled back: `adopt_self_player` made "Aditi T." Bikram's own player and deleted his empty automatic one; a bad player ID was refused; deleting an account still cascades.
- **Development** (`br-little-rain-ay5fufwv`, 2026-09-30, user's go-ahead, applied through the Neon MCP as the owner): 26 statements, no errors. Before: migrations up to 0012 (with `data/0003`), 3 accounts; "Rajarshi Roy" with 9 players, 24 games, 72 results, and one "Rajarshi" player with 24 results. Then `adopt_self_player` for "Rajarshi" returned "set; there was no own player before", and the backfill gave "Roy dev" a new own player. After: "Rajarshi Roy" owns "Rajarshi" (24 results) with 9 players, 24 games and 72 results unchanged; "Roy dev" owns "Roy dev"; the unnamed account has none; every currency INR. Production build passes on the same code (`2e84f7f`).

## 0014 link a guest after accepting

- **Testbed** (`br-young-night-b5xphgw8`, fake data, 2026-10-01): applied with `testbed:setup`, then the merging version re-created as the owner. Rolled-back checks as the owner: not friends → `friend:not-friends`; another owner's player, the own player, a linked guest and a guest on a pending request → `friend:player-unavailable`; a guest who shared games → `friend:same-game`; a link onto an empty player, and a merge of 32 results and 60 buy-ins with the net (−360,432) unchanged and nothing left on the old player or in the session JSON. As `menoka_app` the function is reachable (`friend:locked` for an unknown sign-in). Browser checks are in the plan entry.
- **Development** (`br-little-rain-ay5fufwv`, 2026-10-01, user's go-ahead, applied through the Neon MCP as the owner): 4 statements, no errors. Before: 0001–0013 (with `data/0003`), 3 accounts, 0 friendships, 0 linked players, 23 players, 52 games, 72 results, 72 buy-ins, total net 0, no `friend_link_guest`. Rehearsal in a `DO` block ending in `RAISE EXCEPTION` (fixture: a friendship between "Rajarshi Roy" and "Roy dev", with Rajarshi Roy's most-played guest linked to Roy dev): not friends, own player, another owner's player, linked guest and same-game were all refused with the expected codes; merging into a new guest moved 14 results and 14 buy-ins with the net (18,950) unchanged, left no rows, player or JSON entries on the old player, and kept the host's total net at 0. After (rolled back): the same counts as before, `0014_link_guest` recorded, `menoka_app` can execute the function and `PUBLIC` can't; through `.env.local` (dev, as `menoka_app`) the call reaches the function (`friend:locked`).

## 0015 avatars

- **Testbed** (`br-young-night-b5xphgw8`, fake data, 2026-10-01): applied with `testbed:setup` (20 statements). Every account and player got a valid avatar (15 different across 30 players); as each persona, friends, requests and every group result carried an avatar, and linked friends and own players showed the account's choice. Browser checks are in the plan entry.
- **Development** (`br-little-rain-ay5fufwv`, 2026-10-01, user's go-ahead, applied through the Neon MCP as the owner): 20 statements, no errors. Before: 0001–0014 (with `data/0003`, without 0008), 3 accounts, 23 players, 0 linked players, 0 friendships, 52 games, 72 results, 72 buy-ins, total net 0, no avatar columns. Owner rehearsal in a `DO` block ending in `RAISE EXCEPTION` (fixture: a friendship between "Rajarshi Roy" and "Roy dev", with Rajarshi Roy's most-played guest linked to Roy dev and Roy dev's avatar set to p17): no invalid avatars on accounts or players, 15 different on players; the linked guest showed the friend's choice (stored p04, shown p17), the host's own player the host's choice, and unlinked guests their stored one; as Roy dev, all 72 group results carried an avatar and the linked guest's 14 showed p17, and the friend list showed the host's avatar; as the host, `player_avatars()` returned 9 rows with p17 for the friend and `friend_find` returned p17; `'Bad Id!'` was refused by the check; `menoka_app` can execute `random_avatar`, `player_avatars` and the three friend functions but not `shown_avatar`, and `PUBLIC` can't execute `player_avatars`. As `menoka_app` through `.env.local` (rolled back): a new player got a default avatar and appeared in `player_avatars()`; the app could change a guest's and its own avatar, and its own player then showed the new choice; no other account was visible; `shown_avatar` was refused. After: the same counts as before, no rehearsal rows left, `0015_avatars` recorded.

## Production application

- Date: 2026-09-25
- Branch: `br-small-sea-ayumyssr` (production)
- Applied: 0001, 0002, 0004, 0005, 0006, 0007 and 0008, one transaction each, no errors. `data/0003` is development only.
- After: 7 `app_migrations` rows, 32 unowned games, 15 unowned players, 0 accounts; `menoka_app` and `menoka_purge` not superusers, no `BYPASSRLS`, not in `neon_superuser`.
- Then the claim for Rajarshi returned 27, and standings matched the rehearsal. Details are in the plan's "2026-09-25 multi-user production cutover" entry.
- Later the same day, with the user's go-ahead: 0009 applied in one transaction, no errors. Before: 0001–0008 except 0003, no `live_views`, 1 account, 27 owned games. After: `0009_live_views` recorded, row security on, 0 rows, 27 owned games. The preview branch `br-tiny-forest-ayt6f3fe` got 0009 earlier from the user in the Neon editor.
- 2026-09-30, with the user's go-ahead: 0013 applied in one transaction (26 statements), no errors. Before: 0001–0012 except 0003; accounts Rajarshi (10 players, 27 games, "Rajarshi" `c80e12e5-f014-448d-aad5-aaa97720b596` unlinked with 27 results), Soumyadeep Dhali and Soham (1 linked player each, no games). Then `adopt_self_player('4db9f3e6-9b4b-445b-8ca3-831773acdb3c', 'c80e12e5-…')` returned "set; there was no own player before", and the backfill gave Soumyadeep Dhali and Soham new own players. After: Rajarshi owns "Rajarshi" (27 results) with 10 players, 27 games, 82 results and 2 linked players unchanged; Soumyadeep Dhali and Soham own players under their names (2 players each, 1 linked); every currency INR; `0013_profile` recorded. The code that uses it is not pushed yet.
- 2026-10-01, with the user's go-ahead: 0014 applied in one transaction (4 statements) through the Neon MCP as the owner, no errors. Before: 0001–0013 except 0003, 3 accounts, 2 friendships, 4 linked players, 29 players, 59 games, 82 results, 86 buy-ins, total net 0, no `friend_link_guest`. After: the same counts, `0014_link_guest` recorded, the function is `SECURITY DEFINER`, `menoka_app` can execute it and `PUBLIC` can't. No data was changed. The code that uses it (`2721c36`) is not pushed yet.
- 2026-10-01, with the user's go-ahead: 0015 applied in one transaction (20 statements) through the Neon MCP as the owner, no errors. Before: 0001–0014 except 0003, 3 accounts, 29 players (4 linked), 2 friendships, 59 games, 82 results, 86 buy-ins, total net 0, no avatar columns. After: the same counts, `0015_avatars` recorded; every account and player has a valid avatar (13 different across 29 players); the 14 owned players all show the expected avatar (7 of them, linked friends and own players, show the account's own choice); the 15 unowned legacy players have no owner, so `shown_avatar` returns nothing for them, and the app never shows them; `menoka_app` can execute `random_avatar`, `player_avatars` and the three friend functions, not `shown_avatar`. No game data changed. The code that uses it (`74a5bca`) is not pushed yet.

## 0016 games together

- **Testbed** (`br-young-night-b5xphgw8`, 2026-10-02): applied with a one-off owner script (4 statements), so the running server's `menoka_app` password wasn't reset. Bikram's test game `tb-together-check` (Bikram, Asha, Arjun G.) gave Bikram's list Asha 1 and Arjun G. 1, and Asha's list Bikram 1 through Bikram's group.
- **Development** (`br-little-rain-ay5fufwv`, 2026-10-02, user's go-ahead, through the Neon MCP as the owner): 4 statements in one transaction, no errors. Before and after: 0013–0015 applied, 3 accounts, 23 players, 0 linked, 0 friendships, 52 games, 72 results, total net 0; afterwards `0016_games_together` recorded, the stored body's md5 matches the file (`5cb5d7c9…`), `SECURITY DEFINER`, `menoka_app` can execute and `PUBLIC` can't. No links there, so no data to exercise; behaviour was checked on the testbed and in unit tests.
- **Production** (`br-small-sea-ayumyssr`, 2026-10-02, user's go-ahead): the same 4 statements, no errors. Before and after: 5 accounts, 35 players, 8 linked, 4 friendships, 61 games, 86 results, total net 0; `0016_games_together` recorded, same md5, same grants. A read-only count gave Rahul Basak 12 games together with Rajarshi, all hosted by Rajarshi. No data changed.


## 0017 continue saved games

- **Testbed** (`br-young-night-b5xphgw8`, 2026-10-02): applied by `npm run testbed:setup` (3 statements). That resets the `menoka_app` password, so the testbed server on 3006 was restarted. As Asha, Game 6 (`tb-asha-6`, 95 hands) was continued, one hand played and saved: still 6 games, Game 6 at 96 hands with the new results and buy-ins read back from `session_results`/`buy_in_events`. A retried PUT returned `saved: 0`, a stale `basedOn` 409 and a save with no new hands 400, each changing nothing.
- **Development** (`br-little-rain-ay5fufwv`, 2026-10-02, user's go-ahead, through the Neon MCP as the owner): 3 statements in one transaction, no errors. Before and after: 52 games, 72 results, 72 buy-ins, total net 0; afterwards `0017_continue_saved_games` recorded, `menoka_app` has DELETE (not UPDATE) on both tables.
- **Production** (`br-small-sea-ayumyssr`, 2026-10-02, user's go-ahead): the same 3 statements, no errors. Before and after: 61 games, 86 results, 90 buy-ins, total net 0; same record and grants. No data changed.

## 0018 admin dashboard

- **Testbed** (`br-young-night-b5xphgw8`, 2026-10-02): applied as the owner; the persona Asha added to `app_admins`. Checked in the browser and as `menoka_app`: Asha gets data, Ravi and a request with no session get `admin:forbidden`, `admin_caller` can't be called; removing Asha from `app_admins` turned `/admin` into a 404.
- **Development** (`br-little-rain-ay5fufwv`, 2026-10-02, user's go-ahead, through the Neon MCP as the owner): 32 statements in one transaction, no errors. Before: 0015–0017 applied, no `app_admins`, 3 accounts, 23 players, 52 games (24 owned), 72 results, total net 0, 16 audit events. Owner rehearsal in a `DO` block ending in `RAISE EXCEPTION`: with the first named account as the caller, `admin_overview()` raised `admin:forbidden` before it was an admin; after adding it to `app_admins`, the overview gave 3 accounts (2 named), 8 guests, 2 own players, 24 games, 261 hands and 12 weeks; `admin_accounts()` 3 rows, all with an email; `admin_guests()` 8; `admin_games(300)` 24 games with 72 results summing to 0; `admin_system()` 17 migrations, latest `0018_admin_dashboard`; `admin_account_detail()` for another account returned its (empty) detail and added exactly 1 audit event. After: `menoka_app` can execute the six `admin_*` read functions but not `admin_caller`, `admin_account_row`, `admin_game_row`, `admin_player_kind` or `admin_ms`; `PUBLIC` can execute none; `menoka_app` can't read `app_admins` (row security on); 0 admins, 16 audit events and the same counts as before; `0018_admin_dashboard` recorded.
- **Production** (`br-small-sea-ayumyssr`, 2026-10-02, user's go-ahead, through the Neon MCP as the owner): the same 32 statements in one transaction, no errors. Before and after: 0015–0017 applied, 5 accounts, 35 players, 8 linked, 4 friendships, 61 games, 86 results, total net 0, 19 audit events; afterwards `0018_admin_dashboard` recorded, the same grants as on dev (six read functions for `menoka_app`, no helpers, nothing for `PUBLIC`, no access to `app_admins`). Then, at the user's request, their sign-in `therajarshiroy@gmail.com` (one Auth user, active account "Rajarshi") was added to `app_admins`. A check as that user in a block ending in `RAISE EXCEPTION`: 1 admin; the overview gave 5 accounts, 6 active guests, 29 owned games and 305 hands; `admin_accounts()` 5 rows, `admin_guests()` 7 (one removed), `admin_games(300)` 29. No game data changed. The code that uses it was pushed afterwards, the same day.

## 0019 rebuy rules

- **Testbed** (`br-young-night-b5xphgw8`, 2026-10-02): column added as the owner (first recorded as `0018_rebuy_rules`, renamed to `0019_rebuy_rules` on 2026-10-05 after `0018_admin_dashboard` took the number). Browser check as Bikram: Game 77 saved with `{"maxRebuys": 2, "closeAtBigBlind": 4000}`, read back on the Games card and by Continue game.
- **Development** (`br-little-rain-ay5fufwv`, 2026-10-05, user's go-ahead, through the Neon MCP as the owner): 2 statements in one transaction, no errors. Before and after: 52 games, 72 results, 72 buy-ins, total net 0; afterwards `0019_rebuy_rules` recorded, 0 games with rules, `menoka_app` can select, insert and update the column.
- **Production** (`br-small-sea-ayumyssr`, 2026-10-05, user's go-ahead): the same 2 statements, no errors. Before and after: 62 games, 89 results, 93 buy-ins, total net 0; same record and privileges. No data changed. The code that uses it was pushed afterwards, the same day.

## 0020 cents chip unit

- **Testbed** (`br-young-night-b5xphgw8`, 2026-10-05): applied by `npm run testbed:setup` (8 statements). Browser checks as Asha are in the plan entry "blinds in cents"; two small cents games (7, 8) are saved there.
- **Development** (`br-little-rain-ay5fufwv`, 2026-10-05, user's go-ahead, through the Neon MCP as the owner): 8 statements in one transaction (split with `scripts/split-migration.mjs`), no errors. Before: 0018 and 0019 applied, no `chip_unit` column, 52 games, 72 results, 72 buy-ins, total net 0. After: `0020_cents_chip_unit` recorded, the same counts, all 52 games `whole`, total net 0; `menoka_app` can select and insert the column, can execute `friend_group_sessions()` and `admin_guests()` but not `chip_amount()` (used only inside the `SECURITY DEFINER` functions); `chip_amount(1275, 'cents')` = 12.75, `chip_amount(20, 'whole')` = 20.
- **Production** (`br-small-sea-ayumyssr`, 2026-10-05): applied by the user in the Neon SQL editor (the agent's production access was blocked by its permission check). Checked afterwards by the agent, read only: `0020_cents_chip_unit` recorded; 62 games, all `whole`; 89 results, 93 buy-ins, total net 0 (the same as before 0019's release); `menoka_app` can insert the column; `friend_group_sessions()` returns `chipUnit` and `admin_guests()` uses `chip_amount`. The code (`261801b`) was pushed afterwards.
