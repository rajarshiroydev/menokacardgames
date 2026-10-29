import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/monitoring/sentry-options";

/**
 * Starts error reporting on the server (audit step 6). Besides uncaught
 * errors, every `console.error` is reported: the API routes catch their own
 * errors, log them that way and answer 500, so that is where server
 * failures show up.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      ...sentryOptions(),
      integrations: (defaults) => [
        ...defaults,
        Sentry.captureConsoleIntegration({ levels: ["error"] }),
      ],
    });
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(sentryOptions());
  }
}

/** Errors Next.js catches itself: in pages, route handlers, actions and the proxy. */
export const onRequestError = Sentry.captureRequestError;
