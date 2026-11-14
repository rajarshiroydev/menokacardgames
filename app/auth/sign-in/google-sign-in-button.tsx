"use client";

import { useState } from "react";

import { authClient } from "@/lib/auth/client";

/**
 * "Continue with Google", drawn to Google's branding guidelines
 * (developers.google.com/identity/branding-guidelines): the standard
 * full-colour "G" at its fixed size, the approved wording, and Google's light
 * or dark button colours following the app theme (see `.google-sign-in` in
 * globals.css). Don't recolour or resize the "G" or change the wording.
 *
 * Neon Auth sends the person to Google, then back to `/auth/callback` with a
 * session verifier, the same exchange email links used. `invite` brings them
 * back to the invite page afterwards.
 */
export function GoogleSignInButton({ invite }: { invite: string | null }) {
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function continueWithGoogle() {
    setIsPending(true);
    setErrorMessage(null);
    const inviteQuery = invite ? `?invite=${encodeURIComponent(invite)}` : "";
    const errorQuery = invite
      ? `?error=GOOGLE&invite=${encodeURIComponent(invite)}`
      : "?error=GOOGLE";
    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: `/auth/callback${inviteQuery}`,
        errorCallbackURL: `/auth/sign-in${errorQuery}`,
      });
      if (error) {
        console.error("google sign-in failed", error.code);
        setErrorMessage("We could not start Google sign-in. Please try again.");
        setIsPending(false);
      }
      // On success the browser is already on its way to Google.
    } catch (error) {
      console.error("google sign-in failed", error);
      setErrorMessage("We could not start Google sign-in. Please try again.");
      setIsPending(false);
    }
  }

  return (
    <div className="google-sign-in-wrap">
      <button
        type="button"
        className="google-sign-in"
        onClick={continueWithGoogle}
        disabled={isPending}
      >
        <svg
          className="google-sign-in-logo"
          viewBox="0 0 48 48"
          aria-hidden="true"
          focusable="false"
        >
          <path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
          />
          <path
            fill="#4285F4"
            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
          />
          <path
            fill="#FBBC05"
            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
          />
        </svg>
        <span>Continue with Google</span>
      </button>
      {errorMessage ? (
        <p className="auth-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
