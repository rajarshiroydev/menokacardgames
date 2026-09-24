# Session handoff

Updated 2026-09-24 on `feature/multi-user-transition`. The 8 game changes (Steps 3P–3V plus the raise-totals follow-up) were backported to `release/game-changes`, tested on a Vercel preview against a test database, and pushed to `main` one commit at a time, so they are **live in production**. The accounts, sign-in and database work on this branch is still not in production. Replace this file at the end of each session; don't let it grow.

## Read first

1. [`PROJECT-MEMORY.md`](./PROJECT-MEMORY.md): working agreements, decisions and environment facts. Short.
2. [`FEATURE-PLAN.md`](./FEATURE-PLAN.md): the "Pending choices" table and the latest decision-history entries (the game-changes release is the newest).
3. [`FEATURES.md`](./FEATURES.md): what the app does today, in plain language. Update it with every user-visible change.

## Where things stand

**Production (`main`)** now has, on top of the old global ledger: Pin Chart removed, full-stack rebuys, the large blinds box, the bet slider, last-full-raise minimums and short all-ins, raise-to labels, the exact Undo last hand, and standings lists that reveal 10 at a time. `main` has no `docs/` folder; the release commits leave docs out. Backport notes: `main`'s player rows take a rank index, so `ExpandingList.render` passes `(item, index)`; `main` keeps `timingSafeEqual` and `playerKey` imports that this branch dropped.

**This branch** has the multi-user transition, built and rehearsed on the isolated Neon branch `multi-user-auth`: magic-link sign-in, owner-scoped data (server checks, row-level security, the restricted `menoka_app` role), normalized accounting and average-session-return standings, recent sign-in for permanent deletion, account deletion with 30-day recovery and a daily purge, same-origin and body-size checks (3M), magic-link-only auth config (3N) and the import preview (3O). None of it is in production.

When this branch is eventually merged into `main`, expect conflicts where the same game commits exist twice (`components/poker-ledger.tsx`, `lib/poker/game.ts`, `lib/poker/session-validation.ts`, `test/game.test.ts`, `app/globals.css`). Take this branch's side, which already contains the game changes.

## Vercel and Neon setup

- Vercel project `menokacardgames` (`prj_YYgZXYIfdHRPwOyC6rkv7sFTGG6u`) deploys production from `main` and previews from other branches. Deployments are behind Vercel login; the user signs in to Vercel in the in-app browser for checks.
- The Preview `DATABASE_URL` now points at the Neon branch `vercel-preview` (`br-orange-river-aywd7pca`), a copy of production made on 2026-09-24. It holds one extra test game (Game 38: Abhirup, Debraj, Pratik) saved during preview testing. Production has 32 games.
- Vercel still has no Neon Auth variables, so a preview of this branch would not sign in until they're added for Preview.

## Cutover progress (started 2026-09-24, user authorized "proceed with the rest")

Ownership is fully decided (see `HISTORICAL-OWNERSHIP.md`): Rajarshi gets legacy games 5–23, 26–29, 31 and 34–36; the Emon-led group (32, 33, 37) and Rahul Basak (24, 25) stay in the unclaimed archive until their hosts sign in; Aiush is dropped. Neon's shared email sender stays for now.

Done:
1. Migration `0008_claim_reviewed_history` (owner-only claim function) written and added to `schema.sql`.
2. Neon branch `cutover-rehearsal` (`br-tiny-forest-ayt6f3fe`), a copy of production: roles `menoka_app` and `menoka_purge` created by SQL with random passwords, migrations 0001, 0002, 0004–0008 applied, Neon Auth provisioned (base URL `https://ep-blue-fire-ayuksq4w.neonauth.c-5.us-east-2.aws.neon.tech/neondb/auth`), password sign-up off, shared Google removed, magic link on with 5-minute expiry, app name "Menoka Card Games". The organization plugin can't be switched off through the API (405).
3. Throwaway branch `claim-test-throwaway` (`br-autumn-tooth-ayksxle3`): all three claims with stand-in accounts gave 27, 3 and 2 games and 95 results, all reconciled; a rerun returned 0; bad friend lists and game sets were refused. Ask the user before deleting it.

Next:
1. Vercel Preview variables scoped to this git branch: `DATABASE_URL` (menoka_app on `cutover-rehearsal`), `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`. Add the preview's domain to the rehearsal branch's trusted domains.
2. Preview test: sign in as therajarshiroy@gmail.com, run the Rajarshi claim with the new account ID, check standings, a two-account isolation check, and the verifier in Vercel request logs.
3. Production: backup branch, then the same steps as the rehearsal on `production`, production Vercel variables (plan's checklists), then push this branch to `main`.

## Session gotchas

- Browser checks need the user to sign in: they paste a fresh magic link into the in-app browser. The user's ledger is therajarshiroy@gmail.com; a second empty host, roystark24@gmail.com, is available for two-account tests. Sign-in cookies are per host, so a server on another localhost port shares the port-3005 sign-in.
- Restart the preview server (`dev`, port 3005) after server-side changes or new `.env.local` values. Next.js allows one `next dev` per folder, so if another chat holds 3005, build and run `next start` on a spare port (magic links work on any localhost port on the dev branch); don't commit the temporary launch entry.
- Never print or handle secrets. `.env.local` holds `DATABASE_URL`, the Neon Auth values, `PURGE_DATABASE_URL`, `NEON_API_KEY`, `CRON_SECRET`, `HEALTHCHECKS_PING_URL`, `NEON_PROJECT_ID` and `NEON_AUTH_BRANCH_ID`. Check with `grep -c "^NAME=" .env.local`.
- `DELETE_PASSWORD` in `.env.local` is unused and can be removed by the user.
- In zsh scripts, write `"${sha}:refs/heads/main"`: a bare `$sha:r…` is read as a filename modifier.
- Report each step in simple language, and ask before committing.
