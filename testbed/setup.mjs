// Builds (or refreshes) the testbed in the separate `menoka-testbed` Neon
// project: app roles created with SQL like production's, the current schema
// (schema.sql, then any newer migrations), Neon Auth with password sign-in, and a
// git-ignored .env.testbed.local. Safe to rerun; prints no secrets.
// Usage: npm run testbed:setup
import { randomBytes } from "node:crypto";
import { chmodSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

import { neon as neonSql } from "@neondatabase/serverless";

import { readEnvFile, ROOT, TESTBED_ENV_FILE } from "./lib/env.mjs";
import { neon, testbedBranch, waitForOperations } from "./lib/neon-api.mjs";
import { splitSql } from "./lib/split-sql.mjs";

const DATABASE = "neondb";
const OWNER_ROLE = "neondb_owner";
const APP_ROLE = "menoka_app";
const PURGE_ROLE = "menoka_purge";

const { branch, endpoint } = await testbedBranch();
console.log("Testbed branch", branch.id, "compute", endpoint.host);

function connectionString(role, password, host) {
  return `postgresql://${role}:${encodeURIComponent(password)}@${host}/${DATABASE}?sslmode=require`;
}
async function resetPassword(role) {
  const { role: updated } = await neon(
    "POST",
    `/branches/${branch.id}/roles/${role}/reset_password`,
  );
  await waitForOperations();
  return updated.password;
}

const ownerPassword = await resetPassword(OWNER_ROLE);
const owner = neonSql(connectionString(OWNER_ROLE, ownerPassword, endpoint.host));

// 1. Runtime roles, created with SQL as in migrations/README.md so they are
// plain logins (Neon's API would make them neon_superuser members). Each gets
// a random password nobody sees; the API then resets it to one we store.
for (const role of [APP_ROLE, PURGE_ROLE]) {
  const [{ exists }] = await owner`
    SELECT count(*)::int AS exists FROM pg_roles WHERE rolname = ${role}
  `;
  if (!exists) {
    await owner.query(
      `CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
    );
    await owner.query(
      `DO $$ BEGIN EXECUTE format('ALTER ROLE ${role} WITH PASSWORD %L', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')); END $$`,
    );
    console.log("Created role", role);
  }
}

// 2. Neon Auth for this project, before the migrations that mention it.
let authIntegration;
try {
  authIntegration = await neon("GET", `/branches/${branch.id}/auth`);
} catch (error) {
  if (error.status !== 404) throw error;
  await neon("POST", `/branches/${branch.id}/auth`, {
    auth_provider: "better_auth",
    database_name: DATABASE,
  });
  await waitForOperations();
  authIntegration = await neon("GET", `/branches/${branch.id}/auth`);
}
console.log("Neon Auth", authIntegration.base_url);
await neon("PATCH", `/branches/${branch.id}/auth/email_and_password`, {
  enabled: true,
  disable_sign_up: false,
  require_email_verification: false,
  send_verification_email_on_sign_up: false,
  send_verification_email_on_sign_in: false,
});
// Fake addresses can't receive links, so the testbed sends no email at all.
await neon("PATCH", `/branches/${branch.id}/auth/plugins/magic-link`, {
  enabled: false,
});
await neon("PATCH", `/branches/${branch.id}/auth/allow_localhost`, {
  allow_localhost: true,
});
console.log("Password sign-in on, magic links off, localhost allowed");

// 3. Schema. The numbered migrations assume the tables that predate them, so
// an empty database starts from schema.sql (the full current schema) and
// records every migration as applied; later reruns apply only new migrations.
const migrationsDir = new URL("migrations/", ROOT);
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d{4}_.*\.sql$/.test(name))
  .sort();
async function runFile(url) {
  const statements = splitSql(readFileSync(url, "utf8"));
  await owner.transaction(statements.map((statement) => owner.query(statement)));
  return statements.length;
}
const [{ built }] = await owner`
  SELECT count(*)::int AS built FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'accounts'
`;
if (!built) {
  const count = await runFile(new URL("schema.sql", ROOT));
  for (const file of migrationFiles) {
    await owner`
      INSERT INTO app_migrations (version) VALUES (${file.replace(/\.sql$/, "")})
      ON CONFLICT (version) DO NOTHING
    `;
  }
  console.log(`Applied schema.sql (${count} statements); migrations recorded`);
}
const applied = new Set(
  (await owner`SELECT version FROM app_migrations`).map((row) => row.version),
);
for (const file of migrationFiles) {
  if (applied.has(file.replace(/\.sql$/, ""))) continue;
  const count = await runFile(new URL(file, migrationsDir));
  console.log("Applied", file, `(${count} statements)`);
}

// 4. Credentials that exist only in this project. The cookie secret and the
// personas' shared password survive reruns, so seeded accounts keep working.
const previous = readEnvFile(TESTBED_ENV_FILE);
const appPassword = await resetPassword(APP_ROLE);
const pooledHost = endpoint.host.replace(endpoint.id, `${endpoint.id}-pooler`);
const lines = [
  "# Written by `npm run testbed:setup`. Test-only values for the menoka-testbed project.",
  "TESTBED=1",
  `TESTBED_BRANCH_ID=${branch.id}`,
  `DATABASE_URL=${connectionString(APP_ROLE, appPassword, pooledHost)}`,
  `TESTBED_OWNER_DATABASE_URL=${connectionString(OWNER_ROLE, ownerPassword, endpoint.host)}`,
  `NEON_AUTH_BASE_URL=${authIntegration.base_url}`,
  `NEON_AUTH_COOKIE_SECRET=${previous.NEON_AUTH_COOKIE_SECRET || randomBytes(32).toString("base64url")}`,
  `TESTBED_PERSONA_PASSWORD=${previous.TESTBED_PERSONA_PASSWORD || randomBytes(18).toString("base64url")}`,
  "",
];
writeFileSync(TESTBED_ENV_FILE, lines.join("\n"));
chmodSync(TESTBED_ENV_FILE, 0o600);
console.log("Wrote .env.testbed.local (values not shown)");
