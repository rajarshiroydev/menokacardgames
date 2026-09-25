import "server-only";

import { neon } from "@neondatabase/serverless";
import type {
  NeonQueryFunction,
  NeonQueryFunctionInTransaction,
  NeonQueryInTransaction,
  QueryRows,
} from "@neondatabase/serverless";

let database: NeonQueryFunction<false, false> | null = null;

export function getDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  database ??= neon(process.env.DATABASE_URL);
  return database;
}

type AuthenticatedQueryBuilder = (
  sql: NeonQueryFunctionInTransaction<false, false>,
) => NeonQueryInTransaction[];

export async function runAsAuthenticatedUser(
  authUserId: string,
  buildQueries: AuthenticatedQueryBuilder,
) {
  const sql = getDatabase();
  const results = await sql.transaction((transaction) => [
    transaction`
      SELECT set_config(
        'app.current_auth_user_id',
        ${authUserId},
        true
      )
    `,
    ...buildQueries(transaction),
  ]);

  return results.slice(1) as QueryRows<false>[];
}
