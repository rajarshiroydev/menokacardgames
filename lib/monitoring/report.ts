import * as Sentry from "@sentry/nextjs";

/**
 * Logs an error and sends it to Sentry when reporting is on (a no-op
 * otherwise). For errors the app catches and shows a screen for, such as
 * the error pages; uncaught ones are reported by Sentry itself.
 */
export function reportError(error: unknown) {
  console.error(error);
  Sentry.captureException(error);
}
