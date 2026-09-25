import "server-only";

import { runAsAuthenticatedUser } from "@/lib/poker/database";

import {
  DELETION_GRACE_PERIOD_DAYS,
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

/**
 * Locks an active account for deletion and records the request. Returns null
 * when the account was not active, so repeated requests change nothing.
 */
export async function requestAccountDeletion(authUserId: string) {
  const [updated] = await runAsAuthenticatedUser(authUserId, (sql) => [
    sql`
      WITH requested AS (
        UPDATE accounts
        SET lifecycle_state = 'deletion_requested', updated_at = now()
        WHERE auth_user_id = ${authUserId}::uuid
          AND lifecycle_state = 'active'
        RETURNING id, auth_user_id, lifecycle_state, deletion_requested_at
      ),
      audit AS (
        INSERT INTO audit_events (owner_id, actor_auth_user_id, action, target_kind, target_id)
        SELECT id, ${authUserId}::uuid, 'account.deletion_requested', 'account', id::text
        FROM requested
      )
      SELECT * FROM requested
    `,
  ]);
  const rows = updated as AccountRow[];
  return rows[0] ? mapAccount(rows[0]) : null;
}

/**
 * Cancels a pending deletion inside the grace period and records it. Returns
 * null when there was nothing recoverable.
 */
export async function recoverAccount(authUserId: string) {
  const [updated] = await runAsAuthenticatedUser(authUserId, (sql) => [
    sql`
      WITH recovered AS (
        UPDATE accounts
        SET lifecycle_state = 'active', updated_at = now()
        WHERE auth_user_id = ${authUserId}::uuid
          AND lifecycle_state = 'deletion_requested'
          AND deletion_requested_at > now() - make_interval(days => ${DELETION_GRACE_PERIOD_DAYS}::int)
        RETURNING id, auth_user_id, lifecycle_state, deletion_requested_at
      ),
      audit AS (
        INSERT INTO audit_events (owner_id, actor_auth_user_id, action, target_kind, target_id)
        SELECT id, ${authUserId}::uuid, 'account.deletion_cancelled', 'account', id::text
        FROM recovered
      )
      SELECT * FROM recovered
    `,
  ]);
  const rows = updated as AccountRow[];
  return rows[0] ? mapAccount(rows[0]) : null;
}
