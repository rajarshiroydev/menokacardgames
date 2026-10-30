// Reads the repo's git-ignored env files. Values are never printed.
import { existsSync, readFileSync } from "node:fs";

export const ROOT = new URL("../../", import.meta.url);
export const TESTBED_ENV_FILE = new URL(".env.testbed.local", ROOT);

export function readEnvFile(url) {
  if (!existsSync(url)) return {};
  return Object.fromEntries(
    readFileSync(url, "utf8")
      .split("\n")
      .filter((line) => /^[A-Z_][A-Z0-9_]*=/.test(line))
      .map((line) => {
        const at = line.indexOf("=");
        return [
          line.slice(0, at),
          line.slice(at + 1).replace(/^["']|["']$/g, ""),
        ];
      }),
  );
}

export function localEnv() {
  return readEnvFile(new URL(".env.local", ROOT));
}

/** What the app needs to run against the testbed; CI passes these as secrets. */
const RUN_KEYS = [
  "TESTBED",
  "DATABASE_URL",
  "NEON_AUTH_BASE_URL",
  "NEON_AUTH_COOKIE_SECRET",
  "TESTBED_PERSONA_PASSWORD",
];

/**
 * The testbed's values: from .env.testbed.local, or, where there is no such
 * file (CI), from the environment when it says TESTBED=1.
 */
export function testbedEnv() {
  const env = readEnvFile(TESTBED_ENV_FILE);
  if (env.DATABASE_URL) return env;
  if (process.env.TESTBED === "1" && process.env.DATABASE_URL) {
    return Object.fromEntries(RUN_KEYS.map((key) => [key, process.env[key] ?? ""]));
  }
  throw new Error("No .env.testbed.local yet: run `npm run testbed:setup`");
}

/** Production credentials a testbed run must never have. */
const BLANKED = [
  "PURGE_DATABASE_URL",
  "NEON_API_KEY",
  "CRON_SECRET",
  "HEALTHCHECKS_PING_URL",
  "DELETION_PASSWORD",
  "VERCEL_OIDC_TOKEN",
  "NEXT_PUBLIC_SENTRY_DSN",
];

/**
 * The environment for running the app in testbed mode. Testbed values
 * override .env.local (Next never overwrites variables that are already set),
 * and every production-related credential is blanked so testbed mode can't
 * reach real data or real services.
 */
export function testbedRunEnv() {
  const env = { ...process.env, ...testbedEnv() };
  for (const name of BLANKED) env[name] = "";
  // .env.local is pulled from Vercel production, so it says
  // VERCEL_ENV=production; a testbed run is development (testbed mode
  // refuses production and preview).
  env.VERCEL_ENV = "development";
  env.VERCEL_TARGET_ENV = "development";
  return env;
}
