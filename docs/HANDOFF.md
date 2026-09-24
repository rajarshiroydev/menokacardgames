# Session handoff

Updated 2026-09-24 on `feature/multi-user-transition`. Steps 3M and 3N (security hardening) are committed (clean tree, nothing pushed). Replace this file at the end of each session; don't let it grow.

## Read first

1. [`PROJECT-MEMORY.md`](./PROJECT-MEMORY.md): working agreements, decisions and environment facts. Short.
2. [`FEATURE-PLAN.md`](./FEATURE-PLAN.md): the "Pending choices" table and the latest decision-history entries (Step 3N is the newest).
3. [`FEATURES.md`](./FEATURES.md): what the app does today, in plain language. Update it with every user-visible change.

## Where things stand

The multi-user transition is built and rehearsed on the isolated Neon branch `multi-user-auth`, through Step 3N:

- magic-link sign-in; owner-scoped data enforced by server checks, row-level security and the restricted `menoka_app` role
- normalized accounting and average-session-return standings
- recent sign-in (10 minutes) for permanent deletion
- account deletion: request, lock, 30-day recovery, then a daily automated purge
- Step 3M: mutating `/api/*` requests must be same-origin (`proxy.ts`), JSON bodies are size-limited (16 KB, or 2 MB for session saves), and a session retry with the same ID but different content returns 409
- Step 3N: password sign-up and shared Google sign-in disabled in the branch's Neon Auth config (magic links only, as decided); a 429 shows a clear "Too many requests" message. The Vercel Firewall rate-limit rule is specified in the plan's auth and firewall go-live checklist, not applied (it would change production)

Production and Vercel are unchanged. The last full gate passed: 87 tests, types, lint and build.

## Next step

- **Magic-link verifier in logs:** confirm `neon_auth_session_verifier` in the `/auth/callback` URL isn't retained in production or Vercel request logs. `next dev` logs it locally. Production doesn't run this branch yet, so this belongs with the first preview deployment.

After that:
- **Import/export acceptance:** preview the player mapping before saving. Re-sending all 24 exported sessions already returns `saved: 0` (checked in 3M); a full export-file round trip through the Import button is still to do.
- **Small cleanup:** remove the Pin Chart button, which has done nothing since 19 Sept.
- **Production cutover:** needs the user's explicit authorization, a backup/restore rehearsal, the purge go-live checklist in the plan, and answers on history cohorts H–I and cohort M's host.

## Session gotchas

- Browser checks need the user to sign in: they paste a fresh magic link into the in-app browser. The user's ledger is therajarshiroy@gmail.com; a second empty host, roystark24@gmail.com, is available for two-account tests. Sign-in cookies are per host, so a server on another localhost port shares the port-3005 sign-in.
- Restart the preview server (`dev`, port 3005) after server-side changes or new `.env.local` values. If another chat holds port 3005, a production build (`next start`) on a spare port works for API checks; don't commit a temporary launch entry.
- Never print or handle secrets. `.env.local` holds `DATABASE_URL`, the Neon Auth values, `PURGE_DATABASE_URL`, `NEON_API_KEY`, `CRON_SECRET`, `HEALTHCHECKS_PING_URL`, `NEON_PROJECT_ID` and `NEON_AUTH_BRANCH_ID`. Check with `grep -c "^NAME=" .env.local`.
- `DELETE_PASSWORD` in `.env.local` is unused and can be removed by the user.
- Report each step in simple language, and ask before committing.
