"use client";

import { useActionState } from "react";

import { sendMagicLink, type MagicLinkState } from "./actions";

const initialState: MagicLinkState = { status: "idle" };

export function MagicLinkForm() {
  const [state, formAction, isPending] = useActionState(
    sendMagicLink,
    initialState,
  );

  if (state.status === "sent") {
    return (
      <div className="auth-confirmation" role="status">
        <span className="auth-confirmation-icon" aria-hidden="true">
          ✓
        </span>
        <h2>Check your email</h2>
        <p>
          We sent a sign-in link to <strong>{state.email}</strong>. The link can
          be used once and expires shortly.
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Use another email
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="auth-form">
      <label htmlFor="email">Email address</label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        required
        autoFocus
      />
      {state.status === "error" ? (
        <p className="auth-error" role="alert">
          {state.message}
        </p>
      ) : null}
      <button type="submit" disabled={isPending}>
        {isPending ? "Sending link…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
