# Testbed

The real app, run locally against a separate Neon project (`menoka-testbed`,
`bold-firefly-91637201`) that holds only fake data. Production and preview are
never touched. Plan and decisions: `docs/FEATURE-PLAN.md`, entry "testbed".

| Command | What it does |
| --- | --- |
| `npm run testbed:setup` | Builds or refreshes the project: roles, schema (`schema.sql` on an empty database, then newer migrations), Neon Auth with password sign-in, and `.env.testbed.local`. Rerun it after adding a migration. |
| `npm run testbed:dev` | Runs the app on http://localhost:3006 in testbed mode. Stop the normal dev server first (one `next dev` per folder). In the preview pane it's the `testbed` launch configuration. |
| `npm run testbed:seed` | Creates the personas in `lib/testbed/personas.ts` with their players, games and friend requests, through the app's own API. Needs `testbed:dev` running. |
| `npm run testbed:reset` | Empties all app data and sign-ins, so the seed can run again. |
| `npm run testbed:inspect` | Prints the project's IDs, roles and auth settings (no secrets). |
| `npm run testbed:start` | Builds and serves the app in production mode in testbed mode on http://localhost:3006, as CI does (`--no-build` serves the last build). In the preview pane it's the `testbed-start` launch configuration. |
| `npm run testbed:routes` | Route checks (audit M5): every API route signed out, from another site, as another host, with bad input and while locked. Needs the testbed app running. About 35 seconds. |
| `npm run testbed:e2e` | Browser tests (Playwright, phone screen), as Bikram. `smoke.spec.ts`: play a hand, save, settle up and delete the game; a live link ends when its game is discarded on another phone. `live-game.spec.ts` (the regression suite for refactoring `PokerLedger`): side pots, rebuys, add and cash out, blind plan and rebuy rules, a split pot, undo, the Table view, backups reaching the server and going on discard, and a quick ledger. Each test discards its games. Needs the testbed app running and, once, `npx playwright install chromium`. |
| `npm run testbed:ci-secrets` | Copies the four values CI needs from `.env.testbed.local` into GitHub Actions secrets, without printing them. You run it, signed in to `gh`. |

`testbed/lib/routes.ts` lists every API route; `test/api-routes.test.ts` (part
of `npm test`) fails when a route file is missing from it, so a new route
can't skip the checks. In CI the `testbed` job runs both suites against a
production build once the secrets exist; it uploads no traces or reports,
because the repository is public and they would hold test sessions' cookies.

If `testbed:dev` reloads the page over and over after packages change, the
dev cache in `.next/dev` is stale: stop the server, move `.next/dev` aside and
start again.

The sign-in page shows one **Sign in as** button per persona in testbed mode.
Two browser windows (one private) let you be two people at once.

Needs `TESTBED_NEON_API_KEY` in `.env.local`: a Neon API key scoped to the
menoka-testbed project. Scripts never print secrets. `.env.testbed.local` is
git-ignored and holds test-only values.
