// Prints the testbed's non-secret facts: IDs, hosts, roles, databases and
// Neon Auth settings. Usage: npm run testbed:inspect
import { neon, testbedBranch } from "./lib/neon-api.mjs";

const { branch, endpoint } = await testbedBranch();
console.log("branch", branch.id, branch.name, "state:", branch.current_state);
console.log(
  "endpoint",
  endpoint.id,
  endpoint.host,
  `cu ${endpoint.autoscaling_limit_min_cu}-${endpoint.autoscaling_limit_max_cu}`,
  endpoint.current_state,
);
const { roles } = await neon("GET", `/branches/${branch.id}/roles`);
console.log("roles", roles.map((role) => role.name).join(", "));
const { databases } = await neon("GET", `/branches/${branch.id}/databases`);
console.log(
  "databases",
  databases.map((database) => `${database.name} (owner ${database.owner_name})`).join(", "),
);

for (const path of ["", "/email_and_password", "/allow_localhost", "/plugins"]) {
  try {
    const data = await neon("GET", `/branches/${branch.id}/auth${path}`);
    const safe = JSON.stringify(data).replace(
      /"([a-z_]*(secret|password|key|token)[a-z_]*)":"[^"]*"/gi,
      '"$1":"***"',
    );
    console.log(`auth${path || " (integration)"}`, safe.slice(0, 600));
  } catch (error) {
    console.log(`auth${path}`, error.status ?? "", error.message.slice(0, 200));
  }
}
