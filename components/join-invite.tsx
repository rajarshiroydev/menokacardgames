"use client";

import Link from "next/link";
import { useState } from "react";

import { apiErrorMessage } from "@/lib/security/rate-limit-message";

/**
 * The invited person's answer on the invite page: "Yes, that's me" makes
 * them the host's friend and links the guest to their account; "No" uses the
 * invite up and changes nothing else.
 */
export function JoinInvite({
  token,
  hostName,
  guestName,
}: {
  token: string;
  hostName: string;
  guestName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [answered, setAnswered] = useState<"yes" | "no" | null>(null);

  async function answer(accept: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "answer", token, accept }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(apiErrorMessage(response.status, data.error, "Could not answer the invite"));
        return;
      }
      setAnswered(accept ? "yes" : "no");
    } catch {
      setError("Could not answer the invite. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (answered) {
    return (
      <>
        <p className="auth-notice" role="status">
          {answered === "yes" ? (
            <>
              You and <span className="literal-text">{hostName}</span> are now
              friends. Your games as{" "}
              <span className="literal-text">{guestName}</span> are on Ranks,
              Games and your Profile.
            </>
          ) : (
            <>Nothing was linked. You can still add friends with your user code.</>
          )}
        </p>
        <Link className="auth-primary invite-link" href="/">
          Open Pokerize
        </Link>
      </>
    );
  }

  return (
    <>
      <h2 className="invite-question">
        Are you <span className="literal-text">{guestName}</span>?
      </h2>
      <p className="auth-intro">
        Yes makes you friends with{" "}
        <span className="literal-text">{hostName}</span> and moves every game
        you played as <span className="literal-text">{guestName}</span> to your
        account.
      </p>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="invite-actions">
        <button className="auth-primary" type="button" disabled={busy} onClick={() => void answer(true)}>
          {busy ? "Saving…" : "Yes, that's me"}
        </button>
        <button
          type="button"
          className="invite-no"
          disabled={busy}
          onClick={() => void answer(false)}
        >
          No, that&apos;s not me
        </button>
      </div>
    </>
  );
}
