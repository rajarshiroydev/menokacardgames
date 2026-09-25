<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project instructions

Start with `docs/HANDOFF.md` (current state and next step), then read `docs/PROJECT-MEMORY.md`, `docs/FEATURE-PLAN.md`, and `CONTEXT.md` before substantial work. The feature plan is the canonical shared planning document. Record decisions, unresolved questions, acceptance criteria and status there; plans are not implementation authorization.

## Repository map

- `app/`: Next.js pages, API handlers, styles and metadata.
- `components/poker-ledger.tsx`: UI and browser game orchestration.
- `lib/poker/game.ts`: pure rules and leaderboard calculations.
- `lib/poker/types.ts`: shared domain types; adjacent validation files enforce API input rules.
- `schema.sql`: current Postgres schema; `test/`: Node test runner suites.

## Working agreements

- Never push unless explicitly requested. Preserve paused branches and unrelated local work.
- The multi-user version, the Scoreboard redesign and the live standings link are live (2026-09-25); work happens on `main`, one reviewed step at a time. A friend network (friend requests, linking logins to players) was accepted on 2026-09-25 and is being built in reviewed steps. Update `docs/HANDOFF.md` at the end of each session.
- Production data changes (claims, migrations) need the user's go-ahead in chat for each step. Name Neon branches by ID, never by console name.
- Keep preview on port 3005 available during UI work; inspect the existing listener before starting another.
- Preserve betting, blinds, seating, rebuys, undo and session flows unless explicitly changing them.
- Never expose environment secrets or seed/test production. Database changes require versioned migrations, isolated rehearsal and rollback planning.
- Follow the plan's account isolation and ownership migration requirements. Login UI alone is not authorization; never infer ownership from names or chip size.
- Keep pure game rules separate from persistence and identity. Derive authoritative accounting values and validate inputs on the server.
- Run relevant checks: `npm run lint`, `npx tsc --noEmit`, `npm test`; run `npm run build` when build/runtime changes warrant it. Verify UI changes in the local browser. Documentation-only work needs link/diff review rather than application test reruns.
- Update project memory for durable preferences and decisions. Keep detailed feature plans in the canonical planning document.
- `docs/FEATURES.md` is the plain-language list of what the app does today. Update it in the same change whenever user-visible behaviour is added, changed or removed, including exact limits and time windows.
