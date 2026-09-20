import "server-only";

import { runAsAuthenticatedUser } from "@/lib/poker/database";

import {
  type AccountLifecycleState,
  type HostAccount,
  isAuthUserId,
} from "./lifecycle";

type AccountRow = {
  id: string;
  auth_user_id: string;
  lifecycle_state: AccountLifecycleState;
  deletion_requested_at: Date | string | null;
};

function mapAccount(row: AccountRow): HostAccount {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    lifecycleState: row.lifecycle_state,
    deletionRequestedAt: row.deletion_requested_at
      ? new Date(row.deletion_requested_at).getTime()
      : null,
  };
}

export async function provisionHostAccount(authUserId: unknown) {
  if (!isAuthUserId(authUserId)) {
    throw new Error("The authenticated user has an invalid identifier");
  }

  const [result] = await runAsAuthenticatedUser(authUserId, (sql) => [
    sql`
      INSERT INTO accounts (auth_user_id)
      VALUES (${authUserId}::uuid)
      ON CONFLICT (auth_user_id) DO UPDATE
        SET auth_user_id = EXCLUDED.auth_user_id
      RETURNING
        id,
        auth_user_id,
        lifecycle_state,
        deletion_requested_at
    `,
  ]);
  const rows = result as AccountRow[];

  if (!rows[0]) throw new Error("Could not provision the host account");
  return mapAccount(rows[0]);
}
