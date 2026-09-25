import { redirect } from "next/navigation";

import { AccountLocked } from "@/components/account-locked";
import { PokerLedger } from "@/components/poker-ledger";
import { canRecoverAccount, deletionDeadline } from "@/lib/accounts/lifecycle";
import { provisionHostAccount } from "@/lib/accounts/server";
import { getHostSession } from "@/lib/auth/server";

import { signOut } from "./auth/sign-in/actions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getHostSession();
  if (!session) redirect("/auth/sign-in");
  const account = await provisionHostAccount(session.user.id);

  return (
    <>
      <header className="account-bar">
        <span>
          Signed in as <strong>{session.user.email}</strong>
        </span>
        <form action={signOut}>
          <button type="submit">Sign out</button>
        </form>
      </header>
      {account.lifecycleState === "active" ? (
        <PokerLedger accountId={account.id} accountEmail={session.user.email} />
      ) : (
        <AccountLocked
          email={session.user.email}
          deletionRequestedAt={account.deletionRequestedAt}
          deletionDeadline={
            account.deletionRequestedAt === null
              ? null
              : deletionDeadline(account.deletionRequestedAt)
          }
          recoverable={canRecoverAccount(account)}
        />
      )}
    </>
  );
}
