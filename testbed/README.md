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

The sign-in page shows one **Sign in as** button per persona in testbed mode.
Two browser windows (one private) let you be two people at once.

Needs `TESTBED_NEON_API_KEY` in `.env.local`: a Neon API key scoped to the
menoka-testbed project. Scripts never print secrets. `.env.testbed.local` is
git-ignored and holds test-only values.
