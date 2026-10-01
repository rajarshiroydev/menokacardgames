import { redirect } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { DELETION_GRACE_PERIOD_DAYS } from "@/lib/accounts/lifecycle";
import { getHostSession } from "@/lib/auth/server";
import { APP_NAME } from "@/lib/brand";
import { testbedMode } from "@/lib/testbed/server";

import { MagicLinkForm } from "./magic-link-form";
import { TestbedPersonas } from "./testbed-personas";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (await getHostSession()) redirect("/");
  const params = await searchParams;
  const deletionRequested = params.deletion === "requested";
  const testbedError =
    typeof params.testbed === "string" ? params.testbed.slice(0, 60) : null;

  return (
    <main className="auth-page">
      <ThemeToggle className="page-theme-toggle" />
      <section className="auth-card" aria-labelledby="sign-in-title">
        <div className="auth-mark" aria-hidden="true">
          ♠
        </div>
        <p className="eyebrow">{APP_NAME}</p>
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
        {testbedMode() ? (
          <TestbedPersonas error={testbedError} />
        ) : (
          <MagicLinkForm />
        )}
      </section>
    </main>
  );
}
