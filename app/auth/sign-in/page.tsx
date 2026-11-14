import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { DELETION_GRACE_PERIOD_DAYS } from "@/lib/accounts/lifecycle";
import { getHostSession } from "@/lib/auth/server";
import { APP_NAME } from "@/lib/brand";
import { MINIMUM_AGE } from "@/lib/info/legal";
import { isInviteToken, invitePath } from "@/lib/friends/invites";
import { testbedMode } from "@/lib/testbed/server";

import { googleSignInEnabled } from "@/lib/auth/providers";

import { GoogleSignInButton } from "./google-sign-in-button";
import { MagicLinkForm } from "./magic-link-form";
import { TestbedPersonas } from "./testbed-personas";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  // From an invite page: back there after signing in (migration 0030).
  const invite = isInviteToken(params.invite) ? params.invite : null;
  // A sign-in cookie whose session is gone (revoked, or the account deleted)
  // makes the auth library try to clear the cookie, which a page can't do;
  // that visitor is simply signed out here, as on the invite page.
  const session = await getHostSession().catch(() => null);
  if (session) redirect(invite ? invitePath(invite) : "/");
  const deletionRequested = params.deletion === "requested";
  const testbedError =
    typeof params.testbed === "string" ? params.testbed.slice(0, 60) : null;
  // Back from a sign-in that didn't finish: Google cancelled or failed
  // (`GOOGLE`), or an email link that was already used or expired.
  const signInFailed = typeof params.error === "string";
  const showGoogle = googleSignInEnabled();

  return (
    <main className="auth-page">
      <ThemeToggle className="page-theme-toggle" />
      <section className="auth-card" aria-labelledby="sign-in-title">
        <BrandMark className="auth-mark" />
        <p className="eyebrow">{APP_NAME}</p>
        <h1 id="sign-in-title">Your private poker ledger</h1>
        <p className="auth-intro">
          Sign in with {showGoogle ? "Google or your email" : "your email"} to
          manage your friend list, games, and standings. No password is needed.
        </p>
        {deletionRequested ? (
          <p className="auth-notice" role="status">
            Your account is locked and you have been signed out on every
            device. Sign in within {DELETION_GRACE_PERIOD_DAYS} days to recover
            it; after that, everything is permanently deleted.
          </p>
        ) : null}
        {signInFailed ? (
          <p className="auth-error" role="alert">
            Sign-in didn&apos;t finish. Please try again.
          </p>
        ) : null}
        {showGoogle ? (
          <>
            <GoogleSignInButton invite={invite} />
            <p className="auth-divider" aria-hidden="true">
              <span>or</span>
            </p>
          </>
        ) : null}
        {testbedMode() ? (
          <TestbedPersonas error={testbedError} invite={invite} />
        ) : (
          <MagicLinkForm invite={invite} />
        )}
        <p className="auth-legal">
          By signing in you agree to the <Link href="/terms">Terms of Use</Link>{" "}
          and <Link href="/privacy">Privacy Policy</Link>. You must be{" "}
          {MINIMUM_AGE} or over. <Link href="/features">What {APP_NAME} does</Link>
        </p>
      </section>
    </main>
  );
}
