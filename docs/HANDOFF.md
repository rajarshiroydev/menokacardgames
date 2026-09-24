# Session handoff

Updated 2026-09-24 at commit `11e5371` on `feature/multi-user-transition` (clean tree, nothing pushed). Replace this file at the end of each session; don't let it grow.

## Read first

1. [`PROJECT-MEMORY.md`](./PROJECT-MEMORY.md): working agreements, decisions and environment facts. Short.
2. [`FEATURE-PLAN.md`](./FEATURE-PLAN.md): the "Pending choices" table and the latest decision-history entries.
3. [`FEATURES.md`](./FEATURES.md): what the app does today, in plain language. Update it with every user-visible change.

## Where things stand

The multi-user transition is built and rehearsed on the isolated Neon branch `multi-user-auth`, through Step 3L:

- magic-link sign-in; owner-scoped data enforced by server checks, row-level security and the restricted `menoka_app` role
- normalized accounting
- average-session-return standings
- recent sign-in (10 minutes) for permanent deletion
- account deletion: request, lock, 30-day recovery, then a daily automated purge

Production and Vercel are unchanged. The last full gate passed: 72 tests, types, lint and build.

## Next step (recommended, not started): security hardening

- Check that mutating API requests come from the app itself (Origin/`Sec-Fetch-Site` against the app's own host).
- Rate-limit sign-in, import and mutations, and limit request body sizes.
- Make an idempotent save with the same client session ID but a *different* payload return 409 conflict. Today a retry is silently ignored (`ON CONFLICT DO NOTHING`).
- Confirm the one-time magic-link code (`neon_auth_session_verifier` in the `/auth/callback` URL) isn't retained in production or Vercel request logs. `next dev` logs it locally.

After that:
- **Import/export acceptance:** preview the player mapping before saving; prove that exporting and re-importing makes no duplicates.
- **Small cleanup:** remove the Pin Chart button, which has done nothing since 19 Sept.
- **Production cutover:** needs the user's explicit authorization, a backup/restore rehearsal, the purge go-live checklist in the plan, and answers on history cohorts H–I and cohort M's host.

## Session gotchas

- Browser checks need the user to sign in: they paste a fresh magic link into the in-app browser. The user's ledger is therajarshiroy@gmail.com; a second empty host, roystark24@gmail.com, is available for two-account tests.
- Restart the preview server (`dev`, port 3005) after server-side changes or new `.env.local` values.
- Never print or handle secrets. `.env.local` holds `DATABASE_URL`, the Neon Auth values, `PURGE_DATABASE_URL`, `NEON_API_KEY`, `CRON_SECRET`, `HEALTHCHECKS_PING_URL`, `NEON_PROJECT_ID` and `NEON_AUTH_BRANCH_ID`. Check with `grep -c "^NAME=" .env.local`.
- `DELETE_PASSWORD` in `.env.local` is unused and can be removed by the user.
- Report each step in simple language, and ask before committing.
