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
