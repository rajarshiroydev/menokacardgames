import "server-only";

/**
 * Testbed mode: the app runs locally against the separate menoka-testbed
 * project (`npm run testbed:dev`). Never on Vercel: the check requires the
 * testbed flag and rejects Vercel's production and preview environments, and
 * production's Neon Auth has password sign-in switched off regardless.
 */
export function testbedMode() {
  return (
    process.env.TESTBED === "1" &&
    process.env.VERCEL_ENV !== "production" &&
    process.env.VERCEL_ENV !== "preview" &&
    Boolean(process.env.TESTBED_PERSONA_PASSWORD)
  );
}

/** The shared test-only password of every persona, from .env.testbed.local. */
export function testbedPersonaPassword() {
  if (!testbedMode()) throw new Error("Not running in testbed mode");
  return process.env.TESTBED_PERSONA_PASSWORD as string;
}
