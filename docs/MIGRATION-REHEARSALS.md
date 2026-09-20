# Migration rehearsals

This log records database migration evidence. It does not authorize production changes.

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
