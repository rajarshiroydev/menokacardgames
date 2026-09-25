/** How recently the host must have used a sign-in link to permanently delete data. */
export const RECENT_SIGN_IN_WINDOW_MS = 10 * 60_000;

/** Tolerated clock difference between the auth provider and this server. */
const CLOCK_SKEW_MS = 60_000;

/** Error code the client uses to offer a fresh sign-in link. */
export const RECENT_SIGN_IN_REQUIRED = "recent-sign-in-required";

/**
 * True when the verified session was created within the recent sign-in window.
 * Missing or unreadable timestamps are treated as not recent.
 */
export function signedInRecently(
  sessionCreatedAt: Date | string | number | null | undefined,
  now = Date.now(),
) {
  if (sessionCreatedAt === null || sessionCreatedAt === undefined) return false;
  const createdAt = new Date(sessionCreatedAt).getTime();
  if (!Number.isFinite(createdAt)) return false;
  const age = now - createdAt;
  return age >= -CLOCK_SKEW_MS && age <= RECENT_SIGN_IN_WINDOW_MS;
}
