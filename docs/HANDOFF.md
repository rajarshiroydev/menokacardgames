# Session handoff

Updated 2026-09-24 on `feature/multi-user-transition`. Steps 3M and 3N (security hardening) are committed. Step 3O (import preview) is committed. Step 3P (Pin Chart removal) is committed. Step 3Q (rebuys are the full starting stack) is committed (clean tree, nothing pushed). Replace this file at the end of each session; don't let it grow.

## Read first

1. [`PROJECT-MEMORY.md`](./PROJECT-MEMORY.md): working agreements, decisions and environment facts. Short.
2. [`FEATURE-PLAN.md`](./FEATURE-PLAN.md): the "Pending choices" table and the latest decision-history entries (Step 3Q is the newest).
3. [`FEATURES.md`](./FEATURES.md): what the app does today, in plain language. Update it with every user-visible change.

## Where things stand

The multi-user transition is built and rehearsed on the isolated Neon branch `multi-user-auth`, through Step 3Q:

- magic-link sign-in; owner-scoped data enforced by server checks, row-level security and the restricted `menoka_app` role
- normalized accounting and average-session-return standings
- recent sign-in (10 minutes) for permanent deletion
- account deletion: request, lock, 30-day recovery, then a daily automated purge
- Step 3M: mutating `/api/*` requests must be same-origin (`proxy.ts`), JSON bodies are size-limited (16 KB, or 2 MB for session saves), and a session retry with the same ID but different content returns 409
- Step 3N: password sign-up and shared Google sign-in disabled in the branch's Neon Auth config (magic links only, as decided); a 429 shows a clear "Too many requests" message. The Vercel Firewall rate-limit rule is specified in the plan's auth and firewall go-live checklist, not applied (it would change production)
- Step 3O: Import shows a review screen (counts, how each player maps, new games) before saving; re-importing an export adds nothing
- Step 3P: the dead Pin Chart button is gone
- Step 3Q: every rebuy is the full starting stack (up to 64 buy-ins per player); older half-size rebuys stay valid

Production and Vercel are unchanged. The last full gate passed: 95 tests, types, lint and build.

## Next step

The user wants to work on other app changes before touching previews and production. After those:


1. **Preview deployment** of this branch (not production). Use it to confirm `neon_auth_session_verifier` in the `/auth/callback` URL isn't retained in Vercel request logs. The production-mode server itself doesn't log it.
2. **Production cutover:** needs the user's explicit authorization, a backup/restore rehearsal, both go-live checklists in the plan (purge; auth and firewall), and answers on history cohorts H–I and cohort M's host.

## Session gotchas

- Browser checks need the user to sign in: they paste a fresh magic link into the in-app browser. The user's ledger is therajarshiroy@gmail.com; a second empty host, roystark24@gmail.com, is available for two-account tests. Sign-in cookies are per host, so a server on another localhost port shares the port-3005 sign-in.
- Restart the preview server (`dev`, port 3005) after server-side changes or new `.env.local` values. Next.js allows one `next dev` per folder, so if another chat holds 3005, build and run `next start` on a spare port (magic links work on any localhost port on the dev branch); don't commit the temporary launch entry.
- Never print or handle secrets. `.env.local` holds `DATABASE_URL`, the Neon Auth values, `PURGE_DATABASE_URL`, `NEON_API_KEY`, `CRON_SECRET`, `HEALTHCHECKS_PING_URL`, `NEON_PROJECT_ID` and `NEON_AUTH_BRANCH_ID`. Check with `grep -c "^NAME=" .env.local`.
- `DELETE_PASSWORD` in `.env.local` is unused and can be removed by the user.
- Report each step in simple language, and ask before committing.
