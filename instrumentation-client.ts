import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "@/lib/monitoring/sentry-options";

// Error reporting in the browser (audit step 6): uncaught errors and failed
// promises on any page, scrubbed before they leave (lib/monitoring/scrub.ts).
Sentry.init(sentryOptions());

/** Lets Sentry note page changes, so an error shows which screen it was on. */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
