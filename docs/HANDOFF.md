# Session handoff

Updated 2026-09-25 on **`main`**. **Production now runs `13f9838`**: the multi-user app plus the Scoreboard redesign and the live standings link, released this session at the user's request. A **friend network** proposal was written in `FEATURE-PLAN.md` and is waiting for the user's answers. Replace this file at the end of each session; don't let it grow.

## Friend network (accepted 2026-09-25, building)

- Read the plan entry "2026-09-25 friend network (accepted)". **User decided this session:**
  - people connect by **friend request using an app-generated user code** (exact match only, shows just a display name);
  - on accept, **both appear in each other's friend list**;
  - a host can add players who haven't signed up; each player gets a player code the host can share;
  - linking a login to an existing player always needs **the host's approval**. Today's players join the same way, so they need no special migration.
- Host-sent invite links and the "read-only members first" phasing were dropped.
- **Round 2 answers (same session):**
  - a linked person sees the standings list of each host they're linked with;
  - removing a friend unlinks both sides;
  - request limits: 20 outgoing pending, and 7 days after a decline;
  - people can see which hosts link them and unlink themselves;
  - no combined score or screen across hosts (the user: it would only create confusion).
- **The user accepted the model** and asked to proceed. **Step 1 (identity basics) is built, uncommitted and awaiting the user's review:**
  - migration `0010_identity_codes` (user codes, display names, player codes) is applied and rehearsed on `br-little-rain-ay5fufwv` only;
  - the **You** card and player codes are on the Players screen.

  See the plan entry "friend network step 1". To release it: apply 0010 to production `br-small-sea-ayumyssr` (and the preview branch `br-tiny-forest-ayt6f3fe`) with the user's go-ahead **before** pushing the code, because the new players list reads `player_code`.
- **Next build step:** step 2, friend requests (migration 0011: requests, connections, the players' linked-account column, exact-code search by POST, accept/decline with each side's player choice, the request limits, unfriend, self-unlink).
- Each build step: versioned migration (0010, 0011, …), three-account rehearsal on `br-little-rain-ay5fufwv`, go-ahead per production step on `br-small-sea-ayumyssr`.

## Release done this session

- `main` fast-forwarded `a057ca2` → `13f9838` and pushed. Vercel production build Ready (51 s). The live sign-in page shows the redesign, with no console errors. A made-up live link returns 404 "This game has ended".
- **Phone test passed:** the user signed in on another device, played a game and scanned the live standings QR code on production. Not yet checked: the iOS share sheet, a locked host screen, CDN caching of the public GET, and the redesign's unvisited screens (locked-account page, confirmation sheets, rules sheet, blind editor, import review, winner overlay, drag by touch, iOS Safari `backdrop-filter`).
- `live-view` and `ui-sporty-glass-refresh` are fully contained in `main` and can be deleted locally and on GitHub if the user wants.

## Read first

1. This file.
2. [`PROJECT-MEMORY.md`](./PROJECT-MEMORY.md): working agreements and environment facts (branch IDs matter).
3. [`FEATURE-PLAN.md`](./FEATURE-PLAN.md): the friend network proposal and the pending register.
4. [`HISTORICAL-OWNERSHIP.md`](./HISTORICAL-OWNERSHIP.md) before any further claim.

## Where things stand

- **Live site** (https://menokacardgames.vercel.app): magic-link sign-in only. therajarshiroy@gmail.com (account `4db9f3e6-9b4b-445b-8ca3-831773acdb3c`) has 27 games and 9 players. The app connects as `menoka_app`. Pushing `main` deploys.
- **Production database: `br-small-sea-ayumyssr`** (pooled host `ep-delicate-pond-ay8ple8b-pooler`), migrations 0001, 0002, 0004–0009. The legacy games 24, 25, 32, 33 and 37 stay unowned and hidden.
- **Neon's default branch is still the copy** `br-withered-glitter-ay2zbaoe` (`restore-copy-2026-09-24`, pre-cutover data and two unused roles). Ask the user whether to make `br-small-sea-ayumyssr` the default and delete the copy.
- The dev server on 3005 uses the non-production endpoint (`ep-withered-hill`).

## Other next steps

1. **Healthchecks.io alerts:** the check pings green but has no notification integration; the user adds email.
2. **Firewall:** "Limit API writes" is in **Log** mode since 2026-09-25. Around 2026-10-02, check Firewall → Overview, switch to 429 with the user's OK, then send 31 quick writes and confirm "Too many requests".
3. **Neon tidy-up (with the user's OK):** default branch; possibly delete `restore-copy-2026-09-24`, `claim-test-throwaway`, `vercel-preview`; keep `cutover-rehearsal` while Preview uses it. The only snapshot `snap-sparkling-sun-aykr4j1y` is pre-migration.
4. **Later claims** when those hosts sign in (the user supplies emails): Emon-led group `ARRAY[32,33,37]` with friends `Emon, Abhirup, Supratik, Ashish`; Rahul Basak `ARRAY[24,25]` with friends `Rahul Basak, Ashit, Rana`. Run `public.claim_reviewed_history(...)` on `br-small-sea-ayumyssr` with the decision text from `HISTORICAL-OWNERSHIP.md`. The friend network may change how these hosts join; discuss it with the proposal.
5. Possibly: pilot with a second, unrelated host (plan's release step 6).

## Rollback (only with the user's decision)

- **This release** is code only; Vercel Instant Rollback to the `a057ca2` deployment works (0009 is harmless to the old code).
- **A full multi-user rollback** still means restoring the pre-migration snapshot onto `br-small-sea-ayumyssr`, pointing Production `DATABASE_URL` back to the owner, and rolling back to `519f72c`. It loses everything created since the cutover.

## Session gotchas

- **Always name Neon branches by ID** and have the user check the branch selector.
- **Connection strings:** have the user assemble them in TextEdit on one line. Redact logs before quoting them.
- The agent never handles secret values. The user runs `openssl rand -hex 32 | tr -d '\n' | pbcopy` and pastes.
- The Vercel connector's env and deployment listings return 403. Read the Vercel pages in the in-app browser instead (Deployments shows status and build time).
- Next 16 allows one `next dev` per folder. When another chat holds 3005, run a copy of the working tree on another port (see `PROJECT-MEMORY.md`). The in-app browser reports tabs as hidden, which pauses the live viewer's polling; reload the viewer tab.
- The untracked `design_handoff_sporty_glass_redesign/` fails lint. Lint tracked files with `npx eslint $(git ls-files '*.ts' '*.tsx' '*.mjs')`.
- Report each step in simple language, and ask before committing.
