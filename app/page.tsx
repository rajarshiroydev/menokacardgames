import { redirect } from "next/navigation";

import { AccountLocked } from "@/components/account-locked";
import { NameSetup } from "@/components/name-setup";
import { PokerLedger } from "@/components/poker-ledger";
import { canRecoverAccount, deletionDeadline } from "@/lib/accounts/lifecycle";
import {
  provisionHostAccount,
  readAccountProfile,
} from "@/lib/accounts/server";
import { getHostSession } from "@/lib/auth/server";

import { signOut } from "./auth/sign-in/actions";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getHostSession();
  if (!session) redirect("/auth/sign-in");
  const account = await provisionHostAccount(session.user.id);

  if (account.lifecycleState === "active") {
    // Saving a name is the first step after signing in, not an option for
    // later: the ledger opens only once the account has one.
    const profile = await readAccountProfile(session.user.id);
    if (!profile?.displayName) {
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
          <NameSetup />
        </>
      );
    }

    return (
      <PokerLedger accountId={account.id} accountEmail={session.user.email} />
    );
  }

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
    </>
  );
}
