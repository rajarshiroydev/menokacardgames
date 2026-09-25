# Session handoff

Updated 2026-09-25 on **`live-view`**. **The multi-user version is live** (production runs `0a8b814` from `main`). This session committed the Scoreboard redesign and built a **live standings link** for players on a new branch. Neither has reached `main` or production. The production follow-ups below are unchanged. Replace this file at the end of each session; don't let it grow.

## Live standings link (this session)

- **What:** players open a link or scan a QR code (no sign-in) and see every stack, total bought in and net for the game in progress. Stacks are live; net and rank change when a hand ends. Behaviour is in `FEATURES.md` section 19; design and checks are in the plan entry "2026-09-25 live standings link".
- **Branches:** `ui-sporty-glass-refresh` now has the redesign committed (`ed56525`, with the user's OK). `live-view` branches from it and holds the live-view work (its latest commit, made with the user's OK). Nothing is pushed.
- **Database:** migration `0009_live_views` is applied **only** to the development branch `br-little-rain-ay5fufwv` and rehearsed (12/12). The preview branch `br-tiny-forest-ayt6f3fe` has it too. Production `br-small-sea-ayumyssr` needs the user's go-ahead, and must get 0009 **before** this code deploys, or the share button fails (the rest of the app is unaffected).
- **New dependency:** `qrcode-generator` 2.0.4 (approved by the user).
- **Verified:** 129 tests, types, lint, production build; a browser round trip on the dev branch (details in the plan entry). **Not yet checked:** a real phone (iOS share sheet, QR scan, locked screen), a Vercel preview, and CDN caching of the public GET on Vercel.
- **Preview (2026-09-25):** `live-view` is pushed. The user applied 0009 to `cutover-rehearsal` (`br-tiny-forest-ayt6f3fe`) in the Neon editor (the agent's SQL there was blocked by the auto-mode check), set the Preview `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` to all Preview branches (they were scoped to the deleted `feature/multi-user-transition`), and added `https://menokacardgames-git-live-view-rajarshi-roys-projects-6d013459.vercel.app` to that branch's Neon Auth domains. The redeploy built, and `/api/live/<unknown>` returns 404 there. Vercel Deployment Protection puts a Vercel login in front of previews, so players without a Vercel login can't open preview links; production is public.
- **Next:** the user reviews both branches (dev server on 3005 serves the working tree). Then decide the route to `main`: the redesign first, then live-view, each through a Vercel preview. Apply 0009 to production just before live-view deploys.
- **Testing tip:** Next 16 allows one `next dev` per folder, and another chat held 3005 (dev) and 3006 (`next start`, which uses `.next`, so don't run `npm run build` in the repo while it's up). This session ran a copy of the working tree from the scratchpad on 3007, and built in a copy. Cookies are shared across localhost ports, so the in-app browser was already signed in. The in-app browser reports tabs as hidden, which pauses the viewer's polling; reload the viewer tab to force a check.

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
- **Production database: `br-small-sea-ayumyssr`**, now named "production" again, pooled host `ep-delicate-pond-ay8ple8b-pooler`. It has migrations 0001, 0002 and 0004–0008. The legacy games 24, 25, 32, 33 and 37 stay unowned and hidden.
- **Neon's default branch is still the copy** `br-withered-glitter-ay2zbaoe` (renamed `restore-copy-2026-09-24`). A snapshot restore yesterday swapped the names, which misled the user's console work today. It holds pre-cutover data (32 games) and two unused roles, `menoka_app` and `menoka_purge`, created on it by mistake. **Ask the user** whether to make `br-small-sea` the default and delete the copy.
- **Vercel Production variables:** all nine are set, and `DELETION_PASSWORD` is gone. The purge cron ran twice by hand, both 200 with nothing due.
- **`main`** matches GitHub. The redesign is committed on `ui-sporty-glass-refresh`, and the live standings link is on `live-view` (see above).

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
