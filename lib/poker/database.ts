import "server-only";

import { neon } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";

let database: NeonQueryFunction<false, false> | null = null;

export function getDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  database ??= neon(process.env.DATABASE_URL);
  return database;
}
