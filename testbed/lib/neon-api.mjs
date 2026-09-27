// Minimal Neon API client for the testbed project. Uses TESTBED_NEON_API_KEY
// from .env.local (a key scoped to the menoka-testbed project only) and never
// prints it or any password.
import { localEnv } from "./env.mjs";

/** The separate Neon project that holds only fake data (not production's). */
export const TESTBED_PROJECT_ID = "bold-firefly-91637201";

const API = `https://console.neon.tech/api/v2/projects/${TESTBED_PROJECT_ID}`;

export async function neon(method, path, body) {
  const key = localEnv().TESTBED_NEON_API_KEY;
  if (!key) {
    throw new Error(
      "TESTBED_NEON_API_KEY is missing from .env.local (a key for the menoka-testbed project)",
    );
  }
  const response = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message ?? text;
    const error = new Error(`Neon API ${method} ${path} → ${response.status}: ${message}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

/** Neon runs branch operations one at a time; wait for them to finish. */
export async function waitForOperations() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const { operations } = await neon("GET", "/operations?limit=20");
    if (operations.some((operation) => operation.status === "failed")) {
      throw new Error("A Neon operation on the testbed failed");
    }
    if (
      operations.every((operation) =>
        ["finished", "skipped", "cancelled"].includes(operation.status),
      )
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Neon operations on the testbed did not finish");
}

/** The project's default branch and its read-write compute. */
export async function testbedBranch() {
  const { branches } = await neon("GET", "/branches");
  const branch = branches.find((candidate) => candidate.default);
  if (!branch) throw new Error("The testbed project has no default branch");
  const { endpoints } = await neon("GET", `/branches/${branch.id}/endpoints`);
  const endpoint = endpoints.find((candidate) => candidate.type === "read_write");
  if (!endpoint) throw new Error("The testbed branch has no read-write compute");
  return { branch, endpoint };
}
