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

export function testbedEnv() {
  const env = readEnvFile(TESTBED_ENV_FILE);
  if (!env.DATABASE_URL) {
    throw new Error("No .env.testbed.local yet: run `npm run testbed:setup`");
  }
  return env;
}
