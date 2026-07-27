# Poker Ledger

A mobile-first poker session tracker built with Next.js 16 and React 19.

The in-progress game is stored in the browser so a refresh does not lose the
current hand. Finished sessions use the `/api/sessions` Route Handler and can be
shared across devices through Neon Postgres.

## Local development

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

The table and in-progress game work without a database. History syncing,
finishing a session, importing, and deleting sessions require the environment
variables below.

## Environment variables

Copy `.env.example` to `.env.local`:

```text
DATABASE_URL=<pooled Neon connection string>
DELETION_PASSWORD=<long unique password>
```

Never expose these values through `NEXT_PUBLIC_` variables. Restart the
development server after changing them.

## Database

Run `schema.sql` against the target Postgres database. It creates the
`poker_sessions` table and the history ordering index.

## Checks

```bash
npm run lint
npm test
npm run build
```

## Project structure

- `app/` — App Router page, metadata, PWA manifest, styles, and sessions API
- `components/poker-ledger.tsx` — interactive ledger UI
- `lib/poker/` — game rules, shared types, and API validation
- `schema.sql` — Postgres schema for the later database connection
