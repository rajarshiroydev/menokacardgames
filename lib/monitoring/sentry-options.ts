import { scrubEvent } from "./scrub.ts";

/**
 * Sentry settings shared by the browser, server and edge (audit step 6, user
 * decision 2026-10-29: Sentry, US region). Reporting is on only when
 * NEXT_PUBLIC_SENTRY_DSN is set (Vercel production and preview), so local
 * runs, the testbed and CI send nothing. Errors only: no tracing, no session
 * replay, no personal data.
 */
export function sentryOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  return {
    dsn,
    enabled: Boolean(dsn),
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  };
}
