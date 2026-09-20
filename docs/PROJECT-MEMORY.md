# Project memory

Updated 2026-09-20. This repository file is durable agent memory; no external memory service is assumed.

- Read `docs/FEATURE-PLAN.md` before substantial work. It is the canonical living feature plan. Update decisions, status and future feature plans there.
- Multi-user implementation is authorized on `feature/multi-user-transition`, one reviewed step at a time. Stop and report after each step. Production rollout and historical ownership migration are not authorized yet.
- User clarified: one host account owns its own friend list and games; friends need no account. No groups, invitations or memberships in initial scope.
- Average session return including all rebuys is confirmed. Rank from the first eligible session with no provisional label; show the session count for context. This normalizes chip scale, not luck/opponents/session length.
- Current implementation branch is `feature/multi-user-transition`. Design is paused and preserved at `ui-sporty-glass-refresh`, commit `826142f`, unpushed as of this date.
- Do not push without explicit instruction. Keep local preview on port 3005 available during UI work.
- Preserve existing game rules/flows unless a requested feature changes them. Never seed production or infer old session ownership from names/stakes.
- No external persistent memory was written. Root AGENTS.md points future agents to this file and the plan.

- Follow-up: user explicitly approved average session return and host-owned guest lists. Prefer Neon Auth, verify project compatibility and confirm login methods when transitioning. Do not use a provisional label. Ask for historical session ownership rather than guessing. Ask other choices as they become relevant.
- Transition branch: `feature/multi-user-transition`. Step 1 installed project-scoped Next.js DevTools MCP in `.codex/config.toml`. Neon MCP is installed, authenticated and available.
- Step 2 uses Neon Managed Better Auth with email magic links only. Development is isolated on the Neon branch `multi-user-auth`; Magic Link is enabled there with five-minute expiry and new-user registration, and local `.env.local` targets that branch. Production Neon data/Auth and Vercel remain unchanged. The web page and poker APIs require a verified session, but owner-scoped data access is Step 3 and must be complete before deployment.
- Step 2 email authentication was verified end to end with the user's test address. Magic links return through `/auth/callback`, where the one-time verifier is exchanged server-side and secure session cookies are attached before redirecting to the ledger. Keep this callback covered by browser testing when the Neon Auth SDK changes.
- Account deletion lifecycle is confirmed for future implementation: requesting deletion immediately locks and hides the ledger and signs out/revokes access; the host can recover the account for 30 days; after the grace period, an automated purge permanently deletes the account and owned data. Provider backups expire under the documented provider schedule rather than being manually rewritten. The UI/privacy text must disclose that schedule before release.
- Next.js was patched from 16.2.12 to 16.3.5 during Step 2 to resolve the current critical production dependency advisory. Keep framework and auth SDK versions pinned and rerun the full gate when they change.
