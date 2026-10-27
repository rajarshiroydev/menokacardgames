"use client";

import Link from "next/link";
import { useState } from "react";

import { InviteHeading, type InviteNames, InviteShell } from "@/components/invite-card";
import { NameSetup } from "@/components/name-setup";
import { apiErrorMessage } from "@/lib/security/rate-limit-message";

type Stage = "name" | "accept" | "yes" | "no";

/**
 * The signed-in part of the invite page (user decision 2026-10-27: no
 * "Are you *Guest*?" step). Without a name, saving it on the name screen
 * accepts the invite; with one, a single Accept invite button does. Opening
 * the link never accepts by itself: chat apps open links to draw previews.
 * Accepting makes them the host's friend and links the guest to their
 * account; "This isn't me" uses the invite up and changes nothing else.
 */
export function JoinInvite({
  token,
  invite,
  needsName,
  initialAvatar,
}: {
  token: string;
  invite: InviteNames;
  needsName: boolean;
  initialAvatar: string;
}) {
  const [stage, setStage] = useState<Stage>(needsName ? "name" : "accept");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function answer(accept: boolean) {
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
        return false;
      }
      setStage(accept ? "yes" : "no");
      return true;
    } catch {
      setError("Could not answer the invite. Check your connection and try again.");
      return false;
    }
  }

  async function tapAnswer(accept: boolean) {
    if (busy) return;
    setBusy(true);
    await answer(accept);
    setBusy(false);
  }

  if (stage === "name") {
    return (
      <NameSetup
        initialAvatar={initialAvatar}
        initialName={invite.guestName}
        onSaved={async () => {
          // The name is saved either way; a failed accept leaves the Accept
          // card with the error, so trying again needs no reload.
          if (!(await answer(true))) setStage("accept");
        }}
      />
    );
  }

  return (
    <InviteShell>
      <InviteHeading invite={invite} />
      {stage === "accept" ? (
        <>
          <p className="auth-intro">
            Accepting makes you friends with{" "}
            <span className="literal-text">{invite.hostName}</span> and moves
            every game you played as{" "}
            <span className="literal-text">{invite.guestName}</span> to your
            account.
          </p>
          {error ? (
            <p className="auth-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="invite-actions">
            <button
              className="auth-primary"
              type="button"
              disabled={busy}
              onClick={() => void tapAnswer(true)}
            >
              {busy ? "Saving…" : "Accept invite"}
            </button>
            <button
              type="button"
              className="invite-not-me"
              disabled={busy}
              onClick={() => void tapAnswer(false)}
            >
              This isn&apos;t me
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="auth-notice" role="status">
            {stage === "yes" ? (
              <>
                You and <span className="literal-text">{invite.hostName}</span>{" "}
                are now friends. Your games as{" "}
                <span className="literal-text">{invite.guestName}</span> are on
                Ranks, Games and your Profile.
              </>
            ) : (
              <>Nothing was linked. You can still add friends with your user code.</>
            )}
          </p>
          <Link className="auth-primary invite-link" href="/">
            Open Pokerize
          </Link>
        </>
      )}
    </InviteShell>
  );
}
