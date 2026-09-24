# Menoka Card Games

A mobile-first card-game tracker built with Next.js 16 and React 19. Poker is
the first supported game.

Each host signs in with an email magic link (Neon Auth) and gets a private
ledger: their own friend list, saved sessions and standings. Friends are names
in the host's list and do not need accounts. The in-progress game is kept in
the browser, scoped to the signed-in account, so a refresh does not lose the
current hand. Players and finished sessions are stored in Neon Postgres through
`/api/players` and `/api/sessions`, protected by server-side ownership checks
and row-level security.

## Local development

```bash
npm install
npm run dev
```

Then open [http://localhost:3005](http://localhost:3005). The Claude preview
configuration in `.claude/launch.json` uses the same port.

## Environment variables

Copy `.env.example` to `.env.local`:

```text
DATABASE_URL=<Neon connection string for the restricted menoka_app role>
NEON_AUTH_BASE_URL=<Neon Auth endpoint for the same branch>
NEON_AUTH_COOKIE_SECRET=<random secret, at least 32 characters>
```

Never expose these values through `NEXT_PUBLIC_` variables. Restart the
development server after changing them. Use an isolated Neon branch for
development; never point local development at production.

Discarding and restoring players or sessions is reversible. Permanent deletion
is available only after an item has been discarded, only for the host's own
data, and only within 10 minutes of signing in with a magic link. Otherwise the
app offers to email a fresh sign-in link. Players connected to saved session
history cannot be permanently deleted.

## Database

`schema.sql` is the complete current schema for reference and new databases.
Existing databases change only through the versioned files in `migrations/`,
rehearsed on an isolated branch first; see `migrations/README.md`.

## Checks

```bash
npm run lint
npm test
npm run build
```

## Project structure

- `app/` — App Router pages, auth callback, metadata, PWA manifest, styles and APIs
- `components/poker-ledger.tsx` — interactive home, player, and poker UI
- `lib/poker/` — game rules, standings, accounting, shared types and API validation
- `lib/auth/`, `lib/accounts/` — sign-in, recent sign-in checks and account lifecycle
- `migrations/` — versioned database migrations and data backfills
- `schema.sql` — complete current Postgres schema
- `test/` — Node test runner suites

## Planning and project context

- [Session handoff](docs/HANDOFF.md) — where work stopped and what comes next.
- [Feature list](docs/FEATURES.md) — plain-language list of everything the app does today.
- [Feature plan](docs/FEATURE-PLAN.md) — ongoing roadmap, multi-user transition, ranking decisions and acceptance criteria.
- [Project memory](docs/PROJECT-MEMORY.md) — durable working agreements and current decisions.
- [Domain glossary](CONTEXT.md) — shared terminology.
- [Agent instructions](AGENTS.md) — repository workflow and verification guidance.
