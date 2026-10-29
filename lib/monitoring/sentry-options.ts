import { scrubEvent } from "./scrub.ts";

/**
 * Sentry collects nothing about people. SDK v11 collects all of this by
 * default and no longer reads `sendDefaultPii`, so every kind is turned off
 * here. With `userInfo` off, the browser SDK also tells Sentry not to record
 * the sender's IP address (`infer_ip: "never"`). Found 2026-10-29: the first
 * test report was stored with an IP while these were left at their defaults.
 */
export const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
} as const;

/**
 * Node prints its own process warnings (such as an ExperimentalWarning on a
 * cold start) through `console.error`, which the server reports. They aren't
 * app failures. Found 2026-10-30 (POKERIZE-3, the results card route).
 */
export const IGNORED_ERRORS = [/\(node:\d+\) \w*Warning: /];

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
    dataCollection: {
      ...DATA_COLLECTION,
      httpBodies: [...DATA_COLLECTION.httpBodies],
      graphQL: { ...DATA_COLLECTION.graphQL },
      genAI: { ...DATA_COLLECTION.genAI },
      mcp: { ...DATA_COLLECTION.mcp },
    },
    ignoreErrors: [...IGNORED_ERRORS],
    // Messages (CSP warnings, a `console.error` with only text) are titled by
    // their text. With a made-up stack, Sentry names them after the minified
    // function instead: POKERIZE-6 and -7 were titled "m" (2026-10-30).
    // Errors keep their own stack.
    attachStacktrace: false,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  };
}
