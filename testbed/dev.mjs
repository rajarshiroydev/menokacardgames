// Runs the app locally against the testbed (http://localhost:3006, or the
// port in PORT, which the preview pane sets when 3006 is taken), with
// production credentials blanked (testbedRunEnv in lib/env.mjs).
// Next allows one `next dev` per folder: stop the normal dev server first.
// Usage: npm run testbed:dev
import { spawn } from "node:child_process";

import { testbedRunEnv } from "./lib/env.mjs";

export const TESTBED_PORT = Number(process.env.PORT) || 3006;

const child = spawn(
  "npx",
  ["next", "dev", "--port", String(TESTBED_PORT)],
  { env: testbedRunEnv(), stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 0));
