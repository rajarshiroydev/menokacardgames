"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth/client";
import {
  RECENT_SIGN_IN_REQUIRED,
  RECENT_SIGN_IN_WINDOW_MS,
} from "@/lib/auth/recent-sign-in";

function formatDeadline(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AccountLocked({
  email,
  deletionRequestedAt,
  deletionDeadline,
  recoverable,
}: {
  email: string;
  deletionRequestedAt: number | null;
  deletionDeadline: number | null;
  recoverable: boolean;
}) {
  const [status, setStatus] = useState<
    "idle" | "working" | "needs-sign-in" | "link-sent" | "error"
  >("idle");
  const [error, setError] = useState("");
  const router = useRouter();

  async function recover() {
    setStatus("working");
    setError("");
    try {
      const response = await fetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recover" }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
      };
      if (response.ok) {
        router.refresh();
        return;
      }
      if (data.code === RECENT_SIGN_IN_REQUIRED) {
        setStatus("needs-sign-in");
        return;
      }
      setError(data.error || "The account could not be recovered");
      setStatus("error");
    } catch {
      setError("The account could not be recovered");
      setStatus("error");
    }
  }

  async function sendLink() {
    setStatus("working");
    try {
      const { error: linkError } = await authClient.signIn.magicLink({
        email,
        callbackURL: "/auth/callback",
      });
      if (linkError) throw new Error(linkError.code);
      setStatus("link-sent");
    } catch (linkError) {
      console.error("recovery sign-in link request failed", linkError);
      setError("We could not send the sign-in link. Please try again.");
      setStatus("error");
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="locked-title">
        <div className="auth-mark" aria-hidden="true">
          ♠
        </div>
        <p className="eyebrow">Account Locked</p>
        <h1 id="locked-title">
          {recoverable ? "Deletion is scheduled" : "This account is being deleted"}
        </h1>
        {recoverable && deletionDeadline ? (
          <>
            <p className="auth-intro">
              {deletionRequestedAt
                ? `You asked to delete this account on ${formatDeadline(deletionRequestedAt)}. `
                : ""}
              Your players, games and standings are locked and hidden. Unless
              you recover the account, everything will be permanently deleted
              on <strong>{formatDeadline(deletionDeadline)}</strong>.
            </p>
            {status === "needs-sign-in" ? (
              <div className="auth-confirmation" role="status">
                <p>
                  For safety, recovery needs a sign-in from the last{" "}
                  {RECENT_SIGN_IN_WINDOW_MS / 60_000} minutes. We will email a
                  new sign-in link to <strong>{email}</strong>. Open it on this
                  device, then recover again.
                </p>
                <button type="button" onClick={() => void sendLink()}>
                  Email me a sign-in link
                </button>
              </div>
            ) : status === "link-sent" ? (
              <div className="auth-confirmation" role="status">
                <span className="auth-confirmation-icon" aria-hidden="true">
                  ✓
                </span>
                <h2>Check your email</h2>
                <p>
                  Open the link on this device, then choose Recover my account.
                </p>
              </div>
            ) : (
              <button
                className="auth-primary"
                type="button"
                disabled={status === "working"}
                onClick={() => void recover()}
              >
                {status === "working" ? "Recovering…" : "Recover my account"}
              </button>
            )}
          </>
        ) : (
          <p className="auth-intro">
            The recovery period for this account has ended, and its data is
            being permanently deleted. It can no longer be recovered.
          </p>
        )}
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
