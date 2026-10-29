"use client";

import Link from "next/link";
import { useEffect } from "react";

import { BrandMark } from "@/components/brand-mark";
import { APP_NAME } from "@/lib/brand";
import { reportError } from "@/lib/monitoring/report";

/**
 * Shown instead of a page that failed while showing (pre-launch audit step
 * 6). The error is reported to monitoring; its code (Next's digest for a
 * server error) matches the server's log, so a host can quote it.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  const code =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : null;

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="error-page-title">
        <BrandMark className="auth-mark" />
        <p className="eyebrow">{APP_NAME}</p>
        <h1 id="error-page-title">Something went wrong</h1>
        <p className="auth-intro">
          We couldn&apos;t show this screen. Try again, or go back to the start.
        </p>
        <div className="error-page-actions">
          <button className="auth-primary" type="button" onClick={() => retry()}>
            Try again
          </button>
          <Link className="error-page-secondary" href="/">
            Go to {APP_NAME}
          </Link>
        </div>
        {code ? <p className="error-page-code">Error code: {code}</p> : null}
      </section>
    </main>
  );
}
