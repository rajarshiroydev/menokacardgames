/**
 * Security-relevant events, one `[security]` JSON line each in the server
 * logs (audit step 6; ASVS V16): refused cross-site requests, reached
 * limits, sign-ins that are too old, refused admin access, sign-outs of
 * every device. IDs and kinds only, never emails or names. Logged as
 * warnings, so Sentry (which reports console errors) doesn't count them.
 */
export type SecurityEvent =
  | "cross-site-request-refused"
  | "rate-limited"
  | "storage-cap-reached"
  | "recent-sign-in-required"
  | "session-too-old"
  | "admin-refused"
  | "admin-sign-in-again"
  | "signed-out-everywhere"
  | "cron-unauthorized";

export function logSecurityEvent(
  event: SecurityEvent,
  details: Record<string, string | number | boolean | null> = {},
) {
  console.warn("[security]", JSON.stringify({ event, ...details }));
}
