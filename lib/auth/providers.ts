import "server-only";

import { testbedMode } from "@/lib/testbed/server";

/**
 * Whether the sign-in page offers "Continue with Google". Google must also be
 * set up as a provider on that Neon branch's Auth, with our own Google client
 * (FEATURE-PLAN.md, "Google and Apple sign-in: plan"). On for the testbed,
 * where `npm run testbed:setup` keeps it; elsewhere only when
 * `GOOGLE_SIGN_IN=on`, set per environment once that branch has Google.
 */
export function googleSignInEnabled() {
  return testbedMode() || process.env.GOOGLE_SIGN_IN === "on";
}
