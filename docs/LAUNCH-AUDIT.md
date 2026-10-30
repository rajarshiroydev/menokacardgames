# Pre-launch audit (2026-10-29)

A read-only review of `main` at `7ff0743` before the public launch: code quality, security against **OWASP ASVS 5.0 Level 2**, and operational readiness. Nothing was changed. Fixes are proposed at the end, to be taken one reviewed step at a time.

## About the standards

- **TRL 9** (Technology Readiness Level) is a maturity scale from NASA and the EU: "actual system proven in an operational environment". It describes how proven a technology is, not how well code is written. Pokerize has run in production with real hosts since 2026-09-25, so it is already close to TRL 9 in that sense. For a consumer launch, the gaps that matter are operational: monitoring, backups, rate limits, CI and hosting plans. Those are covered below.
- **OWASP ASVS** (Application Security Verification Standard) is the right yardstick for the code. Level 2 is the recommended level for apps that hold personal data, and is the target used here. Level 3 is meant for banking, medical and similar apps.

## How it was checked

- Gates: `npx tsc --noEmit`, ESLint, `npm test`, `npm run build` (in a scratch copy), `npm audit`, `npm outdated`.
- Read every API route, the proxy, auth, session, CSRF, body-size, token, purge, admin and database helpers, and the row-level security (RLS) parts of `schema.sql`.
- Pattern scans of all code for raw SQL, HTML injection, `eval`, error leaks and browser storage.
- Response headers fetched from production (`https://www.pokerize.app`).
- Git history scanned for committed secrets.

Not done: penetration testing, checks against the production database, a line-by-line read of the 14,000-line UI component (it was pattern-scanned), and the Vercel and Neon dashboard settings (their state is taken from the project docs).

## Results of the gates

| Check | Result |
| --- | --- |
| TypeScript (strict) | Pass |
| ESLint on tracked code | Pass, no warnings |
| `npm run lint` as written | **Fails**: 2,259 errors, all in untracked local folders (see M1) |
| Unit tests | 508 of 508 pass (96 suites, 0.6 s) |
| Production build | Pass |
| `npm audit` | **14 issues: 2 critical, 5 high, 7 low** (see C1) |
| Secrets in git history | None. Only `.env.example` was ever committed |

## What is already strong

These match or exceed ASVS Level 2 and should be kept as they are.

- **Each host's data is kept apart by the database itself.** Every data table has RLS. The app connects as an unprivileged role (`menoka_app`). All 61 `SECURITY DEFINER` functions pin `search_path` and are revoked from `PUBLIC`. The only table without RLS (`app_migrations`) has no grant to the runtime role. A bug in a route can't read another host's ledger.
- **No SQL injection paths.** All queries use parameterised tagged templates; no `sql.unsafe` or string-built SQL anywhere.
- **Every API route checks the session**, and locked or deleting accounts get 423.
- **CSRF protection**: every non-GET `/api/*` request must be same-origin (`Sec-Fetch-Site`, with `Origin` as fallback). Server actions have Next's own origin check.
- **Input limits**: request bodies are read with a hard byte limit, IDs match strict patterns, and the server derives the accounting instead of trusting the device.
- **Tokens**: live and invite links use 256-bit random tokens; only their SHA-256 hash is stored; live links expire after 12 hours; token pages send `no-referrer` and `noindex`.
- **Sign-in**: magic links only, single use, 5-minute expiry, no passwords. Permanent deletion, account deletion and recovery need a sign-in within the last 10 minutes.
- **Purge job**: cron secret compared in constant time; a separate least-privilege database role; Healthchecks.io alerts.
- **Audit trail** in `audit_events` for sensitive actions, including every admin look at a person's details.
- Pure game rules are separate from persistence and identity, and are well tested.

## Findings

Severity: **Critical** = fix before launch, exploitable now. **High** = fix before launch. **Medium** = fix soon after, or before launch if cheap. **Low** = good practice.

### Critical

**C1. Next.js 16.3.5 has known critical vulnerabilities.** `npm audit` lists 11 advisories for `next` 16.0.0–16.4.0, including:

- Remote code execution in `next/og` `ImageResponse` (GHSA-vcvr-r3jv-pc5j). **The app uses it**: both results-card routes (`lib/poker/results-card-image.tsx`) draw names and titles that any signed-in person controls.
- Remote code execution and SSRF in the Image Optimization API (GHSA-2464-fhr4-w9xw, GHSA-cjq9-62q9-8jv4). The endpoint is live because `components/brand-mark.tsx` uses `next/image`.
- Denial of service through Server Actions (GHSA-p3m5-59mp-jv5r). The app has server actions (sign-out).

Also high: `sharp`, `source-map-js`, `zod` (inside `@neondatabase/auth`) and `deepmerge`.
**Fix:** upgrade `next` and `eslint-config-next` to 16.4.3, run `npm audit fix` for the rest, rerun every gate and check the card routes in the browser. ASVS V15 (dependencies).

**Status 2026-10-29: fixed and pushed.** Next.js is 16.4.3 and `sharp` and `source-map-js` are updated. 11 advisories remain, 1 critical, all inside the Neon Auth SDK's dependencies (`better-auth`, `zod`, `deepmerge`). No SDK release fixes them yet, not even 0.7.0-beta. *Corrected in step 3:* the critical one (GHSA-965c-763c-88jm) lets an attacker sign in as anyone whose email they know. It affects a Better Auth server that has magic links **and** a social or Generic OAuth provider. This app runs no Better Auth server: Neon's hosted Neon Auth does, and no Neon branch has any OAuth provider (checked 2026-10-29), so the app is not exposed. **Don't enable Google or any other social sign-in until Neon runs better-auth 1.7.7 or later.** All four high and critical ones are reviewed exceptions in `scripts/audit-exceptions.json`, to be reviewed again by 2026-11-30. See the plan entries "Next.js 16.4.3 security upgrade" and "CI pipeline".

### High

**H1. No browser security headers.** Production pages send only HSTS (without `includeSubDomains`/`preload`). Missing: `Content-Security-Policy`, `frame-ancestors`/`X-Frame-Options` (the app can be framed for clickjacking, for example over a Delete button), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. The `X-Powered-By: Next.js` header gives away the framework.
**Fix:** add `headers()` and `poweredByHeader: false` in `next.config.ts`; add a CSP with a per-request nonce set in `proxy.ts` (the inline theme script in `app/layout.tsx` needs the nonce or a hash). Start the CSP in report-only mode for a few days. ASVS V3 (web frontend), V13 (configuration).

**Status 2026-10-29: built and pushed; the CSP is report-only until enforced.** Every response now sends HSTS with `includeSubDomains`, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (camera for the app's own pages only) and `Cross-Origin-Opener-Policy`, and no longer `X-Powered-By`. Every page gets a Content Security Policy with a fresh nonce, in **report-only** mode: browsers report what it would block to `/csp-report`, which logs a `[csp]` line with tokens and query strings removed. To enforce it after a few days of clean logs, change one constant (`CSP_HEADER`). See the plan entry "security headers and report-only CSP". *2026-10-30:* Vercel Hobby keeps logs for a day and the connector can't read them, so each violation now also goes to Sentry as a warning (one issue per directive and blocked address, browser extensions left out, at most 20 an hour per server). A pass over the live pages (signed out and signed in) sent no reports. **Enforce after a week with no CSP issues in Sentry** (check from 2026-11-06). *First report, 2026-10-30 (POKERIZE-6):* `script-src` `eval` from Zod 4 inside the Neon Auth client, which runs `try { Function("") } catch` to decide whether it may compile faster parsers. Enforcing doesn't break it (it catches the refusal and uses the normal parser), but each page load would still send a report. Before enforcing, either accept that one Sentry issue or turn Zod's probe off (`jitless`) for the copy that reaches the browser. The vulnerable old Zod bundled inside the SDK may be that copy, so check which one first.

**H2. Rate limiting is effectively off.** The single Vercel Firewall rule has been in Log mode since 2026-09-25. It is keyed by IP only, covers writes only, and never limits reads, including the CPU-heavy PNG card renders. There are no per-account limits. The plan already lists per-account limits as open before the store launch.
**Fix:** switch the rule to 429 now; add per-account limits in the server for writes, card renders and friend lookups. This reverses the 2026-09-24 "no app-side counters" decision, so it needs your decision. ASVS V2 (anti-automation), V4. **Status 2026-10-29: built and released (with H3).** Per-account limits in the database: 60 writes a minute, 120 card pictures per 10 minutes, 30 friend-code lookups per 10 minutes, 25 MB of game data a day. *Correction:* the rule can't simply be switched to 429, because one host with a live link writes about 26 times a minute against its 30. It is replaced instead, by all `/api/*` except `/api/live/*` at 300 a minute per IP, which you set in Vercel. *2026-10-30:* replaced as "Limit API requests" (firewall version #2), but still in **Log** mode: on Hobby a rate-limit rule can log or deny (403); answering 429 needs Vercel Pro (the dashboard opens an upgrade dialog). You chose Log over 403 because many people on Indian mobile networks share one address, and a 403 shows a vague "Could not reach…" error. Per-account limits and Vercel's DDoS protection still block abuse.

**H3. No per-account storage quotas.** One signed-in account can create unlimited 1 MB game backups (each kept 7 days), unlimited players and unlimited saved games. A single script could fill the Neon Free plan's storage and take the app down for everyone.
**Fix:** caps in the database (for example at most 10 backups per account, sensible caps on players and games), checked in the same transaction as the write. ASVS V2 (business logic limits). **Status 2026-10-29: built and released.** 500 players, 5,000 games and 5 backups per account (the oldest backup is dropped), 25 MB of saved games a day, and a daily alert from 70% of the 1 GB plan.

**H4. No CI pipeline.** There is no `.github/` folder. Lint, types, tests and build are run by hand, and a push to `main` deploys to production straight away.
**Fix:** a GitHub Actions workflow running lint, `tsc`, tests, build and `npm audit --audit-level=high` on every push and pull request; branch protection on `main`; Dependabot or Renovate for dependency updates. ASVS V15.

**Status 2026-10-29: CI built and pushed** (`.github/workflows/ci.yml`; `npm audit` runs as `npm run audit:check`, which allows only reviewed exceptions). **Decided and done 2026-10-30:** Dependabot alerts and security-fix pull requests are on, plus one grouped update pull request a month for npm and for GitHub Actions (`.github/dependabot.yml`; the Neon Auth beta and major versions stay manual). The repository is public, so a free ruleset, "Protect main", blocks force-pushes and deletion of `main`; direct pushes work as before.

**H5. Hosting plans are not fit for a commercial launch.**

- **Vercel Hobby** is licensed for non-commercial use only. It allows one firewall rule and keeps one day of logs.
- **Neon Free**: production restore history is 6 hours (the deletion disclosure says so). There are no long-term backups, and a restore has never been rehearsed from a backup.
- **Neon's shared email sender** for sign-in links. Neon's own checklist says production needs custom SMTP. Delivery and rate limits are outside your control, and sign-in depends on it.

**Fix (your billing decision):** Vercel Pro; a paid Neon plan with at least 7 days of restore history plus a scheduled off-site `pg_dump`, with one rehearsed restore; custom SMTP (Resend, Postmark or SES) with SPF, DKIM and DMARC on `pokerize.app`. ASVS V14 (data protection), V13.

**Free part done 2026-10-30:** production is kept in the one snapshot Neon Free allows, each with a 14-day expiry, taken again before every migration (`migrations/README.md`, "Backups and restore"). A restore was rehearsed into a temporary branch: identical schema, then deleted. The September snapshot and four stale branches holding August–September copies of production data were deleted. The privacy and account deletion pages now say one backup copy is kept for up to 14 days. The rest waits for paid plans; see "Paid, for later".

### Medium

**M1. `npm run lint` fails.** ESLint scans the untracked local folders (`design_handoff_sporty_glass_redesign/`, `Menoka Card Games Redesign/`, `competition/`). The app's own code is clean, but the gate as written can't pass, so a real lint error would be lost in the noise. **Fix:** add those folders to `globalIgnores` in `eslint.config.mjs`. **Fixed 2026-10-29:** ESLint now skips whatever `.gitignore` lists, plus agent worktrees in `.claude/`, and checks exactly the 173 tracked source files.

**M2. The admin dashboard needs only a normal sign-in.** `/admin` shows every account, including emails, to anyone listed in `app_admins` with a session of any age (sessions renew for weeks). ASVS Level 2 expects stronger authentication for admin access. **Fix:** require a sign-in within the last 10 minutes for `/admin`, reusing `requireRecentHostAccount`; consider passkeys later. ASVS V6, V8. **Status 2026-10-29: fixed and pushed.** `/admin` needs an email sign-in from the last hour, with a button to email a fresh link.

**M3. No error monitoring or alerting.** Errors go only to `console.error`, and Hobby keeps a day of logs. Nobody is told when sign-in, saving or the card routes start failing, and there is no record of security events (rejected cross-site requests, repeated 401s and 423s). **Fix:** error tracking (for example Sentry) or a Vercel log drain, an uptime check on the home page and the API, and alerts on error rate. ASVS V16 (logging and error handling). **Status 2026-10-29: built and pushed; reporting starts when the Sentry keys are in Vercel.** Sentry (US) with scrubbed reports, `[security]` log lines, and `/api/health`. Set up 2026-10-29 through the connectors, with an uptime monitor on `/privacy`. The first live test showed the SDK v11 defaults let Sentry record IP addresses; the fix (`DATA_COLLECTION`) and the project's geo scrubbing rule went live 2026-10-30; reports carry no IP, location, time zone or language, and the key is active.

**M4. One 14,124-line component.** `components/poker-ledger.tsx` holds about 95 components and 219 hooks; `app/globals.css` is 8,058 lines. This makes review, testing and code-splitting hard: every screen ships in one bundle, and a change anywhere risks breaking an unrelated flow. **Fix:** split it gradually, one screen per step (Home, live game, Ranks, Friends, Profile, Settings) into their own files, with no behaviour change. Not a launch blocker. **Step 1, 2026-10-30 (committed, not pushed):** Ranks and the code it shares moved to `components/ledger/` (`ranks-view.tsx`, `leaderboard-chart.tsx`, `info-sheet.tsx`, `money.tsx`, `avatar.tsx`, `api.ts`); `poker-ledger.tsx` is 12,773 lines (from 14,236). **Step 2, 2026-10-30 (committed, not pushed):** the Games tab (`games-view.tsx`, `session-card.tsx`, `settle-up-sheet.tsx`, `results-card.tsx`, `expanding-list.tsx`) and more shared code (`icons.tsx`, `action-log.tsx`; amount inputs and helpers into `money.tsx`); `poker-ledger.tsx` is 10,922 lines. **Step 3, 2026-10-30 (committed, not pushed):** Profile (`profile-view.tsx`, `profile-sheets.tsx`), with the QR, user-code, invite and live-share sheets (`share-sheets.tsx`), confirmation prompts (`modal.tsx`) and `segmented.tsx`; `poker-ledger.tsx` is 8,351 lines. **Step 4, 2026-10-30 (committed, not pushed):** Home (`home-view.tsx`), the Play tab's chooser (`new-game-view.tsx`) and the saved-data review screens (`import-review.tsx`); `poker-ledger.tsx` is 7,385 lines. **Step 5, 2026-10-30 (committed, not pushed):** game setup (`setup-view.tsx`) and the rebuy-rule fields it shares with the live game's rebuy editor (`rebuy-rules.tsx`); `poker-ledger.tsx` is 5,864 lines. **Step 6, 2026-10-30 (committed, not pushed):** the live game, hand by hand and quick ledger, in ten modules (`game-screen.tsx`, `table-hand.tsx`, `player-row.tsx`, `hand-buttons.tsx`, `pot-winners.tsx`, `buy-in-sheets.tsx`, `game-editors.tsx`, `ledger-screen.tsx`, `hand-rankings.tsx`, `game-shared.ts`); `poker-ledger.tsx` is 2,934 lines, almost all of it the one `PokerLedger` function (2,524 lines) plus the tab bar. **What's left is different in kind:** `PokerLedger` holds the app's state, effects and handlers in one function, so splitting it means writing custom hooks, not moving whole declarations, and the line-by-line move proof no longer applies. **Planned 2026-10-30** (plan entry "splitting the big component: plan for `PokerLedger`"): a browser spec for the live game first, then the betting rules still in the component moved into `lib/poker` with unit tests, then custom hooks one area at a time. The user chose steps 0–2 for now. Step 0 (the live-game browser spec) and step 1 (the betting rules in `lib/poker/actions.ts`, 22 new unit tests) are live; step 2 (the tab bar, list of screens and device-storage readers moved out) is committed, not pushed, leaving `poker-ledger.tsx` at 2,556 lines. All three are live. Steps 3–6 are **paused** (user, 2026-10-30) until picked up again.

**M5. No automated tests for routes, pages or the full flow.** The 508 tests cover pure logic well. Nothing automatically checks that each route refuses a signed-out or another host's request, the owner-isolation SQL test is run by hand, and there is no browser test of sign-in → game → save. **Fix:** route tests for the auth and validation paths; one Playwright smoke test against the testbed, run in CI. ASVS V15. **Status 2026-10-30: built (committed, not pushed); runs in CI once you add the testbed secrets.** 55 route checks run over HTTP against the testbed (`npm run testbed:routes`), with real sign-in and row security:
- every signed-in route and method answers 401 signed out, and cross-site writes get 403;
- another host's games and players can't be read, discarded, repriced, renamed or deleted;
- bad input answers 415, 400 or 413;
- a locked account gets 423 on the ledger but can still manage itself and recover;
- the public routes behave.

`test/api-routes.test.ts` fails when a route isn't listed. A Playwright smoke test on a phone screen (`npm run testbed:e2e`) signs in, plays a hand, saves, settles up and cleans up. The CI `testbed` job runs both against a production build; the four `TESTBED_*` secrets were added 2026-10-30 and its first run passed.

**M6. Local game data stays on the device after sign-out.** The game in progress, the live link token and the device ID stay in `localStorage` after sign-out. On a shared or borrowed phone, the next person can read them. **Fix:** clear the account's keys on sign-out. ASVS V14 (client-side data). **Status 2026-10-29: fixed and pushed.** Sign-out backs up the game, then removes it and the live link from the phone. Pre-account data stays, because it may exist nowhere else.

### Low

**L1. Names allow invisible and direction-changing characters.** Display names and player names are trimmed but can contain zero-width and right-to-left override characters. Someone could pose as another person in a friend list. **Fix:** strip Unicode control and format characters (`\p{Cc}`, `\p{Cf}`) in `cleanDisplayName` and the player-name check, and normalise to NFC. ASVS V1, V2. **Status 2026-10-29: fixed and pushed.** `lib/visible-text.ts`; Bengali, Hindi and emoji joiners are kept.

**L2. Sessions have no absolute lifetime and no "sign out everywhere".** The renewal keeps a session alive for as long as it is used. Sign-out ends only the current device's session. **Fix:** a "Sign out of all devices" action in Settings (the code already calls `auth.revokeSessions()` for deletion); consider an absolute limit such as 90 days. ASVS V7. **Status 2026-10-29: fixed and pushed.** A sign-in lasts 90 days at most; Settings has Sign Out Of All Devices. Other devices can keep working for up to 5 minutes (the auth library's session cache).

**L3. The auth SDK is a beta.** `@neondatabase/auth` 0.5.0-beta is pinned; 0.7.0-beta is out, and its dependencies carry the `zod` and `better-auth` advisories. Track it and upgrade with a full rehearsal on the testbed.

**L4. No Node version pinned.** `package.json` has no `engines` field and there is no `.nvmrc`. This machine runs Node 26, and the tests rely on `--experimental-strip-types`. **Fix:** pin the version Vercel runs. **Fixed 2026-10-29:** Node 24 (Vercel's setting) in `engines` and `.nvmrc`, with `@types/node` 24 to match.

**L5. No custom error pages.** There is no `app/error.tsx`, `app/global-error.tsx` or `app/not-found.tsx`, so a rendering error shows Next's default page. **Status 2026-10-29: fixed and pushed.** Branded not-found and error pages, plus a self-contained last-resort page.

**L6. `Server-Timing` is sent in production.** It reveals how long auth and database calls take. That's harmless today; consider sending it only in development or to the admin. **Fixed 2026-10-30:** only development responses carry it; the `[timing]` log line stays.

**L7. No vulnerability disclosure contact.** Add `/.well-known/security.txt` with an email for security reports. **Status 2026-10-29: fixed and pushed.** `public/.well-known/security.txt`, renewed before 2027-10-28 (a test reminds).

### Found later

**A1. Invite tokens reached Vercel Analytics** (found 2026-10-29 during step 2). `components/web-analytics.tsx` blanked live-link tokens out of page addresses but not invite tokens (`/join/<token>`), although the privacy page says private links are blanked out. Only you can see them, in the Vercel dashboard. Invites work once and expire after 30 days, so any that reached analytics stop working on their own. **Fixed 2026-10-29:** one shared rule (`lib/security/token-paths.ts`) now blanks both kinds, for analytics and for CSP reports. Same-site referrers (such as a sign-in page address with `?invite=`) are never sent by Vercel's analytics script, so there is no second route.

## Proposed order of fixes

Each step is one reviewed change, matching the project's way of working.

| Step | Fixes | Needs from you |
| --- | --- | --- |
| 1 | C1: upgrade Next.js and audited packages | Done, pushed 2026-10-29 |
| 2 | H1: security headers and CSP (report-only first) | Built 2026-10-29; enforce the CSP after a few days of clean logs |
| 3 | H4, M1, L4: CI workflow, lint ignores, Node pin | Built 2026-10-29; branch protection and Dependabot are your call |
| 4 | H2, H3: firewall to 429, per-account limits and storage caps | Released 2026-10-29; you replace the firewall rule |
| 5 | M2, M6, L1, L2: admin step-up, clear device data on sign-out, name cleaning, sign out everywhere | Released 2026-10-29 |
| 6 | M3, L5, L7: monitoring, error pages, security.txt | Released 2026-10-29; you set up Sentry |
| 7 | H5: Vercel Pro, Neon paid plan and backups, custom SMTP | Free part done 2026-10-30 (snapshot, rehearsed restore, stale copies deleted); the rest is in "Paid, for later" |
| Later | M4, M5, L3: split the big component, route and browser tests, auth SDK upgrade | Ongoing |

## Paid, for later

Recorded 2026-10-30 (user: "proceed with the things that doesn't require additional payment ... keep them noted for future"). None of these is done; each needs your billing decision.

| Item | Why | What it replaces today |
| --- | --- | --- |
| **Vercel Pro** | Hobby is licensed for non-commercial use only. Pro also allows more firewall rules, a rate limit that answers 429 (switch "Limit API requests" from Log to Too Many Requests), longer log retention and log drains. | Hobby: one firewall rule that only logs, a day of logs. |
| **Neon paid plan** | At least 7 days of restore history, scheduled snapshots (up to 100), and enough compute to point the uptime monitor at `/api/health` (checks the database too). | One manual 14-day snapshot, 6 hours of restore history, the monitor on `/privacy`. |
| **Custom email sender** (Resend, Postmark or SES) with SPF, DKIM and DMARC on `pokerize.app` | Sign-in links from Pokerize's own address, with delivery you control. Resend's free plan (100 a day, 3,000 a month) was offered and set aside: a launch could hit the daily cap and stop sign-ins. | Neon's shared sender, "Neon Auth" <auth@mail.myneon.app>. |
| **Off-site database copy** | A copy outside Neon, for a Neon account or region failure. Comes with the paid plans above (scheduled `pg_dump` to storage you pay for). | Only Neon's own snapshot. |

## Free, still open (2026-10-30)

- **Enforce the CSP** after a week with no new CSP issues in Sentry (from 2026-11-06), deciding first about Zod's `eval` probe (H1).
- **Dependabot pull requests:** #1 moves the Neon Auth SDK to 0.7.0-beta (a security update for a low advisory); don't merge it without a full testbed rehearsal (L3). #2 (the monthly group) was merged 2026-10-30 after review: see the plan entry "Dependabot #2 merged".
- **Preview database:** `cutover-rehearsal` (`br-tiny-forest-ayt6f3fe`) is at 0012, 21 migrations behind, and holds a September copy of production data. Previews aren't used today. When they are, the cleaner fix is a new schema-only branch (no production data) with its own Neon Auth; you then set the preview `DATABASE_URL`, `NEON_AUTH_BASE_URL` and cookie secret in Vercel, and the old branch is deleted.
- **L3, the Neon Auth SDK:** 0.7.0-beta fixes none of the advisories; review the exceptions by 2026-11-30.
- **M4** (split `poker-ledger.tsx`): every screen is in its own file (steps 1–6), and steps 0–2 of the `PokerLedger` plan are done (a live-game browser spec, the betting rules in `lib/poker` with unit tests, plain moves). `poker-ledger.tsx` is 2,556 lines, all of it the `PokerLedger` function. Steps 3–6 (custom hooks) are paused (user, 2026-10-30); the plan entry "splitting the big component: plan for `PokerLedger`" says how to resume.
- **Dependabot and M5:** Dependabot's pull requests don't get Actions secrets, so their `testbed` job is skipped; add the same four as Dependabot secrets if you want them checked too.
