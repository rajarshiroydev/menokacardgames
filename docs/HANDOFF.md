# Session handoff

Updated 2026-09-25 on **`main`**. **Production runs `244611c`**: the multi-user app, the Scoreboard redesign, live standings links, and the **friend network** (user codes, friend requests and group standings), all released today with the user's go-ahead. Replace this file at the end of each session; don't let it grow.

## What shipped today

- **Redesign + live standings** (`13f9838`). The user's phone test on production passed.
- **Friend network:**
  - **Step 1** (`283d0f2`, migration 0010): user codes, display names and player codes.
  - **Step 2** (`34a66e8`, 0011): friend requests. Links and friendships change only through checked database functions.
  - **Step 3** (`244611c`, 0012): group standings. The server ranks a linked host's games and sends only the rows; they show on the Ranks screen.
  - Details are in `FEATURE-PLAN.md` (entries "friend network (accepted)", "step 1/2/3" and "release") and in `FEATURES.md` section 20.
- **Production database `br-small-sea-ayumyssr`:** migrations 0001, 0002 and 0004–0012. After the release: 1 account, 24 players (9 owned), 27 owned games, 82 results, and no links or friendships yet.
- **Not yet checked on production while signed in:** the You and Friends cards and the Ranks choice. They were checked on the preview (`br-tiny-forest-ayt6f3fe`, where Debraj Test and Saheb are the host's friends) and on the dev branch. Also unchecked: copying codes on a real phone, the iOS share sheet, a locked host screen, CDN caching of the public live GET, and the redesign's unvisited screens (locked-account page, confirmation sheets, rules sheet, blind editor, import review, winner overlay, drag by touch, iOS Safari `backdrop-filter`).

## Next steps

1. **Name on first sign-in (committed on `main`, not pushed):** an account without a name sees a "What should friends call you?" screen before the app (`components/name-setup.tsx`, gated in `app/page.tsx`). The user checked it on the dev server as roystark24@gmail.com. Pushing `main` releases it (with the user's go-ahead); the live account then gets the screen on its next visit, after which the user shares their user code with friends.
2. **Friend network follow-ups (ideas, not decided):** a badge or notification for new requests (today they appear only when the Players screen opens or on Refresh); a Home tile for groups.
3. **Healthchecks.io alerts:** the check pings green but has no notification integration; the user adds email.
4. **Firewall:** "Limit API writes" is in **Log** mode since 2026-09-25. Around 2026-10-02, check Firewall → Overview, switch it to 429 with the user's OK, then send 31 quick writes and confirm "Too many requests". Friend actions are POSTs, so they count.
5. **Neon tidy-up (with the user's OK):**
   - make `br-small-sea-ayumyssr` the default branch (the default is still the copy `br-withered-glitter-ay2zbaoe`);
   - consider deleting `restore-copy-2026-09-24`, `claim-test-throwaway` and `vercel-preview`;
   - keep `cutover-rehearsal` (`br-tiny-forest-ayt6f3fe`) while the preview uses it. It now holds the test accounts Debraj Test and Saheb.
6. **Later claims** when those hosts sign in: the Emon-led group gets `ARRAY[32,33,37]` and Rahul Basak `ARRAY[24,25]`. See `HISTORICAL-OWNERSHIP.md`; afterwards they can connect as friends.
7. **Branches:** `live-view` now matches `main` and served as the preview branch today; `ui-sporty-glass-refresh` is contained in `main`. Deleting either needs the user's OK, and a new preview branch needs its domain trusted in the preview's Neon Auth.

## Read first

1. This file.
2. [`PROJECT-MEMORY.md`](./PROJECT-MEMORY.md): working agreements and environment facts (branch IDs matter).
3. [`FEATURE-PLAN.md`](./FEATURE-PLAN.md): the friend network entries and the pending register.
4. [`HISTORICAL-OWNERSHIP.md`](./HISTORICAL-OWNERSHIP.md) before any further claim.

## Rollback (only with the user's decision)

- **Friend network code:** Vercel Instant Rollback to the `13f9838` deployment works, because 0010–0012 are additive. The migrations' own rollback SQL is in `migrations/README.md`; it loses codes, names, friendships and links, and leaves games untouched.
- **A full multi-user rollback** still means restoring the pre-migration snapshot onto `br-small-sea-ayumyssr` and pointing `DATABASE_URL` back to the owner. It loses everything since the cutover.

## Session gotchas

- **Always name Neon branches by ID.** Migrations go through the Neon MCP as the owner (`run_sql_transaction`, statements from `node scripts/split-migration.mjs`). Today the agent's SQL was allowed on the preview branch too.
- **Rehearse as `menoka_app`** with a `DO` block that ends in `RAISE EXCEPTION`, run by a Node script that reads `.env.local` (see `MIGRATION-REHEARSALS.md`). To play a second person in the browser, create a fixture account as the owner and call the friend functions after `set_config('app.current_auth_user_id', …, true)`. Delete fixtures afterwards.
- **Next 16 allows one `next dev` per folder.** When another chat holds 3005, rsync the tree to the scratchpad, add a temporary `dev-copy` entry (port 3007) to `.claude/launch.json`, and revert it afterwards. Live reloads send the page back to Home.
- **Preview sign-in** trusts only the `live-view` preview domain: `git push origin main:live-view` gives a preview without touching production. Vercel protects preview URLs with a Vercel login.
- **Secrets:** the agent never handles secret values. Connection strings are assembled by the user in TextEdit on one line.
- **Vercel:** the connector's env and deployment listings return 403, so read the Vercel pages in the in-app browser.
- **Lint:** the untracked `design_handoff_sporty_glass_redesign/` fails lint. Lint tracked files with `npx eslint $(git ls-files '*.ts' '*.tsx' '*.mjs')`.
- Report each step in simple language, and ask before committing.
