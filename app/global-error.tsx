"use client";

import { useEffect } from "react";

import { APP_NAME } from "@/lib/brand";
import { reportError } from "@/lib/monitoring/report";

/**
 * The last resort, when even the root layout failed (pre-launch audit step
 * 6). It replaces the whole document, so it brings its own minimal styles:
 * the app's stylesheet and theme don't reach it, and it follows the phone's
 * light or dark setting.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="global-error-page">
        <title>{`Something went wrong · ${APP_NAME}`}</title>
        <style>{`
          .global-error-page { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; font-family: system-ui, sans-serif; background: #05080a; color: #f3f6f4; }
          .global-error-card { width: min(100%, 420px); display: grid; gap: 14px; }
          .global-error-card h1 { margin: 0; font-size: 32px; }
          .global-error-card p { margin: 0; opacity: 0.72; line-height: 1.5; }
          .global-error-card button { min-height: 50px; border: 0; border-radius: 12px; font: inherit; font-weight: 700; background: #41ee86; color: #05080a; }
          .global-error-card .global-error-reload { border: 1px solid rgba(127,127,127,0.4); background: transparent; color: inherit; }
          @media (prefers-color-scheme: light) { .global-error-page { background: #f4f6f5; color: #0b1210; } }
        `}</style>
        <main className="global-error-card">
          <h1>Something went wrong</h1>
          <p>
            {APP_NAME} couldn&apos;t start this page. Try again, or reload the app.
          </p>
          <button type="button" onClick={() => retry()}>
            Try again
          </button>
          <button
            className="global-error-reload"
            type="button"
            // A full reload on purpose: the app itself failed, so its own
            // navigation can't be trusted.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            onClick={() => window.location.assign("/")}
          >
            Reload {APP_NAME}
          </button>
        </main>
      </body>
    </html>
  );
}
