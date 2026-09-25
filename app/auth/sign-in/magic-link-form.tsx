"use client";

import { type FormEvent, useState } from "react";

import { authClient } from "@/lib/auth/client";
import { TOO_MANY_REQUESTS_MESSAGE } from "@/lib/security/rate-limit-message";

export function MagicLinkForm() {
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function submitMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "")
      .trim()
      .toLowerCase();

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMessage("Enter a valid email address.");
      return;
    }

    setIsPending(true);
    setErrorMessage(null);

    try {
      const { error } = await authClient.signIn.magicLink({
        email,
        callbackURL: "/auth/callback",
      });

      if (error) {
        console.error("magic link request failed", error.code);
        setErrorMessage(
          error.status === 429
            ? TOO_MANY_REQUESTS_MESSAGE
            : "We could not send the sign-in link. Please try again.",
        );
        return;
      }

      setSentEmail(email);
    } catch (error) {
      console.error("magic link request failed", error);
      setErrorMessage("We could not send the sign-in link. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  if (sentEmail) {
    return (
      <div className="auth-confirmation" role="status">
        <span className="auth-confirmation-icon" aria-hidden="true">
          ✓
        </span>
        <h2>Check your email</h2>
        <p>
          We sent a sign-in link to <strong>{sentEmail}</strong>. The link can
          be used once and expires shortly.
        </p>
        <button type="button" onClick={() => setSentEmail(null)}>
          Use another email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submitMagicLink} className="auth-form">
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
      {errorMessage ? (
        <p className="auth-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <button type="submit" disabled={isPending}>
        {isPending ? "Sending link…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
