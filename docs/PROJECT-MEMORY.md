# Project memory

Updated 2026-09-24. Durable working agreements, decisions and environment facts, as they stand now. The step-by-step history is in the decision history of [`FEATURE-PLAN.md`](./FEATURE-PLAN.md) and in git; rehearsal evidence is in [`MIGRATION-REHEARSALS.md`](./MIGRATION-REHEARSALS.md).

## Working agreements

- Work on `feature/multi-user-transition`, one reviewed step at a time. Stop and report after each step, then commit when the user approves. Never push unless asked.
- Production rollout, production data changes and historical ownership migration are **not authorized**. All database work happens on the isolated Neon branch.
- Preserve existing game rules and flows unless a requested feature changes them.
- When the user delegates a trade-off, choose the long-term, easy-to-debug option and explain why. Ask when the choice changes behaviour the user will notice.
- Keep [`FEATURES.md`](./FEATURES.md) (plain language, for non-technical readers) updated in the same change as any user-visible behaviour, with exact numbers and limits.
- Record decisions and status in `FEATURE-PLAN.md`; record rehearsals in `MIGRATION-REHEARSALS.md`.
- Agents never see or handle secrets. The user adds secret values to `.env.local` and Vercel. Scripts may read `.env.local` but must never print values; check presence with `grep -c "^NAME="`.
- The UI redesign is paused on `ui-sporty-glass-refresh` at `826142f`. Leave it alone.

## Confirmed product decisions

- One signed-in host owns a private friend list, games and standings. Friends are names and need no account. No groups, invitations or shared ledgers in the initial release.
- Ranking is average session return: the mean of `100 × (ending − invested) / invested` per eligible session, including every rebuy. Players are ranked from their first eligible session, with no provisional label, and the session count is shown. All supporting stats cover eligible sessions only.
- Sign-in is Neon Managed Better Auth with email magic links only (links expire after 5 minutes). Password sign-up and shared Google are disabled in the Neon Auth config on the isolated branch (Step 3N); each new Neon branch or production needs the same check, because Neon enables them by default.
- Rate limiting uses one Vercel Firewall rule (the Hobby plan allows one), applied at cutover; see the plan's go-live checklist.
- Permanent deletion of players or games requires discarding first and a sign-in within the last **10 minutes**. The user kept 10 minutes for now and may revisit it.
- Account deletion: immediate lock, hide and sign-out everywhere; recovery within **30 days**; then a daily automated purge. The disclosure quotes Neon's **6-hour** history retention, which applies to the current free plan.
- Purge infrastructure: a daily Vercel Cron job, a project-scoped Neon API key to delete the sign-in identity, and Healthchecks.io alerts.
- Starting stack must be at least 1. Standings and graph show chips, not ₹; game screens still use ₹ as a chip label.
- Historical ownership: cohorts A–G and J–L are Rajarshi's and have been backfilled on the isolated branch. Cohort M belongs to a separate Emon-led group whose host account is unknown. Cohorts H–I, and players Aiush, Ashit and Rana, are unresolved. Never infer ownership from names or stakes; ask. Details are in [`HISTORICAL-OWNERSHIP.md`](./HISTORICAL-OWNERSHIP.md).

## Environment facts

- Neon project `wispy-morning-76468301`. Isolated development branch `multi-user-auth` (`br-little-rain-ay5fufwv`). Local `.env.local` targets that branch.
- Dev branch accounts: the user's real ledger (therajarshiroy@gmail.com: 9 players, 24 sessions, 72 results) and an empty second host (roystark24@gmail.com), kept for two-account tests.
- Database roles: the runtime role `menoka_app` and the purge role `menoka_purge`. Both are SQL-created and unprivileged (`NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`).
  - Roles created through Neon's role API inherit `neon_superuser` and bypass row-level security; never use them for the app.
  - Neon's console cannot reset the password of a role that has none. Set a random one in SQL first (see `migrations/README.md`).
- Migrations are applied through the Neon MCP as the owner (`run_sql_transaction`, without `BEGIN`/`COMMIT`). The owner cannot `SET ROLE menoka_app`. Test app-role behaviour with a Node script that uses `.env.local`'s `DATABASE_URL`, inside a transaction that is rolled back.
- `npm run dev` serves on port **3005**; the preview is `.claude/launch.json` → `dev`. After server-side changes, a long-running dev server can serve stale modules (for example "is not a function"); restart it.
- The in-app browser keeps its own cookies. To sign in there, the user pastes a fresh magic link into its address bar instead of clicking it in their mail client. A link must be opened in the browser that should be signed in.
- The Neon Auth SDK answers get-session from a cached cookie, so `/auth/callback` strips existing session cookies before exchanging a verifier (`lib/auth/session-cookies.ts`). Keep this whenever the SDK changes.
- Next.js 16.3.5 and `@neondatabase/auth` 0.5.0-beta are pinned. Rerun every gate after upgrading.
- Gates: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, plus a browser check for anything visible.
