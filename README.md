# Menoka Card Games

A mobile-first card-game tracker built with Next.js 16 and React 19. Poker is
the first supported game.

The in-progress game is stored in the browser so a refresh does not lose the
current hand. The shared player directory uses `/api/players`, while finished
poker sessions use `/api/sessions`. Both are shared across devices through Neon
Postgres.

## Local development

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

The table and in-progress game work without a database. The player directory,
history syncing, finishing a session, importing, and player/session lifecycle
actions require the environment variables below.

## Environment variables

Copy `.env.example` to `.env.local`:

```text
DATABASE_URL=<pooled Neon connection string>
DELETION_PASSWORD=<long unique password>
```

Never expose these values through `NEXT_PUBLIC_` variables. Restart the
development server after changing them.

Discarding and restoring players or sessions is reversible and does not require
the deletion password. Permanent deletion is available only after an item has
been discarded and requires `DELETION_PASSWORD`. Players connected to saved
session history cannot be permanently deleted.

## Database

Run `schema.sql` against the target Postgres database. It creates the
game-agnostic `players` table, the `poker_sessions` table, and the history
ordering index. Existing poker session results are linked to canonical player
IDs without removing their readable names. Discarded sessions remain stored but
are excluded from the leaderboard until restored.

## Checks

```bash
npm run lint
npm test
npm run build
```

## Project structure

- `app/` — App Router page, metadata, PWA manifest, styles, and APIs
- `components/poker-ledger.tsx` — interactive home, player, and poker UI
- `lib/poker/` — game rules, shared types, and API validation
- `schema.sql` — Postgres schema for the later database connection
