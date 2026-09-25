// Neon Auth settings for one branch through the Neon API.
// Usage: node scripts/neon-auth.mjs <branchId> get | harden | add-domain <https://origin> | no-localhost
// Reads NEON_API_KEY from the repo's .env.local and never prints it.
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "")]),
);
const key = env.NEON_API_KEY;
const project = "wispy-morning-76468301";
const [branch, action] = process.argv.slice(2);
const base = `https://console.neon.tech/api/v2/projects/${project}/branches/${branch}/auth`;
async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  console.log(method, path, res.status, text.replace(/"(client_secret|password|secret[^"]*)":"[^"]*"/g, '"$1":"***"'));
}
if (action === "get") {
  await call("GET", "/plugins");
  await call("GET", "/email_and_password");
  await call("GET", "/oauth_providers");
  await call("GET", "/allow_localhost");
  await call("GET", "/domains");
} else if (action === "add-domain") {
  await call("POST", "/domains", { domain: process.argv[4], auth_provider: "better_auth" });
  await call("GET", "/domains");
} else if (action === "no-localhost") {
  await call("PATCH", "/allow_localhost", { allow_localhost: false });
  await call("GET", "/allow_localhost");
} else if (action === "harden") {
  await call("PATCH", "/email_and_password", { enabled: false, disable_sign_up: true });
  await call("PATCH", "/plugins/magic-link", { enabled: true, expires_in: 5, disable_sign_up: false });
  await call("PATCH", "/config", { name: "Menoka Card Games" });
  await call("GET", "/plugins");
}
