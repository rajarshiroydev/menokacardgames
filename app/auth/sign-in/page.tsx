import { redirect } from "next/navigation";

import { DELETION_GRACE_PERIOD_DAYS } from "@/lib/accounts/lifecycle";
import { getHostSession } from "@/lib/auth/server";

import { MagicLinkForm } from "./magic-link-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (await getHostSession()) redirect("/");
  const deletionRequested = (await searchParams).deletion === "requested";

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="sign-in-title">
        <div className="auth-mark" aria-hidden="true">
          ♠
        </div>
        <p className="eyebrow">Menoka Card Games</p>
        <h1 id="sign-in-title">Your private poker ledger</h1>
        <p className="auth-intro">
          Sign in with your email to manage your friend list, games, and
          standings. No password is needed.
        </p>
        {deletionRequested ? (
          <p className="auth-notice" role="status">
            Your account is locked and you have been signed out on every
            device. Sign in within {DELETION_GRACE_PERIOD_DAYS} days to recover
            it; after that, everything is permanently deleted.
          </p>
        ) : null}
        <MagicLinkForm />
      </section>
    </main>
  );
}
