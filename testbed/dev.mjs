// Runs the app locally against the testbed (http://localhost:3006, or the
// port in PORT, which the preview pane sets when 3006 is taken).
// Values from .env.testbed.local override .env.local (Next never overwrites
// variables that are already set), and every production-related credential is
// blanked so testbed mode can't reach real data or real services.
// Next allows one `next dev` per folder: stop the normal dev server first.
// Usage: npm run testbed:dev
import { spawn } from "node:child_process";

import { testbedEnv } from "./lib/env.mjs";

export const TESTBED_PORT = Number(process.env.PORT) || 3006;

const BLANKED = [
  "PURGE_DATABASE_URL",
  "NEON_API_KEY",
  "CRON_SECRET",
  "HEALTHCHECKS_PING_URL",
  "DELETION_PASSWORD",
  "VERCEL_OIDC_TOKEN",
];

const env = { ...process.env, ...testbedEnv() };
for (const name of BLANKED) env[name] = "";
// .env.local is pulled from Vercel production, so it says VERCEL_ENV=production;
// this local run is development (testbed mode refuses production and preview).
env.VERCEL_ENV = "development";
env.VERCEL_TARGET_ENV = "development";

const child = spawn(
  "npx",
  ["next", "dev", "--port", String(TESTBED_PORT)],
  { env, stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 0));
