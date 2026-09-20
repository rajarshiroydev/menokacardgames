# Feature plan: accounts and normalized standings

Updated: 2026-09-20. Status: planning complete; implementation not authorized.

This is the canonical living feature-planning document. Add future feature plans here, record decisions and acceptance criteria, and update status as work progresses. Detailed designs may be linked from here; avoid competing roadmaps.

## Confirmed decisions

- Work from `main`. Pause design work; preserve `ui-sporty-glass-refresh` at `826142f`.
- Each signed-in host owns a separate friend list, sessions and leaderboard.
- Friends are player names/profiles managed by the host. They do not need accounts.
- No groups, invitations, shared memberships, or friend-account claiming in the initial release. The same person in two hosts' lists has two independent profiles and histories.
- Use average session return percentage, including all buy-ins, with the supporting session count shown for context.
- This task is documentation only. No application, database or deployment changes. Push only when requested.

## Current behavior verified from source

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

Use a maintained identity provider/library rather than custom password cryptography. Before implementation, run a short provider evaluation: verified email login and recovery, Google/Apple options, native callbacks, session revocation, account deletion, export, pricing at expected usage, and deployment isolation. Existing Neon integration makes its auth offering a candidate; Neon Auth is now the preferred provider direction requested by the user, subject to checking compatibility with this project; exact login methods remain pending discussion during the transition. Do not provision anything during planning.

Derive owner identity from a server-verified session for every endpoint. Filter every read/write by that owner, including lookups, imports, exports, analytics, discard, restore and deletion. Never trust client-supplied `owner_id`, player ID, session ID or cached state as authorization. Unknown/foreign IDs should return consistent not-found responses without revealing another account's data.

Use centralized authorization and Postgres row-level security as defense in depth. Application connections must use a restricted role; table owners and BYPASSRLS roles can bypass policies. Derive owner context from verified identity, set it transaction-locally and test connection reuse. Separate migration credentials from runtime credentials. Keep DB access behind server APIs.

Use secure cookie sessions for the web with appropriate CSRF/origin checks, rate limits on auth/import/mutations, bounded request sizes, redacted logs and safe error messages. Replace the shared deletion password with ownership checks and recent reauthentication for permanent deletion. Preserve user confirmations. Logout clears private in-memory data; define how unsynced drafts are retained safely before clearing caches.

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
- Show eligible/total sessions, total invested, raw net and profitable-session rate as supporting stats. Use “profitable sessions,” not “hands won.” Do not imply chip units are real-money transactions.
- Default graph: running average return (%) against the owner's chronological sessions. A player's series starts at their first eligible session. Absence does not add a zero return; thereafter carry forward the previous mean. Mark actual score changes and show session return, running mean and sample count in tooltips.
- Keep raw-chip results available as an optional graph/accounting view. A sum of session percentage points is not cumulative ROI. Do not compound returns from independent sessions as a reinvested portfolio.
- Discard excludes a session; restore/correction deterministically recalculates both ranking and graph. Version the formula for future changes.
- Zero/unknown investment gives an unranked result with a reason, never division by zero or a fabricated denominator. No eligible sessions means no score, not 0%.

### Integrity and historical eligibility

New saves require distinct players, valid dates, nonnegative ending stacks, valid investment events and net derived server-side. Under current rules (no fees or cash-outs), sum of ending chips equals sum of invested chips and total net equals zero. Future fees/cash-outs must be modeled explicitly.

Guard intermediate sums, not just input integers. Postgres bigint exceeds JavaScript safe-number precision: either define and enforce bounds end-to-end or transport decimal strings and compute with BigInt/exact decimals. Percentages are calculated without early rounding and rounded only for display.

Legacy data without buy-in history is eligible using starting stack only when ending − net equals starting stack and other integrity checks support it. Otherwise retain it for historical review and flag it as unverified. An inferred investment of ending − net is evidence, not automatically verified buy-in history. Do not silently repair or drop invalid records. Document eligibility decisions in the migration report.

## Legacy migration and release sequence

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

Before store release recheck current rules for login, account deletion, privacy disclosures, minimum app quality and gambling-related classification. This is a chip ledger. Payments, payouts or gambling services would require separate product decisions and review; this plan does not add them.

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
| Login methods/provider | Prefer Neon Auth; confirm project compatibility and ask about login methods during transition |
| Historical session ownership | Ask user for ownership explicitly; review session-level mapping before migration |
| Account deletion/backup retention | User requested discussion alongside Neon login transition; expects existing behavior mostly retained, details not finalized |
| Multi-user transition | Planned only; await implementation request |
| Sporty glass design | Paused on `ui-sporty-glass-refresh` |
| Cloud draft sync / device handoff | Deferred; needs conflict policy |
| Shared ledgers/invitations | Out of initial scope; add only if requested |
| App Store / Play Store | Future separate plan after web stability |

## Decision history and planning convention

2026-09-20: User requested switch to main and documentation-only transition plan. Repository inspected. Initial private-group recommendation was superseded by the user's clarification: one orchestrating account owns a friend list and games; friends need no account or invitation. User delegated ranking choice. Average session return selected with stated limitations. No implementation or production data changes.

For each future feature, add: date, problem, accepted behavior, non-goals, architecture choices and tradeoffs, migration impact, acceptance criteria, open questions and status. Keep user decisions distinct from recommendations; update this document when scope changes.

2026-09-20 follow-up: User explicitly confirmed host-owned accounts with guest friends and average session return. Rank all eligible players immediately; do not use a provisional label. Neon Auth requested as preferred identity direction. Ask user about historical ownership during data separation, and revisit deletion/retention alongside login migration. Ask remaining architecture questions when relevant. Neon handles identity, while owner access rules still need explicit server checks and database policies. Reference: https://neon.com/docs/auth/overview.

2026-09-20 implementation step 1: Created `feature/multi-user-transition`. Removed the provisional threshold from the planned ranking. Verified Neon MCP is installed and enabled in Codex. Installed project-scoped Next.js DevTools MCP in `.codex/config.toml`. No application, database, auth, or production data changes in this step.
