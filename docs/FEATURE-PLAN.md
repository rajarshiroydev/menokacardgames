# Feature plan: accounts and normalized standings

Updated: 2026-09-24. Status: implementation in progress on `feature/multi-user-transition`; production unchanged.

This is the canonical living feature-planning document. Add future feature plans here, record decisions and acceptance criteria, and update status as work progresses. Detailed designs may be linked from here; avoid competing roadmaps.

## Confirmed decisions

- Work from `main`. Pause design work; preserve `ui-sporty-glass-refresh` at `826142f`.
- Each signed-in host owns a separate friend list, sessions and leaderboard.
- Friends are player names/profiles managed by the host. They do not need accounts.
- No groups, invitations, shared memberships, or friend-account claiming in the initial release. The same person in two hosts' lists has two independent profiles and histories.
- Use average session return percentage, including all buy-ins, with the supporting session count shown for context.
- Implement the transition one reviewed step at a time and report after each step. Push only when requested.
- Use Neon Managed Better Auth with email magic links only for the initial login flow. Password and social login are out of the initial scope.
- Account deletion immediately locks the ledger, hides it from normal access and signs the host out. Recovery is available for 30 days, followed by permanent automated deletion of the account and all owned application data. Provider backups age out under the provider's documented retention schedule.

## Baseline behavior verified at planning start

The app uses Next.js 16, React 19, Vercel and Neon Postgres. `components/poker-ledger.tsx` combines UI and orchestration. `lib/poker/game.ts` contains game rules and leaderboard calculations. `schema.sql` defines global players and poker sessions; route handlers in `app/api/players` and `app/api/sessions` access them.

- Player names are globally unique by normalized name. IDs identify players, not authenticated users.
- Reads, saves/imports, discard and restore have no account authorization. Permanent deletion uses a shared server password. Adding a login screen alone will not isolate data.
- Saved result JSON includes player ID, name, ending chips, net and optional buy-in history. Session-level data includes starting stack, hand count and blind history. `ante` currently means big blind.
- `buildLeaderboard` sorts by sum of raw net results. Its `wins` counter means profitable sessions, not hands won. The graph also accumulates raw chip results.
- Active games use unscoped browser local storage. History refresh can automatically upload legacy history from another unscoped key. Account migration must handle this explicitly.
- Session numbers are global, and the API returns the full ledger. A route can add a missing database column at request time; replace this with versioned migrations.
- Validation checks net against investment when buy-in history exists, but does not fully enforce whole-session chip conservation or distinct participants.

The screenshots show the scale problem, not verified ownership or original investment. No production database inspection was performed for this plan. Never assign historical sessions by guessing from names or chip amounts.

## Product model and initial scope

One host signs in, adds friends to their list, creates games from that list, records actions as today, and saves results to their private history. The account itself need not be a participant. The host may add their own player profile if they play. Two hosts can independently have a player called Rajarshi without collisions or access to each other's results.

An account owns exactly one private ledger initially. Do not add unnecessary group switching, invitations, participant login or collaboration. Future sharing is a separate feature with explicit authorization and migration design.

Keep existing seating, blinds, bets, all-in behavior, rebuys, confirmations, undo and save flows. Account onboarding and explicit handling of old drafts are the necessary new steps. The first release has one recording device per active session; live collaborative editing and cloud draft handoff are deferred.

## Architecture

Retain the existing Next.js application and Postgres backend as a modular application. Separate identity, owner-scoped repositories, session operations and analytics from the UI. Keep poker calculations independent of browser and database access so a future mobile client can reuse them. No microservices or native rewrite is needed now.

### Identity and authorization

Use Neon Managed Better Auth rather than custom password cryptography. The initial login method is email magic link only. The implementation must support secure web sessions, logout, session revocation, account deletion and export; native callbacks remain a later mobile-distribution concern. Development Auth and test users live on an isolated Neon branch until the owner-scoped model has passed its isolation gates.

Derive owner identity from a server-verified session for every endpoint. Filter every read/write by that owner, including lookups, imports, exports, analytics, discard, restore and deletion. Never trust client-supplied `owner_id`, player ID, session ID or cached state as authorization. Unknown/foreign IDs should return consistent not-found responses without revealing another account's data.

Use centralized authorization and Postgres row-level security as defense in depth. Application connections must use a restricted role; table owners and BYPASSRLS roles can bypass policies. Derive owner context from verified identity, set it transaction-locally and test connection reuse. Separate migration credentials from runtime credentials. Keep DB access behind server APIs.

Use secure cookie sessions for the web with appropriate CSRF/origin checks, rate limits on auth/import/mutations, bounded request sizes, redacted logs and safe error messages. Permanent deletion uses ownership checks and recent reauthentication instead of a shared password (Step 3J): the verified session must have been created by a magic link within the last 10 minutes. Preserve user confirmations. Logout clears private in-memory data; define how unsynced drafts are retained safely before clearing caches.

Magic links return through the app-owned `/auth/callback` endpoint. That endpoint accepts only the provider's one-time verifier, exchanges it server-side through the Neon Auth proxy and forwards only the resulting secure cookies before redirecting to the ledger. It must never log verifier or session values. Keep callback and replay/failure cases in the browser acceptance suite. The callback removes existing session cookies before the exchange. With them present, the SDK answers from its session cache and never exchanges the verifier, so a link used while signed in would not create a fresh session.

Account deletion uses an explicit lifecycle state and `deletion_requested_at`. The initial request revokes active sessions, blocks reads and mutations, and removes the ledger from ordinary UI immediately. A reauthenticated host can cancel during the 30-day grace period. An idempotent scheduled purge deletes owner-scoped records and the Auth identity after the deadline, with auditable status and retry handling. Define purge ordering, failed-job alerts and the exact Neon backup retention disclosure before implementation; backup copies expire through Neon retention rather than direct row-level deletion.

### Proposed data model

This is conceptual, not executable SQL.

| Record | Essential fields and constraints |
| --- | --- |
| accounts | Internal stable ID, unique provider/subject, minimal profile, lifecycle state |
| players | Owner ID, player ID, display name, normalized name unique within owner, archive state |
| sessions | Owner ID, stable ID, owner-local display number, timestamps, rule/schema version, revision, status, provenance |
| session_results | Owner + session + player, historical name snapshot, invested total, ending chips, derived net, eligibility/quality state |
| buy_in_events | Owner + session + player, sequence, initial/rebuy kind, amount, unique event ID |
| audit_events | Owner, actor, action, target, timestamp, revision reference; exclude secrets |
| migration_mapping | Original record IDs, target owner/player/session, review status and provenance |

Use composite foreign keys/uniqueness to prevent a session result referencing another owner's player. Players retain identity across renames and archival. Session numbering is cosmetic and allocated atomically per owner; stable IDs are the deduplication identity. Do not migrate by name alone.

Normalize results and buy-ins into relational records to enforce ownership and support reliable analytics. Preserve original JSON during migration/reconciliation. After cutover, choose one authoritative representation; avoid independently mutable JSON and relational copies. Future uneven investments or alternate rebuy rules require explicit versions; the present halving rule stays unchanged.

### APIs, persistence and scale

- Versioned typed request/response contracts with server validation. Idempotency keys scoped to owner for save/import: matching retries return the original result; conflicting payloads return a conflict.
- Transactional session/result/buy-in writes; revision checks for corrections. Define import as atomic within a bounded batch, with actionable validation errors.
- Imports never assign ownership from the file or silently attach foreign player IDs. Preview mappings into the authenticated owner's directory. Export only that owner's records, with schema/provenance version. Round-trip import must not duplicate sessions.
- Paginate session history independently of analytics. The chart and ranking must use all history in the selected period, not only the five visible games or current page. Cache keys include owner, data revision, metric version and filters.
- Browser drafts must be keyed by owner + session + schema version. Legacy drafts/history are unowned until the host explicitly reviews and adopts them. Disable automatic legacy uploads before account cutover.
- Initially preserve browser-local active games and retry-safe final saves. Clearly distinguish pending versus saved. Do not claim cloud recovery of a draft before it exists. Later cloud checkpoints require version conflict handling, account-scoped storage and multi-device ownership rules.
- Use isolated dev/staging databases. Adopt reviewed versioned migrations; evaluate Drizzle for schema/migration management, without forcing an unrelated full database-driver rewrite. Remove request-time DDL.

## Ranking: average session return

For each eligible completed session a player actually played:

```
I = initial buy-in + every rebuy
P = ending chips - I
R = 100 * P / I, for I > 0
Ranking score = arithmetic mean of that player's eligible R values
```

Examples:

| Invested | Ending chips | Session return |
| --- | --- | --- |
| 10,000 | 15,000 | +50% |
| 1,000,000 | 1,500,000 | +50% |
| 10,000 + 5,000 rebuy | 18,000 | +20% |
| 10,000 + 5,000 rebuy | 0 | −100% |

A player with +50% and −20% sessions scores +15%. Each session counts equally. Multiplying all amounts in any session by a common positive factor leaves its return and the mean unchanged, provided amounts remain exact and representable. Integer rounding in halved rebuys can alter scaled game paths; do not modify history to manufacture scale equivalence.

Why not total profit / total investment? That weighted ROI lets large nominal sessions dominate: +50% on 10k and −20% on 1m produces approximately −19.31%, whereas equal-session average gives +15%. Retain weighted ROI only as optional accounting information, not the default rank.

Why not Elo, finish percentile, or big blinds per 100 hands? Elo needs a defensible multiplayer outcome model and comparable opponents. Percentile discards result magnitude and changes with table size. BB/100 requires reliable per-player exposure and blind-level results not available in existing saved history. Median return is robust to outliers but hides exceptional performance. Average return is understandable, uses available buy-in data, and addresses nominal scale directly.

This is a performance summary, not a universal skill rating. It does not normalize opponents, session length, table size or luck. It can be gamed by fabricating/splitting sessions or selectively stopping play. Private host-controlled history, audited corrections and clear sample sizes are appropriate for this casual ledger; public competitive rankings would need a new design.

### Presentation and eligibility

- Rank by unrounded average session return; display two decimal places. Identical underlying scores share rank; use stable ID only for display ordering within ties.
- Rank every player from their first eligible session without a provisional label or minimum-session threshold. Always show the eligible session count beside the score so readers can judge how much history supports it.
- Show eligible/total sessions, hands, total invested, raw net and profitable-session rate as supporting stats. Every supporting stat and the raw-chip graph cover eligible sessions only, so they always describe the same games. Each excluded session is listed on the player's row with its reason. Use “profitable sessions,” not “hands won.” Do not imply chip units are real-money transactions.
- Default graph: running average return (%) against the owner's chronological sessions. A player's series starts at their first eligible session. Absence does not add a zero return; thereafter carry forward the previous mean. Mark actual score changes and show session return, running mean and sample count in tooltips.
- Keep raw-chip results available as an optional graph/accounting view. A sum of session percentage points is not cumulative ROI. Do not compound returns from independent sessions as a reinvested portfolio.
- Discard excludes a session; restore/correction deterministically recalculates both ranking and graph. Version the formula for future changes.
- Zero/unknown investment gives an unranked result with a reason, never division by zero or a fabricated denominator. No eligible sessions means no score, not 0%.

### Integrity and historical eligibility

New saves require distinct players, valid dates, nonnegative ending stacks, valid investment events and net derived server-side. Under current rules (no fees or cash-outs), sum of ending chips equals sum of invested chips and total net equals zero. Future fees/cash-outs must be modeled explicitly.

Guard intermediate sums, not just input integers. Postgres bigint exceeds JavaScript safe-number precision: either define and enforce bounds end-to-end or transport decimal strings and compute with BigInt/exact decimals. Percentages are calculated without early rounding and rounded only for display.

Legacy data without buy-in history is eligible using starting stack only when ending − net equals starting stack and other integrity checks support it. Otherwise retain it for historical review and flag it as unverified. An inferred investment of ending − net is evidence, not automatically verified buy-in history. Do not silently repair or drop invalid records. Document eligibility decisions in the migration report.

## Legacy migration and release sequence

The current isolated-branch inventory, review cohorts and ownership decisions are recorded in [`docs/HISTORICAL-OWNERSHIP.md`](./HISTORICAL-OWNERSHIP.md). That manifest is the source for explicit user ownership decisions; it is not authorization to backfill production.

1. **Inventory and backup:** obtain authorized read-only production inventory, record counts/totals/discard states and validation failures, back up and test restore. No such production operation is authorized by this planning task. Rehearse on an isolated staging database or Neon branch.
2. **Ownership mapping:** review actual sessions with the original host and other hosts. Assign each session to exactly one account using an explicit manifest. Do not guess from Emon's name, stakes or overlapping players. Unresolved records enter a restricted legacy archive; no public fallback ledger. If old shared sessions are wanted by two accounts, define deliberate copy/provenance semantics later rather than silently duplicating them.
3. **Identity and isolation:** select provider, build account onboarding and owner-scoped repositories/schema, and test every operation with two independent accounts before UI integration.
4. **Expand and backfill:** add new structures compatibly, backfill in restartable batches with explicit ID maps. Reconcile each source session/player/result, investments, chip totals and discard states. Preserve source records until verification and retention policy permit cleanup.
5. **Cutover:** announce a short read-only maintenance window, preserve active drafts, take final backup/delta, migrate and deploy authenticated APIs/client together. Enforce ownership constraints, close old global APIs and disable auto-upload. Stale clients receive an upgrade/sign-in response. Never expose private records through legacy endpoints during transition.
6. **Pilot:** original host plus an unrelated host verify independent friend lists, different chip scales, save retry, import/export, discard/restore, logout and draft adoption. Compare normalized scores against reviewed fixtures before enabling them broadly.
7. **Stabilize:** monitor save failures, authorization errors and latency; exercise restoration and deletion workflows; then remove legacy paths after reconciliation and the agreed retention period.

Rollback must keep global APIs closed. Use authenticated read-only mode if necessary. Capture writes since cutover before restoring, reconcile them and preserve ownership mappings. A blind backup restore would lose new sessions and could undo privacy boundaries.

## Engineering acceptance gates

- Two accounts cannot read, mutate, import into, export, or query analytics for each other's data, even with guessed IDs. Test all HTTP verbs, forged ownership, caches, inactive/deleted accounts, database roles and pooled connection reuse.
- Retried/concurrent saves create one session; same key with different payload conflicts. Batch import rolls back on invalid input. No cross-owner player links or name-based accidental merges.
- Ranking fixtures cover 10k/1m equivalence, rebuys, bust, tie, absent players, single-session rankings, discard/restore, zero/unknown investment, overflows, duplicate participants and inconsistent legacy records.
- Migration rehearsal maps or quarantines every source record exactly once, reconciles amounts and can run repeatedly without duplicates. Restore rehearsal accounts for post-cutover writes.
- Existing poker tests and manual flows remain valid: seating, blinds, bets, all-in runout, undo, back-to-between-hands, buy-in confirmation and final save.
- CI: lint, type checks, unit/integration tests and production build. Browser verification on phone/tablet/desktop, keyboard focus, loading/error states and network interruption. Test data stays isolated from production.

## Mobile distribution readiness

Keep game rules and API contracts portable. Decide responsive web/PWA, wrapper or React Native/Expo only after account isolation is stable; native distribution is a separate future feature and store approval is not promised.

Plan auth deep links, revocation, secure native credential storage, offline feedback, accessible controls, account export and deletion. For this single-owner model, define deletion of the host's entire ledger and associated identifiers, a documented backup retention window, and recovery/grace-period policy. Do not retain deleted data indefinitely by default.

Before store release recheck current rules for login, account deletion, privacy disclosures, minimum app quality and gambling-related classification. The deletion UI must expose both immediate lockout and the 30-day recovery deadline, and the privacy policy must state the then-current provider backup retention schedule. This is a chip ledger. Payments, payouts or gambling services would require separate product decisions and review; this plan does not add them.

## References

Official sources checked 2026-09-20; recheck during implementation/release:

- [Postgres row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html): policies and owner/BYPASSRLS exceptions inform the restricted application-role design.
- [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/): release-time privacy, login, deletion and category requirements.
- [Google Play account deletion](https://support.google.com/googleplay/android-developer/answer/13327111): account deletion pathways must be included in mobile planning.

## Pending choices and future feature register

| Item | Status / next step |
| --- | --- |
| Host-owned accounts, guest friends | Confirmed by user; no invitations or groups in initial scope |
| Average session return | Explicitly confirmed by user |
| Ranking eligibility | Confirmed: rank from the first eligible session, with no provisional label; show session count |
| Login methods/provider | Confirmed: Neon Managed Better Auth with email magic links only |
| Historical session ownership | A–G and J–L rehearsed into Rajarshi's isolated ledger; M belongs to a separate Emon-led group; H–I and the Emon group host account remain unresolved. No production backfill |
| Account deletion/backup retention | Confirmed: immediate lock/hide/sign-out, 30-day recovery, then automated permanent purge. Request, lock and recovery built in Step 3K. The disclosure uses Neon's current 6-hour history retention (free plan, `history_retention_seconds` 21600); recheck if the plan changes. Purge (Step 3L) pending decisions below |
| Purge job decisions (Step 3L) | Decided 2026-09-24: daily Vercel Cron calling a `CRON_SECRET`-protected endpoint; a Neon project-scoped API key, stored only in Vercel production, calls the documented delete-user endpoint for the branch; Healthchecks.io monitors each run and emails on failure or a missed run. The purge also gets its own database credential, separate from `menoka_app`. Ordering (mark `purging`, delete owned rows, delete the Auth identity, record the outcome) and retries are defined during implementation |
| Multi-user transition | In progress on `feature/multi-user-transition`; Steps 3K–3L account deletion (request, 30-day recovery and daily automated purge) complete on the isolated branch; production setup follows the purge go-live checklist |
| Sporty glass design | Paused on `ui-sporty-glass-refresh` |
| Recent sign-in window for permanent deletion | Kept at 10 minutes by user decision (2026-09-24). Revisit if real use shows it is too strict or too loose; longer windows are a one-line change |
| Magic-link verifier in request logs | `next dev` request logging prints the one-time `/auth/callback` verifier. Before release, confirm production/Vercel request logs do not retain it, or redact it |
| Cloud draft sync / device handoff | Deferred; needs conflict policy |
| Shared ledgers/invitations | Out of initial scope; add only if requested |
| App Store / Play Store | Future separate plan after web stability |

## Decision history and planning convention

2026-09-20: User requested switch to main and documentation-only transition plan. Repository inspected. Initial private-group recommendation was superseded by the user's clarification: one orchestrating account owns a friend list and games; friends need no account or invitation. User delegated ranking choice. Average session return selected with stated limitations. No implementation or production data changes.

For each future feature, add: date, problem, accepted behavior, non-goals, architecture choices and tradeoffs, migration impact, acceptance criteria, open questions and status. Keep user decisions distinct from recommendations; update this document when scope changes.

2026-09-20 follow-up: User explicitly confirmed host-owned accounts with guest friends and average session return. Rank all eligible players immediately; do not use a provisional label. Neon Auth requested as preferred identity direction. Ask user about historical ownership during data separation, and revisit deletion/retention alongside login migration. Ask remaining architecture questions when relevant. Neon handles identity, while owner access rules still need explicit server checks and database policies. Reference: https://neon.com/docs/auth/overview.

2026-09-20 implementation step 1: Created `feature/multi-user-transition`. Removed the provisional threshold from the planned ranking. Verified Neon MCP is installed and enabled in Codex. Installed project-scoped Next.js DevTools MCP in `.codex/config.toml`. No application, database, auth, or production data changes in this step.

2026-09-20 implementation step 2: Confirmed email magic links as the sole initial login method. Authenticated Neon MCP and created the isolated Neon branch `multi-user-auth` from production. Provisioned Managed Better Auth there and enabled Magic Link with a five-minute expiry and new-user registration. Configured the local app to use the branch's database/Auth endpoints, added a custom magic-link sign-in screen, secure cookie session handling, logout, auth proxy and server-side API session checks. Verified the provider configuration from `neon_auth.project_config`, unauthenticated API rejection and the complete email-link-to-authenticated-ledger flow with the user's test address. The app-owned callback performs the one-time verifier exchange before setting session cookies. Production remains unchanged and the branch is not deployable until Step 3 scopes every data operation by owner. Patched Next.js to 16.3.5 for the current critical advisory.

2026-09-20 lifecycle decision: User approved immediate account lock/hide/sign-out on deletion request, a 30-day recovery grace period, and automated permanent purge afterward. Provider backup copies age out on the documented provider schedule. Implementation must include revocation, reauthenticated recovery, idempotent purge, audit state, failed-job handling and release-time disclosure of the current backup schedule.

2026-09-20 implementation step 3A: Queried only the isolated `multi-user-auth` branch and recorded a read-only inventory of 28 sessions and 13 players in `docs/HISTORICAL-OWNERSHIP.md`. Grouped adjacent sessions into 13 review cohorts without assigning ownership. No schema, data or production mutation was performed. Owner mapping is required before the backfill design can be finalized.

2026-09-20 ownership review: User assigned cohorts A–G and J–L to Rajarshi's ledger and cohort M to a separate Emon-led friend group. Abhirup intentionally belongs to both friend lists and must have an independent owner-local profile in each ledger. Cohorts H–I and players Aiush, Ashit and Rana remain unresolved. Ratan is confirmed for Rajarshi's friend list but has no historical database record. The eventual host account for the Emon-led group is not yet known. No backfill is authorized while these decisions remain incomplete.

2026-09-20 implementation step 3B: Added the versioned, expand-only `0001_owner_scope_foundation` migration and rehearsed it on the isolated `multi-user-auth` Neon branch. It introduces account lifecycle records, nullable owner keys, owner-local indexes, migration provenance and audit foundations while preserving compatibility with the global API. Reconciliation retained all 13 players and 28 sessions; zero historical rows were assigned and zero application accounts were fabricated. Evidence is in `docs/MIGRATION-REHEARSALS.md`. Row-level security, global-constraint removal, route cutover and historical backfill remain later coordinated steps.

2026-09-20 implementation step 3C: Added a server-only account data layer that provisions one internal account from the verified Neon Auth UUID, never from email or client input. All poker APIs now pass through the active-account lifecycle gate, and a minimal no-store account endpoint exposes only lifecycle status. The signed-in local browser provisioned exactly one active account linked to the isolated branch's Auth user; historical ownership remained zero players and zero sessions. This is an authentication/lifecycle boundary only: player and session queries remain global until they are switched together in the next reviewed step, so this branch is still not deployable.

2026-09-20 implementation step 3D: Applied `0002_owner_scoped_keys` to the isolated branch and switched every player/session API operation to the verified internal account ID. Player names, client session IDs and display numbers are now account-local. Session-number allocation uses a per-owner counter and transaction advisory lock so an idempotent retry does not create a duplicate or consume another number. Removed request-time DDL. A two-account database rehearsal verified same-name players, same client IDs, scoped mutations and retry behavior, then removed all fixtures. The signed-in browser now sees an empty private ledger rather than the 13 unowned players and 28 unowned sessions. Historical backfill is next; RLS and restricted runtime credentials remain required before deployment.

2026-09-21 implementation step 3E: Added a parameterized, restartable data migration and cloned only the explicitly approved cohorts A–G and J–L into Rajarshi's isolated private ledger. Created nine owner-local friend profiles including history-free Ratan, copied 24 sessions and 72 results, replaced player IDs with owner-local IDs, recorded eight player and 24 session provenance mappings, and set the next local game number to 25. Full field/result reconciliation passed and an idempotent rerun produced no duplicates. All 13 legacy players and 28 legacy sessions remain intact; H–I and M remain unowned. Browser verification showed the expected private list, standings and history. Production remains unchanged.

2026-09-21 implementation step 3F: Added transaction-local verified-user context to all application database operations and enabled Postgres row-level security for accounts, players, sessions, migration mappings and audit records. The app now uses a least-privilege SQL-created `menoka_app` role; it has no administrative or `BYPASSRLS` capability and cannot read the migration ledger. A real two-account rehearsal verified blocked foreign reads, updates and inserts and confirmed that context is cleared across pooled HTTP connection reuse. After test cleanup, the restricted local browser loaded the expected nine players and 24 sessions. Production remains unchanged. Next: key active-game and legacy browser storage by account, disable automatic unowned uploads and define an explicit adoption flow.

2026-09-21 implementation step 3G: Active games in browser storage are now keyed by the verified internal account ID, so switching accounts on one device cannot load another host's draft. The old global active-game and history keys remain unassigned and are never uploaded during page load. When legacy data exists, the home screen explains its status: an unfinished game can be explicitly adopted only when the account has no current game, while saved sessions open a review dialog where the host checks individual sessions after seeing their date, stakes and players. Only checked sessions are mapped into the current account; unchecked sessions remain unassigned on the device. The unused privileged rehearsal role was deleted with user approval. Production remains unchanged. Next: normalize session results and buy-in events, derive accounting values on the server and add integrity constraints needed by percentage rankings.

2026-09-21 implementation step 3H: Added owner-bound `session_results` and ordered `buy_in_events` records and rehearsed the backfill on the isolated Neon branch. All 24 owned sessions became 72 verified relational results and 72 buy-in events with zero player, event, snapshot or whole-session balance mismatches. Reads now use the relational records; the old JSON is retained only as an immutable compatibility snapshot. New saves validate distinct participants and chip conservation, derive investment and net relationships on the server, and insert the session, results and buy-ins atomically. A restricted-role smoke test saved one temporary game, verified an idempotent retry saved zero duplicates and consumed no second number, then removed every fixture. That test also caught and fixed an account-deletion ordering issue by deferring the player-history foreign-key check until transaction end. Runtime access to accounting tables is limited to select and insert. The local browser still shows 9 players and 24 sessions. Production remains unchanged. Next: replace raw-chip ranking and its default graph with average session return while retaining raw chips as supporting information.

2026-09-24 implementation step 3I: Added the pure `lib/poker/standings.ts` module (metric version 1) and removed the raw-chip `buildLeaderboard`. Players are ranked by the unrounded arithmetic mean of eligible session returns, `100 × (ending − invested) / invested`, including every rebuy. Each session is weighted equally. Returns are computed as one exact-integer division where possible, and summed in sorted order so identical sets of returns tie exactly. Tied scores share a competition rank and are ordered by stable player key. A session is eligible for a player only when `deriveSessionAccounting` verifies the whole session (distinct participants, net matching investment, balanced chips, safe totals) and the player's investment is positive. Otherwise the result is recorded with the reason `unverified-accounting` or `no-investment`. A player with no eligible session gets no score and is listed as unranked after ranked players, never at 0%. Raw net and the profitable-session count cover every recorded session; total invested covers eligible sessions. The standings row shows the score to two decimals with the eligible session count, plus ranked/total sessions, profitable sessions and rate, invested, and raw net in chips. Standings and graph no longer show ₹; game screens and session cards are unchanged. The default graph plots each player's running average from their first eligible session, carries it forward through absences, marks only score changes, and shows session return, running mean and sample count in tooltips. A Raw Chips toggle keeps the cumulative chip view. The graph palette grew from six to eight colours so the current eight ranked players are distinct. Seventeen new tests cover the ranking fixture list; the two legacy leaderboard tests moved into the new suite. Browser verification on the isolated branch at phone, tablet and desktop widths showed 8 ranked players over 24 sessions, both graph views and correct running means, with no horizontal overflow or console errors. The local preview configuration now uses port 3005. No database or production change.

2026-09-24 step 3I follow-up: At the user's request, the per-player hands count is back in the standings. It is the sum of each recorded session's hand count, not hands the player was individually dealt. The standings row was rebuilt for phones: rank, name and score (with the ranked session count) sit on one line, and five labelled stats (ranked/total, hands, profitable, invested, net chips) sit in a grid below. The grid shows three columns on phones, one row of five on tablet and desktop, and two columns at 320px. Verified at 320px, 375px, 768px and desktop with no clipped values or horizontal overflow.

2026-09-24 eligibility decision: The user asked for the most maintainable, easiest-to-debug option. A starting stack must now be at least 1 in both the setup screen and server validation, so the app can no longer save a zero-investment session. `no-investment` stays as a safety net for older or imported data. Hands, profitable sessions, invested, net chips and the raw-chip graph now cover eligible sessions only, instead of mixing eligible and all recorded sessions. The ranked/total count shows what was left out, and each excluded session is listed on the row with a plain-language reason. No current data is affected: all 24 sessions are eligible. A database CHECK on `sessions.starting_stack >= 1` would add defence in depth but needs its own versioned migration and rehearsal; it is optional because the runtime role can only insert through the validated API.

2026-09-24 implementation step 3J: User chose a time window for reauthentication (option A). Removed the shared `DELETE_PASSWORD` check, its header and dialog field, the `passwordMatches` helper and its environment variable. Permanent player and session deletion now call `requireRecentHostAccount`: it requires an active account, as before, and a verified Neon Auth session whose `createdAt` is within 10 minutes, allowing 60 seconds of clock skew. The rule lives in the pure `lib/auth/recent-sign-in.ts` and has unit tests. Otherwise the API returns 403 with code `recent-sign-in-required`, and the UI offers to email a fresh magic link to the signed-in address. The existing ownership, discard-first and saved-history rules and the SQL owner predicates are unchanged. Browser verification on the isolated branch with a 22-minute-old session: both DELETE endpoints returned 403 with the new code, and an old password header had no effect. A discarded throwaway player could not be deleted until a fresh link was used, and the dialog shows the email exactly as entered. Testing exposed an earlier callback bug: a link used while already signed in was answered from the SDK session cache and never exchanged, so the session stayed old. `/auth/callback` now strips existing Neon Auth session cookies before the exchange (`lib/auth/session-cookies.ts`, unit tested). After that fix, a fresh link produced a 9-second-old session and the throwaway player was permanently deleted, leaving 9 players and no discarded players. The README and `.env.example` were rewritten for the authenticated app, the stale `bun.lock` and unused helpers were removed, and `npm run dev` now serves on port 3005. Production and Vercel environment variables are unchanged; remove `DELETE_PASSWORD` from Vercel at cutover.

2026-09-24 implementation step 3K: The user asked to start the account deletion lifecycle. It was split so the request, lock and recovery could be built without the purge decisions. Migration `0006_account_deletion_requests` grants the runtime role SELECT/INSERT on `audit_events`, limited by row policy to its own account and its own actor ID. It also adds the `accounts_guard_lifecycle` trigger: for `menoka_app` it allows only active → deletion requested, stamping the database's `now()` and ignoring any supplied time, and deletion requested → active within 30 days. It rejects backdating and any move to `purging`. `POST /api/account` handles `request-deletion` (active account and a sign-in within 10 minutes) and `recover` (within the grace period, recent sign-in). A request locks the account in the database first, writes an audit event, revokes every Neon Auth session and signs out; revocation failure is logged and cannot reopen the ledger because every ledger API still checks the lifecycle state. Locked accounts get a "Deletion is scheduled" screen with the request time, the exact deadline and a Recover button; the sign-in page confirms the lock after a request. The confirmation discloses the 30-day window and Neon's 6-hour history retention. Rehearsal: twelve checks ran as `menoka_app` inside a rolled-back transaction and all passed, with zero fixtures left. The browser round trip on the isolated branch locked the real dev account, confirmed zero live Auth sessions and 401 ledger APIs, showed the 24 September → 24 October deadline after sign-in, recovered it to 9 players, 24 sessions and 72 results, and recorded `account.deletion_requested → account.deletion_cancelled`. Signing in with a second email during the test created a separate, empty active account, which is kept as a second host for isolation tests. Production unchanged. This version must not be released until Step 3L purges accounts after the deadline.

2026-09-24 purge decisions: The user chose the recommended option in each case. Scheduler: Vercel Cron, daily; the free plan allows one run a day within the scheduled hour, which is adequate for a 30-day deadline. GitHub Actions was rejected because the repository is public and GitHub disables schedules there after 60 days without activity. Auth identity: Neon's documented `DELETE /projects/{project_id}/branches/{branch_id}/auth/users/{auth_user_id}` with a project-scoped API key (Editor access to this project only). Direct SQL on `neon_auth` was rejected as undocumented, and keeping the identity as incomplete deletion. Alerts: Healthchecks.io, because it also catches a job that silently stops running. The user will create the API key, the Healthchecks.io check and the Vercel secrets; agents never handle those values.

2026-09-24 implementation step 3L: Built the automated purge using the recorded decisions. Migration `0007_account_purge` requires an SQL-created, unprivileged `menoka_purge` login with no table privileges, only `EXECUTE` on five `SECURITY DEFINER` functions:
- claim accounts more than 30 days past their request (move to `purging`) and return every unfinished purge
- check whether a Neon Auth user still exists
- record that the identity was deleted
- delete a claimed account whose identity is gone, cascading to everything it owns
- record a failure

Progress lives in `account_purges`, which has no foreign key so it outlives the account; the Auth user ID is cleared on completion. The pure `lib/accounts/purge.ts` runs each account in order: delete the Auth identity through Neon's branch endpoint, confirm in the database that it is gone (no reliance on the provider's status code), then delete the data. A failure stops that account at that step, is recorded, and is resumed the next day without blocking other accounts. Runs handle at most 10 accounts, to stay inside the 60-second function limit. `GET /api/cron/purge-accounts` accepts only `Authorization: Bearer $CRON_SECRET`, compared in constant time. It reports start/success/fail to Healthchecks.io with counts, internal account IDs and errors only, and returns 500 when any account fails. `vercel.json` schedules it daily at 03:00 UTC.

Rehearsal on the isolated branch:
- **Purge login:** passed 10 permission probes (function calls only; no table, purge log or `neon_auth` access; no direct deletes).
- **Endpoint:** returned 401 without the secret or with a wrong one.
- **Overdue fixture:** a Neon Auth user, an account 31 days past its request, a player and an audit event were purged in one run. The Auth user, sessions, account, player and audit rows are all gone, and the purge log shows completion after 1 attempt with no error.
- **Idempotency:** a second run found nothing due.
- **Your data:** 9 players, 24 sessions and 72 results untouched.
- **Healthchecks.io:** pings sent without errors.

Neon's console cannot reset the password of an SQL-created role that has none, so the role first gets a random in-database password nobody sees, then a reset (see `migrations/README.md`). Production unchanged.

### Purge go-live checklist (production, requires separate authorization)

1. Apply migrations `0006` and `0007` to production after the rest of the transition cutover, creating `menoka_purge` with SQL and initialising its password as documented.
2. Create a production-only Healthchecks.io check (1-day period, 2-hour grace) and a production `CRON_SECRET`.
3. In Vercel production, set `PURGE_DATABASE_URL`, `NEON_API_KEY` (project-scoped), `NEON_PROJECT_ID`, `NEON_AUTH_BRANCH_ID` (the production branch), `CRON_SECRET` and `HEALTHCHECKS_PING_URL`. Remove `DELETE_PASSWORD`.
4. After deploy, trigger the cron once from Vercel and confirm a green Healthchecks.io ping.
