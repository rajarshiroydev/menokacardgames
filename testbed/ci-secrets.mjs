// Copies the testbed's values from .env.testbed.local into this repository's
// GitHub Actions secrets, for the CI testbed job (audit M5). Values go to
// `gh secret set` on stdin and are never printed. Only test data is
// reachable with them: the app's own database role on the separate
// menoka-testbed project, its Neon Auth, and the personas' shared password.
// Run it yourself, signed in to gh: npm run testbed:ci-secrets
import { spawnSync } from "node:child_process";

import { testbedEnv } from "./lib/env.mjs";

const SECRETS = {
  TESTBED_DATABASE_URL: "DATABASE_URL",
  TESTBED_NEON_AUTH_BASE_URL: "NEON_AUTH_BASE_URL",
  TESTBED_NEON_AUTH_COOKIE_SECRET: "NEON_AUTH_COOKIE_SECRET",
  TESTBED_PERSONA_PASSWORD: "TESTBED_PERSONA_PASSWORD",
};

const env = testbedEnv();
for (const [secret, key] of Object.entries(SECRETS)) {
  if (!env[key]) throw new Error(`${key} is missing from .env.testbed.local`);
  const result = spawnSync("gh", ["secret", "set", secret], {
    input: env[key],
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Set ${Object.keys(SECRETS).length} testbed secrets for GitHub Actions.`);
