"use client";

import { type FormEvent, useRef, useState } from "react";

import { TOO_MANY_REQUESTS_MESSAGE } from "@/lib/security/rate-limit-message";

const CODE_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign-in with a 6-digit code emailed by Neon Auth (Email OTP), in place of
 * email links (user decision 2026-11-14): link scanners in some mail apps
 * opened links before people could, using them up, but they can't type a
 * code. The code is checked by Neon Auth through our /api/auth proxy, which
 * sets the new session cookies itself, so no callback page is involved.
 *
 * `email` fixes the address (signing in again for a recent sign-in); without
 * it the person types one. `onSignedIn` runs once the new session exists.
 * `variant` picks the auth page's form styles or a ledger sheet's buttons.
 */
export function EmailCodeSignIn({
  email: fixedEmail,
  onSignedIn,
  variant = "page",
}: {
  email?: string;
  onSignedIn: () => void;
  variant?: "page" | "sheet";
}) {
  const [email, setEmail] = useState(fixedEmail ?? "");
  const [step, setStep] = useState<"email" | "code">("email");
  const [code, setCode] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const submitting = useRef(false);

  async function sendCode(address: string) {
    setIsPending(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      // Loaded only when needed: the auth client's validation library probes
      // for eval, which the Content Security Policy reports on every load.
      const { authClient } = await import("@/lib/auth/client");
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: address,
        type: "sign-in",
      });
      if (error) throw error;
      setCode("");
      setStep("code");
      setNotice(step === "code" ? "We sent a new code." : null);
    } catch (error) {
      console.error("sign-in code request failed", error);
      setErrorMessage(
        authErrorStatus(error) === 429
          ? TOO_MANY_REQUESTS_MESSAGE
          : "We could not send the code. Please try again.",
      );
    } finally {
      setIsPending(false);
    }
  }

  async function checkCode(value: string) {
    if (submitting.current) return;
    submitting.current = true;
    setIsPending(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const { authClient } = await import("@/lib/auth/client");
      const { error } = await authClient.signIn.emailOtp({ email, otp: value });
      if (error) throw error;
      onSignedIn();
    } catch (error) {
      console.warn("sign-in code check failed", error);
      setCode("");
      setErrorMessage(codeErrorMessage(error));
    } finally {
      submitting.current = false;
      setIsPending(false);
    }
  }

  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (address.length > 254 || !EMAIL_PATTERN.test(address)) {
      setErrorMessage("Enter a valid email address.");
      return;
    }
    setEmail(address);
    void sendCode(address);
  }

  function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== CODE_LENGTH) {
      setErrorMessage(`Enter the ${CODE_LENGTH}-digit code from the email.`);
      return;
    }
    void checkCode(code);
  }

  function changeCode(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    // A full code (typed, pasted or filled in from the email by the phone)
    // signs in straight away.
    if (digits.length === CODE_LENGTH) void checkCode(digits);
  }

  const primary = variant === "sheet" ? "primary" : undefined;
  const secondary = variant === "sheet" ? "ghost" : "auth-secondary";
  const formClass = variant === "sheet" ? "code-sign-in" : "auth-form";

  const messages = (
    <>
      {notice ? (
        <p className="auth-notice" role="status">
          {notice}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="auth-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </>
  );

  if (step === "email") {
    return (
      <form onSubmit={submitEmail} className={formClass} noValidate>
        {fixedEmail ? (
          <p className="code-sign-in-intro">
            We&apos;ll email a 6-digit code to{" "}
            <strong className="literal-text">{fixedEmail}</strong>.
          </p>
        ) : (
          <>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </>
        )}
        {messages}
        <button type="submit" className={primary} disabled={isPending}>
          {isPending ? "Sending code…" : "Email me a code"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitCode} className={formClass} noValidate>
      <p className="code-sign-in-intro" role="status">
        We sent a 6-digit code to{" "}
        <strong className="literal-text">{email}</strong>. Enter it here; it
        works once and expires in 5 minutes.
      </p>
      <label htmlFor="sign-in-code">Code</label>
      <input
        id="sign-in-code"
        name="code"
        className="code-sign-in-input"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={CODE_LENGTH}
        placeholder="123456"
        value={code}
        onChange={(event) => changeCode(event.target.value)}
        autoFocus
        required
      />
      {messages}
      <button type="submit" className={primary} disabled={isPending}>
        {isPending ? "Checking…" : "Sign in"}
      </button>
      <div className="code-sign-in-links">
        <button
          type="button"
          className={secondary}
          onClick={() => void sendCode(email)}
          disabled={isPending}
        >
          Send a new code
        </button>
        {fixedEmail ? null : (
          <button
            type="button"
            className={secondary}
            onClick={() => {
              setStep("email");
              setCode("");
              setErrorMessage(null);
              setNotice(null);
            }}
            disabled={isPending}
          >
            Use another email
          </button>
        )}
      </div>
    </form>
  );
}

/**
 * The Neon Auth SDK throws its errors (an AuthApiError with Neon's own `code`
 * and Better Auth's message, such as "Invalid OTP"), though it can also
 * return them; both arrive here. Better Auth's codes may also be present.
 */
function authErrorStatus(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

function codeErrorMessage(error: unknown) {
  if (authErrorStatus(error) === 429) return TOO_MANY_REQUESTS_MESSAGE;
  const details = error as { code?: unknown; message?: unknown } | null;
  const text = `${String(details?.code ?? "")} ${String(details?.message ?? "")}`.toLowerCase();
  if (text.includes("too many attempts") || text.includes("too_many_attempts")) {
    return "Too many wrong tries for this code. Send a new code.";
  }
  if (text.includes("expired")) {
    return "That code has expired. Send a new code and try again.";
  }
  if (text.includes("invalid otp") || text.includes("invalid_otp")) {
    return "That code isn't right. Check the email and try again.";
  }
  return "We could not sign you in with that code. Please try again.";
}
