/**
 * Every API route and the methods it answers (pre-launch audit M5). The
 * route checks (testbed/routes.test.ts) call each signed-in one signed out,
 * from another site and as the wrong account; a unit test
 * (test/api-routes.test.ts) fails when a route file is missing here, so a new
 * route can't skip the checks.
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Routes behind sign-in, keyed by their folder under app/api, with an address to call. */
export const SIGNED_IN_ROUTES: Record<string, { path: string; methods: HttpMethod[] }> = {
  account: { path: "/api/account", methods: ["GET", "POST"] },
  friends: { path: "/api/friends", methods: ["GET", "POST"] },
  "game-backups": {
    path: "/api/game-backups?deviceId=route-check&gameId=route-check",
    methods: ["GET", "PUT", "POST", "DELETE"],
  },
  groups: { path: "/api/groups", methods: ["GET"] },
  "groups/card": { path: "/api/groups/card?host=route-check&date=1", methods: ["GET"] },
  invites: { path: "/api/invites", methods: ["POST"] },
  live: { path: "/api/live", methods: ["POST", "PUT", "DELETE"] },
  players: { path: "/api/players?id=route-check", methods: ["GET", "POST", "PATCH", "DELETE"] },
  profile: { path: "/api/profile", methods: ["GET"] },
  sessions: {
    path: "/api/sessions?id=route-check",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  },
  "sessions/[id]/card": { path: "/api/sessions/route-check/card", methods: ["GET"] },
  "sessions/[id]/log": { path: "/api/sessions/route-check/log", methods: ["GET"] },
};

/** Routes open without the app's sign-in; each has its own checks. */
export const PUBLIC_ROUTES: Record<string, HttpMethod[]> = {
  // Neon Auth's own endpoints (sign-in links, sessions).
  "auth/[...path]": ["GET", "POST"],
  // The daily purge, behind the cron secret.
  "cron/purge-accounts": ["GET"],
  health: ["GET"],
  // Live standings, behind a 256-bit link token.
  "live/[token]": ["GET"],
};

export function isMutating(method: HttpMethod) {
  return method !== "GET";
}
