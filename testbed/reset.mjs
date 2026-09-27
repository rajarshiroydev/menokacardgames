// Empties the testbed (all app data and all sign-in identities) so
// `npm run testbed:seed` can start again. Refuses unless the database it is
// about to empty is the menoka-testbed project's compute.
// Usage: npm run testbed:reset
import { neon as neonSql } from "@neondatabase/serverless";

import { testbedEnv } from "./lib/env.mjs";
import { testbedBranch } from "./lib/neon-api.mjs";

const env = testbedEnv();
const { endpoint } = await testbedBranch();
const host = new URL(env.TESTBED_OWNER_DATABASE_URL).hostname;
if (host !== endpoint.host) {
  throw new Error("TESTBED_OWNER_DATABASE_URL is not the testbed's database; stopping");
}

const owner = neonSql(env.TESTBED_OWNER_DATABASE_URL);
const tables = (
  await owner`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> 'app_migrations'
  `
).map((row) => `public."${row.tablename}"`);
await owner.transaction([
  owner.query(`TRUNCATE ${tables.join(", ")} CASCADE`),
  // Sessions and linked credentials cascade from the user rows.
  owner.query(`DELETE FROM neon_auth."user"`),
]);
console.log(`Emptied ${tables.length} app tables and all testbed sign-ins`);
