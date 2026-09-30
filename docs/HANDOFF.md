# Session handoff

Updated 2026-09-30 on **`main`**. **Production runs `febdc4a`** (pushed 2026-09-30 with the user's go-ahead; the fix is `0606031`). **Stale player list after a friend accepts:** Soham signed up, sent Rajarshi a request, and Rajarshi accepted by linking the existing "Soham" player. On Soham's phone the Friends card showed Rajarshi, but Active players said 0 and Setup had no one to seat. A read-only check of production (`br-small-sea-ayumyssr`) showed the data was right: Soham's account has 1 active linked player, "Rajarshi", added at the accept (14:29:43 UTC on 2026-09-27). The cause was the client. `components/poker-ledger.tsx` loaded the player list only when the app opened and after the person's own actions, while the Friends card refetches each time it mounts. Fix: `navigate` and the back-button handler quietly reload the list when Home, Players or Setup opens (`showsPlayerList`; a quiet refresh keeps the list on screen and ignores failures). `FriendsCard` also reloads it once when a friend's `myPlayer` isn't in the list. Verified on the testbed: with Asha's page open, Ravi and then Farhan accepted through the API; Players went from 3 to 4, Setup listed Farhan, and Home showed 5, all without a reload and with no console errors. The testbed was reset and reseeded afterwards. lint, tsc and 156 tests pass. Soham can reload the app now to see Rajarshi.

Updated 2026-09-30 on **`main`**. **2026-09-30:** the user confirmed in a real game that live standings now keep updating on phones (the fix below), and set Neon's default branch to production (`br-small-sea-ayumyssr`) in the console; the agent verified it. No code changes.

Updated 2026-09-27 on **`main`**. **Production runs `d993b89`** (pushed 2026-09-27 with the user's go-ahead). It adds **odd blinds** (a small blind from ₹1 up to the big blind, kept as a share when blinds rise; stored in `blind_history`, no migration) and fixes **live standings that stopped updating on a viewer's phone** until refreshed: one hung check used to stop checking for good, so now a 1 s tick drives checks, each check is abandoned after 8 s, pageshow/focus/online also restart them, and the CDN keeps answers for 1 s with no stale-while-revalidate. Verified on the testbed with simulated hangs and lock/unlock, and confirmed by the user in a real game on 2026-09-30. The release before, `c1b0532`, adds a sun/moon theme toggle on every page, removes the back button, "Need 2+" and the seated count, and adds "Select players" and a "Seating Order" heading with an i. It also fixes the seat-drag jump, measured at 46–49 px of overshoot and now 0 (see the plan's "interface tidy-up" entry). Earlier the same day: Today's releases: timing headers and fewer database trips (`6ffc588`); the local testbed (`3ba9025`, reseeded at a quarter of its size in `17a31f7`); and the Ranks screen (`90e7fc5`, `1abce20`, `e184426`). The Ranks screen now has a green "Whose standings" dropdown ("My Hosted Games" / "X's Hosted Games"), friends' groups with the Average Return graph, shared "Average Return" and "Player Standings" headings, gold, silver and bronze top ranks, and no green subheadings on any page. All of this sits on top of `96aebbf`: the multi-user app, the Scoreboard redesign, live standings links, and the **friend network** (user codes, friend requests and group standings), all released today with the user's go-ahead. Replace this file at the end of each session; don't let it grow.

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

0. **Speed work (2026-09-27, live):** step 1 (timing headers, a single-trip account check, the user code taken from the page) is in production. Signed-out checks after the deploy passed: 401 for the APIs, 404 for a made-up live link, 403 for a cross-site POST, and the sign-in page shows only the email form. The user is now checking in production whether group standings are slow there or only on the testbed; recommended if so: load groups at app start and keep them, and merge the account check into each route's query trip. The user stays on Neon Free for budget reasons; Vercel runs in `iad1`. Open: a longer sign-in cookie cache.
   - **Small testbed (committed `3ba9025`):** separate Neon project `menoka-testbed` (`bold-firefly-91637201`), seeded with seven personas. Commands are in `testbed/README.md`; the `testbed` launch configuration runs it on 3006. The first finding (large group payloads) is in the plan's "testbed" entry.
1. **Name on first sign-in (live since 2026-09-25, `96aebbf`):** an account without a name sees a "What should friends call you?" screen before the app (`components/name-setup.tsx`, gated in `app/page.tsx`). The user checked it on the dev server as roystark24@gmail.com. The live account gets the screen on its next visit (not yet seen on production), after which the user shares their user code with friends.
2. **Friend network follow-ups (ideas, not decided):** a badge or notification for new requests (today they appear only when the Players screen opens or on Refresh); a Home tile for groups.
3. **Healthchecks.io alerts:** the check pings green but has no notification integration; the user adds email.
4. **Firewall:** "Limit API writes" is in **Log** mode since 2026-09-25. Checked 2026-09-30: clean, but Hobby shows only the past day. User decision: the day after the next game, check Firewall → Overview (Past Day), then switch it to 429 with the user's OK, send 31 quick writes and confirm "Too many requests". Friend actions are POSTs, so they count. Before the App Store launch: per-account server limits and Vercel Pro (plan entry "Rate limits and hosting for the store launch").
5. **Neon tidy-up (with the user's OK):**
   - done 2026-09-30: `br-small-sea-ayumyssr` is the default branch;
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
