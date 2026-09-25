# Session handoff

Updated 2026-09-25 on `feature/multi-user-transition`. **The multi-user version is live.** Production runs `0a8b814`; the user signed in and has their 27 legacy games. What's left is small: Healthchecks email alerts, switching the firewall rule from Log to 429 after a week, two later claims, and some tidying. Replace this file at the end of each session; don't let it grow.

## Read first

1. This file.
2. [`PROJECT-MEMORY.md`](./PROJECT-MEMORY.md): working agreements and environment facts (branch IDs matter, see below).
3. [`FEATURE-PLAN.md`](./FEATURE-PLAN.md): the "2026-09-25 multi-user production cutover" entry and the two go-live checklists with their status lines.
4. [`HISTORICAL-OWNERSHIP.md`](./HISTORICAL-OWNERSHIP.md) before any further claim.

## Where things stand

- **Live site** (https://menokacardgames.vercel.app): `main` = `0a8b814` = this branch. Magic-link sign-in only. therajarshiroy@gmail.com (account `4db9f3e6-9b4b-445b-8ca3-831773acdb3c`) sees 27 games, 9 players, and standings matching the rehearsal (Debraj +18.56%, Rajarshi +17.08%, …). The app connects as `menoka_app`.
- **Production database: `br-small-sea-ayumyssr`**, now named "production" again, pooled host `ep-delicate-pond-ay8ple8b-pooler`. It has migrations 0001, 0002 and 0004–0008. The legacy games 24, 25, 32, 33 and 37 stay unowned and hidden.
- **Neon's default branch is still the copy** `br-withered-glitter-ay2zbaoe` (renamed `restore-copy-2026-09-24`). A snapshot restore yesterday swapped the names, which misled the user's console work today. It holds pre-cutover data (32 games) and two unused roles, `menoka_app` and `menoka_purge`, created on it by mistake. **Ask the user** whether to make `br-small-sea` the default and delete the copy.
- **Vercel Production variables:** all nine are set, and `DELETION_PASSWORD` is gone. The purge cron ran twice by hand, both 200 with nothing due.
- **Uncommitted:** a post-launch doc review (2026-09-25) touching `README.md`, `AGENTS.md`, `CONTEXT.md`, `migrations/README.md` and every file in `docs/`, plus the untracked `scripts/`. Ask before committing. The docs don't need to be deployed.

## Next steps

1. **Healthchecks.io alerts:** the check pings green (confirmed 2026-09-25), but it has no notification integration yet. The user adds an email integration; see the plan's register.
2. **Firewall:** the rule "Limit API writes" was published on 2026-09-25 in **Log** mode (non-GET `/api/*`, 30 per 60 s per IP). Around 2026-10-02, check Firewall → Overview for logged hits, switch it to 429 (with the user's OK), then send 31 quick writes and confirm the "Too many requests" message.
3. **Neon tidy-up (with the user's OK):** make `br-small-sea-ayumyssr` the default branch, and consider deleting `restore-copy-2026-09-24`, `claim-test-throwaway` and `vercel-preview`. Keep `cutover-rehearsal` while the preview uses it. The free plan allows 10 branches and 1 snapshot. The only snapshot, `snap-sparkling-sun-aykr4j1y`, is pre-migration; replacing it with a post-cutover one needs the user's decision.
4. **Later claims** (when those hosts sign in; the user supplies the emails): the Emon-led group gets `ARRAY[32,33,37]` with friends `Emon, Abhirup, Supratik, Ashish`; Rahul Basak gets `ARRAY[24,25]` with friends `Rahul Basak, Ashit, Rana`. Find the account ID via `accounts` joined to `neon_auth."user"` by email, then run `public.claim_reviewed_history(...)` on `br-small-sea-ayumyssr` with the decision text from `HISTORICAL-OWNERSHIP.md`.
5. Possibly: pilot with a second, unrelated host (plan's release step 6); then decide when the paused UI redesign branch `ui-sporty-glass-refresh` resumes.

## Open decisions

Saved in the plan's pending register (rows dated 2026-09-25): which git branch new work starts from, Healthchecks alerts, committing the docs and `scripts/`, the Neon default branch, Neon branch clean-up, a post-cutover snapshot, and custom SMTP (deferred). Ask the user before acting on any of them.

## Rollback (only with the user's decision)

Vercel Instant Rollback alone won't work: the old code expects the old schema, and `DATABASE_URL` is now `menoka_app`. A full rollback means restoring the pre-migration snapshot onto `br-small-sea-ayumyssr`, pointing Production `DATABASE_URL` back to the owner, and rolling back to the `519f72c` deployment. Games and accounts created since the cutover would be lost.

## Session gotchas

- **Always name Neon branches by ID** in instructions to the user, and have them check the branch selector. The console name "production" meant the wrong branch for most of today.
- **Connection strings:** have the user assemble them in TextEdit on one line. A pasted line break made the Neon driver print the whole string, password included, into Vercel's runtime log. Redact logs before quoting them (for example `javascript_tool` with a regex that replaces `postgres…` and `hc-ping.com/…`).
- The agent never handles secret values. The user runs `openssl rand -hex 32 | tr -d '\n' | pbcopy` and pastes. Passwords set with `alter role` belong on `br-small-sea-ayumyssr`.
- The safety checks block the Vercel connector's env listing and deployment listing (403). Read names and statuses on the Vercel pages in the in-app browser instead. Env var values stay hidden there.
- Vercel's deployment ⋯ menu toggles on each click. Open it once, then use `find("Redeploy")` or a fresh screenshot before clicking an item.
- Another chat may hold the dev server on port 3005, and the untracked `design_handoff_sporty_glass_redesign/` fails lint. Leave both alone; lint tracked files with `npx eslint $(git ls-files '*.ts' '*.tsx' '*.mjs')`.
- Report each step in simple language, and ask before committing.
