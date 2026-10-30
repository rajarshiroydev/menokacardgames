import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { PUBLIC_ROUTES, SIGNED_IN_ROUTES } from "../testbed/lib/routes.ts";

const API = fileURLToPath(new URL("../app/api/", import.meta.url));

/** Each route file under app/api, with the methods it exports. */
function routeFiles() {
  const routes = new Map<string, string[]>();
  for (const entry of readdirSync(API, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/^route\.tsx?$/.test(entry.name)) continue;
    const folder = relative(API, entry.parentPath).split(sep).join("/");
    const source = readFileSync(join(entry.parentPath, entry.name), "utf8");
    const methods = new Set<string>();
    for (const match of source.matchAll(
      /export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b/g,
    )) {
      methods.add(match[1]);
    }
    for (const match of source.matchAll(/export const \{([^}]+)\}/g)) {
      for (const name of match[1].split(",")) methods.add(name.trim());
    }
    routes.set(folder, [...methods].sort());
  }
  return routes;
}

describe("API routes and their checks (testbed/lib/routes.ts)", () => {
  it("lists every route and method, so none skips the route checks", () => {
    const listed = new Map<string, string[]>([
      ...Object.entries(SIGNED_IN_ROUTES).map(
        ([folder, route]) => [folder, [...route.methods].sort()] as [string, string[]],
      ),
      ...Object.entries(PUBLIC_ROUTES).map(
        ([folder, methods]) => [folder, [...methods].sort()] as [string, string[]],
      ),
    ]);
    const found = routeFiles();
    assert.ok(found.size >= 16, "found the route files");
    assert.deepEqual(
      Object.fromEntries([...found].sort()),
      Object.fromEntries([...listed].sort()),
    );
  });
});
