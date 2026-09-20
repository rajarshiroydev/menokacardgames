# Project memory

Updated 2026-09-20. This repository file is durable agent memory; no external memory service is assumed.

- Read `docs/FEATURE-PLAN.md` before substantial work. It is the canonical living feature plan. Update decisions, status and future feature plans there.
- Current work is planning only. No auth, schema or ranking implementation authorized yet.
- User clarified: one host account owns its own friend list and games; friends need no account. No groups, invitations or memberships in initial scope.
- Average session return including all rebuys is confirmed. Rank from the first eligible session with no provisional label; show the session count for context. This normalizes chip scale, not luck/opponents/session length.
- Current branch is main. Design is paused and preserved at `ui-sporty-glass-refresh`, commit `826142f`, unpushed as of this date.
- Do not push without explicit instruction. Keep local preview on port 3005 available during UI work.
- Preserve existing game rules/flows unless a requested feature changes them. Never seed production or infer old session ownership from names/stakes.
- No external persistent memory was written. Root AGENTS.md points future agents to this file and the plan.

- Follow-up: user explicitly approved average session return and host-owned guest lists. Prefer Neon Auth, verify project compatibility and confirm login methods when transitioning. Do not use a provisional label. Ask for historical session ownership rather than guessing. Discuss account deletion/backup retention with the user during the Neon login transition; their expectation of mostly unchanged behavior is not a finalized retention policy. Ask other choices as they become relevant.
- Transition branch: `feature/multi-user-transition`. Step 1 installed project-scoped Next.js DevTools MCP in `.codex/config.toml`. Neon MCP was already installed globally and enabled; a Codex restart/authentication may be required before its tools are available in a task.
