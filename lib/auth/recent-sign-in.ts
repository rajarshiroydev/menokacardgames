/** How recently the host must have used a sign-in link to permanently delete data. */
export const RECENT_SIGN_IN_WINDOW_MS = 10 * 60_000;

/** How recently an admin must have used a sign-in link to open /admin (user decision 2026-10-29). */
export const ADMIN_SIGN_IN_WINDOW_MS = 60 * 60_000;

/**
 * How long a sign-in lasts at most, however often it is used (user decision
 * 2026-10-29). Neon Auth keeps extending a session that is used; after this
 * the app treats it as signed out, and a new email link starts a new one.
 */
export const MAX_SESSION_AGE_MS = 90 * 24 * 60 * 60_000;

/** Tolerated clock difference between the auth provider and this server. */
const CLOCK_SKEW_MS = 60_000;

/** Error code the client uses to offer a fresh sign-in link. */
export const RECENT_SIGN_IN_REQUIRED = "recent-sign-in-required";

function timeOf(value: Date | string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * True when the verified session was created within `windowMs` (by default
 * the window for permanent deletion). Missing or unreadable timestamps are
 * treated as not recent.
 */
export function signedInRecently(
  sessionCreatedAt: Date | string | number | null | undefined,
  now = Date.now(),
  windowMs = RECENT_SIGN_IN_WINDOW_MS,
) {
  const createdAt = timeOf(sessionCreatedAt);
  if (createdAt === null) return false;
  const age = now - createdAt;
  return age >= -CLOCK_SKEW_MS && age <= windowMs;
}

/**
 * True when the session is older than MAX_SESSION_AGE_MS. An unreadable
 * timestamp is not treated as expired: a change in the auth library must not
 * sign every person out with no way back in.
 */
export function sessionTooOld(
  sessionCreatedAt: Date | string | number | null | undefined,
  now = Date.now(),
) {
  const createdAt = timeOf(sessionCreatedAt);
  return createdAt !== null && now - createdAt > MAX_SESSION_AGE_MS;
}
