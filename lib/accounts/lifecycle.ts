export type AccountLifecycleState =
  | "active"
  | "deletion_requested"
  | "purging";

export type HostAccount = {
  id: string;
  authUserId: string;
  lifecycleState: AccountLifecycleState;
  deletionRequestedAt: number | null;
};

/** Days a host can recover their account after requesting deletion. */
export const DELETION_GRACE_PERIOD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** When a deletion request stops being recoverable and becomes due for purging. */
export function deletionDeadline(deletionRequestedAt: number) {
  return deletionRequestedAt + DELETION_GRACE_PERIOD_DAYS * DAY_MS;
}

export function canRecoverAccount(account: HostAccount, now = Date.now()) {
  return (
    account.lifecycleState === "deletion_requested" &&
    account.deletionRequestedAt !== null &&
    now < deletionDeadline(account.deletionRequestedAt)
  );
}

export function accountAccessError(account: HostAccount) {
  if (account.lifecycleState === "active") return null;

  return account.lifecycleState === "deletion_requested"
    ? "This account is locked while deletion is pending"
    : "This account is being permanently deleted";
}

export function isAuthUserId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
