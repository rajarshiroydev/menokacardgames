"use client";

import { useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { APP_NAME } from "@/lib/brand";
import { ADMIN_SIGN_IN_NEXT } from "@/lib/auth/sign-in-destination";
import { TOO_MANY_REQUESTS_MESSAGE } from "@/lib/security/rate-limit-message";

/**
 * Shown at /admin to an admin whose last email sign-in is more than an hour
 * old (pre-launch audit step 5): a fresh link brings them back here.
 */
export function AdminSignInAgain({ email }: { email: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function sendLink() {
    setStatus("sending");
    setError(null);
    try {
      // Loaded only when needed, as in poker-ledger.tsx.
      const { authClient } = await import("@/lib/auth/client");
      const { error: linkError } = await authClient.signIn.magicLink({
        email,
        callbackURL: `/auth/callback?next=${ADMIN_SIGN_IN_NEXT}`,
      });
      if (linkError) {
        setError(
          linkError.status === 429
            ? TOO_MANY_REQUESTS_MESSAGE
            : "We could not send the sign-in link. Please try again.",
        );
        setStatus("idle");
        return;
      }
      setStatus("sent");
    } catch (caught) {
      console.error("admin sign-in link request failed", caught);
      setError("We could not send the sign-in link. Please try again.");
      setStatus("idle");
    }
  }

  return (
    <main className="auth-page">
      <ThemeToggle className="page-theme-toggle" />
      <section className="auth-card" aria-labelledby="admin-sign-in-title">
        <BrandMark className="auth-mark" />
        <p className="eyebrow">{APP_NAME} admin</p>
        <h1 id="admin-sign-in-title">Sign in again</h1>
        {status === "sent" ? (
          <div className="auth-confirmation" role="status">
            <span className="auth-confirmation-icon" aria-hidden="true">
              ✓
            </span>
            <h2>Check your email</h2>
            <p>
              We sent a sign-in link to <strong>{email}</strong>. Open it on this
              device to come back to the dashboard.
            </p>
          </div>
        ) : (
          <>
            <p className="auth-intro">
              For safety, the admin dashboard needs a sign-in from the last
              hour. We&apos;ll email a new sign-in link to{" "}
              <strong className="literal-text">{email}</strong>.
            </p>
            {error ? (
              <p className="auth-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="auth-form">
              <button
                type="button"
                onClick={() => void sendLink()}
                disabled={status === "sending"}
              >
                {status === "sending" ? "Sending link…" : "Email me a sign-in link"}
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
