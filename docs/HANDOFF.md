# Session handoff

Updated 2026-09-25 on **`live-view`**. **The multi-user version is live** (production runs `0a8b814` from `main`). This session committed the Scoreboard redesign, built a **live standings link**, tested both on a Vercel preview, and applied migration 0009 to production. **The release itself (merge to `main`, push) was paused by the user** to start a new idea: **host invitations** (below). Replace this file at the end of each session; don't let it grow.

## Next session: host invitations (new idea, not started)

- **User's direction (2026-09-25):** the whole app stays behind sign-in. Hosts invite people to join, building a network of users. An earlier idea, letting visitors explore and see all-time standings without signing in, was **dropped**.
- **This conflicts with a confirmed plan decision** ("no groups, invitations or shared ledgers in the initial release"). Start by writing a proposal entry in `FEATURE-PLAN.md` and getting the user's answers. Plans are not implementation authorization.
- **Phasing the agent suggested (not decided):**
  1. Read-only members: an invite link for a specific friend; the friend signs in and is linked to their existing player profile; they see the host's standings, sessions and live games in the app.
  2. Co-hosts who can record games.
  3. Membership across several hosts, possibly a combined profile.
- **Open decisions for phase 1:**
  - Who confirms the link between a login and a player name: the host picks the player when inviting (recommended), or the friend claims a name and the host approves. Never infer it from names.
  - What members see: everything (recommended) or only standings and their own games.
  - Invite format: a single-use link with an expiry such as 7 days (recommended), or email invites, which need custom SMTP (deferred).
- It needs new tables and new read rules (members reading another account's ledger), so it follows the migration, rehearsal and go-ahead process in `PROJECT-MEMORY.md`.

## Paused release: redesign + live standings

- **Branch `live-view`** (pushed to GitHub up to `dacdf0c`; the handoff docs commit after it is local only) contains `main`, the redesign (`ed56525`) and the live standings link with two UI fixes from the user's phone test: blinds first in large type, a large stack with a "Stack" label above it, "Buy-In" instead of "in", and the hand status below the players. `ui-sporty-glass-refresh` stops at `ed56525`.
- **Production database:** migration **0009 was applied to `br-small-sea-ayumyssr`** on 2026-09-25 with the user's go-ahead. It is recorded in `app_migrations`, has row security on, and holds 0 rows; the 27 owned games are untouched. The live site's code doesn't use it yet, so this is harmless.
- **To release** (the user asked for it before pausing; confirm again when resuming): `git switch main && git merge --ff-only live-view && git push`. Check first that `main` hasn't moved, then watch the Vercel production build. Afterwards:
  - start a throwaway game on the live site, share it, scan the QR code on a phone (production has no Vercel login in front), and discard the game;
  - then check the redesign's unchecked screens (see below).
- **Preview setup:** Preview `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` now apply to all Preview branches; the `cutover-rehearsal` branch's Neon Auth trusts the `live-view` preview domain; the user applied 0009 there by hand, because the auto-mode check blocked the agent's SQL on that branch. The agent's SQL on production was allowed after the user's explicit request. Vercel protects preview URLs with a Vercel login; production is public.
- **Verified:** 129 tests, types, lint and build; a browser round trip on the dev branch; the user's phone test on the preview. **Not yet checked:** iOS share sheet, a locked host screen, and CDN caching of the public GET on production.
- **Testing tip:** Next 16 allows one `next dev` per folder. When another chat holds 3005, run a copy of the working tree on another port (see `PROJECT-MEMORY.md`). The in-app browser reports tabs as hidden, which pauses the viewer's polling; reload the viewer tab to force a check.

## Redesign (previous session, now committed)

- Commit `ed56525` on `ui-sporty-glass-refresh`: `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `components/poker-ledger.tsx`, `lib/theme.ts` and docs. `design_handoff_sporty_glass_redesign/` stays untracked.
- **Not yet checked:** sign-in and locked-account pages, the confirmation sheets, rules sheet, blind editor, import review, winner overlay, drag reordering by touch, and a real phone (iOS Safari `backdrop-filter`).
- **Next-street button:** always reads "Deal FLOP/TURN/RIVER →", disabled until the betting round ends (automatic streets and a pinned button were tried and rejected by the user).
- **Note:** the dev server on 3005 uses a non-production Neon endpoint (`ep-withered-hill`), not production (`ep-delicate-pond`).

## Read first

1. This file.
2. [`PROJECT-MEMORY.md`](./PROJECT-MEMORY.md): working agreements and environment facts (branch IDs matter, see below).
3. [`FEATURE-PLAN.md`](./FEATURE-PLAN.md): the "2026-09-25 multi-user production cutover" entry and the two go-live checklists with their status lines.
4. [`HISTORICAL-OWNERSHIP.md`](./HISTORICAL-OWNERSHIP.md) before any further claim.

## Where things stand

- **Live site** (https://menokacardgames.vercel.app): production runs `0a8b814`. `main` is pushed and deployed (the latest commits are docs, a small clean-up and the `scripts/` helpers); pushing `main` deploys. Magic-link sign-in only. therajarshiroy@gmail.com (account `4db9f3e6-9b4b-445b-8ca3-831773acdb3c`) sees 27 games, 9 players, and standings matching the rehearsal (Debraj +18.56%, Rajarshi +17.08%, …). The app connects as `menoka_app`.
- **Production database: `br-small-sea-ayumyssr`**, now named "production" again, pooled host `ep-delicate-pond-ay8ple8b-pooler`. It has migrations 0001, 0002 and 0004–0009 (0009 added 2026-09-25, unused until the release). The legacy games 24, 25, 32, 33 and 37 stay unowned and hidden.
- **Neon's default branch is still the copy** `br-withered-glitter-ay2zbaoe` (renamed `restore-copy-2026-09-24`). A snapshot restore yesterday swapped the names, which misled the user's console work today. It holds pre-cutover data (32 games) and two unused roles, `menoka_app` and `menoka_purge`, created on it by mistake. **Ask the user** whether to make `br-small-sea` the default and delete the copy.
- **Vercel Production variables:** all nine are set, and `DELETION_PASSWORD` is gone. The purge cron ran twice by hand, both 200 with nothing due.
- **`main`** matches GitHub and production (`0a8b814`). The redesign and live standings are on `live-view`, ready to release (see above). The production database is already at 0009.

## Next steps

1. **Healthchecks.io alerts:** the check pings green (confirmed 2026-09-25), but it has no notification integration yet. The user adds an email integration; see the plan's register.
2. **Firewall:** the rule "Limit API writes" was published on 2026-09-25 in **Log** mode (non-GET `/api/*`, 30 per 60 s per IP). Around 2026-10-02, check Firewall → Overview for logged hits, switch it to 429 (with the user's OK), then send 31 quick writes and confirm the "Too many requests" message.
3. **Neon tidy-up (with the user's OK):** make `br-small-sea-ayumyssr` the default branch, and consider deleting `restore-copy-2026-09-24`, `claim-test-throwaway` and `vercel-preview`. Keep `cutover-rehearsal` while the preview uses it. The free plan allows 10 branches and 1 snapshot. The only snapshot, `snap-sparkling-sun-aykr4j1y`, is pre-migration; replacing it with a post-cutover one needs the user's decision.
4. **Later claims** (when those hosts sign in; the user supplies the emails): the Emon-led group gets `ARRAY[32,33,37]` with friends `Emon, Abhirup, Supratik, Ashish`; Rahul Basak gets `ARRAY[24,25]` with friends `Rahul Basak, Ashit, Rana`. Find the account ID via `accounts` joined to `neon_auth."user"` by email, then run `public.claim_reviewed_history(...)` on `br-small-sea-ayumyssr` with the decision text from `HISTORICAL-OWNERSHIP.md`.
5. Possibly: pilot with a second, unrelated host (plan's release step 6).
6. Production follow-ups happen on `main`; switch back with `git switch main` (commit or stash the live-view work first).

## Open decisions

Saved in the plan's pending register (rows dated 2026-09-25): Healthchecks alerts, committing the docs and `scripts/`, the Neon default branch, Neon branch clean-up, a post-cutover snapshot, and custom SMTP (deferred). Ask the user before acting on any of them.

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
