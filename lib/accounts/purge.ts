/**
 * Permanent deletion of accounts whose recovery period has ended.
 *
 * For each due account, in order:
 * 1. delete the Neon Auth identity, so the person can no longer sign in;
 * 2. confirm in the database that the identity is gone (the provider's
 *    response alone is not trusted, which also makes retries safe);
 * 3. delete the account and, by cascade, everything it owns.
 *
 * A failure stops that account at the failed step and is recorded; the next
 * run resumes it. One account's failure never blocks the others.
 */

export type DuePurge = {
  accountId: string;
  authUserId: string | null;
  attempts: number;
};

export type PurgeStore = {
  claimDueAccounts(maxAccounts: number): Promise<DuePurge[]>;
  authIdentityExists(authUserId: string): Promise<boolean>;
  recordIdentityDeleted(accountId: string): Promise<void>;
  deleteAccountData(accountId: string): Promise<boolean>;
  recordFailure(accountId: string, failure: string): Promise<void>;
};

export type IdentityDeleter = (authUserId: string) => Promise<void>;

export type PurgeOutcome = {
  accountId: string;
  status: "purged" | "failed";
  step?: "identity" | "data";
  error?: string;
};

export type PurgeReport = {
  due: number;
  purged: number;
  failed: number;
  outcomes: PurgeOutcome[];
};

/** Keeps a run well inside the 60-second function limit; extra accounts wait a day. */
export const MAX_ACCOUNTS_PER_RUN = 10;

function describe(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

async function purgeOne(
  purge: DuePurge,
  store: PurgeStore,
  deleteIdentity: IdentityDeleter,
): Promise<PurgeOutcome> {
  const { accountId, authUserId } = purge;

  if (authUserId) {
    try {
      if (await store.authIdentityExists(authUserId)) {
        await deleteIdentity(authUserId);
        if (await store.authIdentityExists(authUserId)) {
          throw new Error("Auth identity still exists after deletion");
        }
      }
      await store.recordIdentityDeleted(accountId);
    } catch (error) {
      const message = `identity: ${describe(error)}`;
      await store.recordFailure(accountId, message);
      return { accountId, status: "failed", step: "identity", error: message };
    }
  } else {
    await store.recordIdentityDeleted(accountId);
  }

  try {
    if (!(await store.deleteAccountData(accountId))) {
      throw new Error("Account was not ready for data deletion");
    }
    return { accountId, status: "purged" };
  } catch (error) {
    const message = `data: ${describe(error)}`;
    await store.recordFailure(accountId, message);
    return { accountId, status: "failed", step: "data", error: message };
  }
}

export async function purgeDueAccounts(
  store: PurgeStore,
  deleteIdentity: IdentityDeleter,
  maxAccounts = MAX_ACCOUNTS_PER_RUN,
): Promise<PurgeReport> {
  const due = await store.claimDueAccounts(maxAccounts);
  const outcomes: PurgeOutcome[] = [];
  for (const purge of due) {
    outcomes.push(await purgeOne(purge, store, deleteIdentity));
  }
  return {
    due: due.length,
    purged: outcomes.filter((outcome) => outcome.status === "purged").length,
    failed: outcomes.filter((outcome) => outcome.status === "failed").length,
    outcomes,
  };
}
