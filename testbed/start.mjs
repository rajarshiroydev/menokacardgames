// Builds and serves the app in production mode against the testbed, the way
// CI runs the route checks and the browser test (audit M5). Same environment
// as testbed:dev (testbedRunEnv), so production credentials stay blank.
// Usage: npm run testbed:start (pass --no-build to serve an existing build)
import { spawnSync, spawn } from "node:child_process";

import { testbedRunEnv } from "./lib/env.mjs";

const port = Number(process.env.PORT) || 3006;
const env = testbedRunEnv();

if (!process.argv.includes("--no-build")) {
  const build = spawnSync("npx", ["next", "build"], { env, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const child = spawn("npx", ["next", "start", "--port", String(port)], {
  env,
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 0));
