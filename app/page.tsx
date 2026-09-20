import { redirect } from "next/navigation";

import { PokerLedger } from "@/components/poker-ledger";
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
      <PokerLedger accountId={account.id} />
    </>
  );
}
