import "server-only";

import { neon } from "@neondatabase/serverless";

import type { DuePurge, IdentityDeleter, PurgeStore } from "./purge";

function requiredEnvironmentVariable(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

/** Database access through the menoka_purge role, which may only call the purge functions. */
export function createPurgeStore(): PurgeStore {
  const sql = neon(requiredEnvironmentVariable("PURGE_DATABASE_URL"));

  return {
    async claimDueAccounts(maxAccounts) {
      const rows = (await sql`
        SELECT account_id, auth_user_id, attempts
        FROM public.purge_claim_due_accounts(${maxAccounts}::int)
      `) as Array<{ account_id: string; auth_user_id: string | null; attempts: number }>;
      return rows.map(
        (row): DuePurge => ({
          accountId: row.account_id,
          authUserId: row.auth_user_id,
          attempts: row.attempts,
        }),
      );
    },
    async authIdentityExists(authUserId) {
      const rows = (await sql`
        SELECT public.purge_auth_identity_exists(${authUserId}::uuid) AS exists
      `) as Array<{ exists: boolean }>;
      return rows[0]?.exists === true;
    },
    async recordIdentityDeleted(accountId) {
      await sql`SELECT public.purge_record_identity_deleted(${accountId}::uuid)`;
    },
    async deleteAccountData(accountId) {
      const rows = (await sql`
        SELECT public.purge_delete_account_data(${accountId}::uuid) AS deleted
      `) as Array<{ deleted: boolean }>;
      return rows[0]?.deleted === true;
    },
    async recordFailure(accountId, failure) {
      await sql`SELECT public.purge_record_failure(${accountId}::uuid, ${failure})`;
    },
  };
}

/** Deletes a Neon Auth user through Neon's documented branch-level endpoint. */
export function createNeonIdentityDeleter(): IdentityDeleter {
  const apiKey = requiredEnvironmentVariable("NEON_API_KEY");
  const projectId = requiredEnvironmentVariable("NEON_PROJECT_ID");
  const branchId = requiredEnvironmentVariable("NEON_AUTH_BRANCH_ID");

  return async (authUserId) => {
    const url = `https://console.neon.tech/api/v2/projects/${encodeURIComponent(
      projectId,
    )}/branches/${encodeURIComponent(branchId)}/auth/users/${encodeURIComponent(authUserId)}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    // Any status is followed by a database check, so a 404 for an identity
    // that is already gone is not an error here.
    if (!response.ok && response.status !== 404) {
      throw new Error(`Neon API returned ${response.status}`);
    }
  };
}

type PingKind = "start" | "success" | "fail";

/** Reports a run to Healthchecks.io; monitoring problems never break the purge. */
export async function pingHealthcheck(kind: PingKind, body?: string) {
  const baseUrl = process.env.HEALTHCHECKS_PING_URL;
  if (!baseUrl) {
    console.warn("HEALTHCHECKS_PING_URL is not configured; purge run not reported");
    return;
  }
  const url = kind === "success" ? baseUrl : `${baseUrl.replace(/\/$/, "")}/${kind}`;
  try {
    await fetch(url, {
      method: "POST",
      body: body?.slice(0, 10_000),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    console.error("healthcheck ping failed", kind, error);
  }
}
