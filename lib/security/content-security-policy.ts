/**
 * The Content Security Policy every page is sent with (audit step 2,
 * docs/LAUNCH-AUDIT.md H1). `proxy.ts` makes a fresh nonce for each page
 * request; Next.js reads it from the policy and puts it on its own scripts,
 * and the root layout puts it on the theme script.
 *
 * Enforced since 2026-11-14, after two weeks report-only: browsers block
 * what the policy doesn't allow and report it to CSP_REPORT_PATH. The only
 * production report then was Zod's eval probe, now switched off
 * (lib/security/zod-jitless.ts). To go back to reporting only, change
 * CSP_HEADER to "Content-Security-Policy-Report-Only".
 */
export const CSP_HEADER = "Content-Security-Policy";

/** Request header that carries the page's nonce to the root layout. */
export const NONCE_HEADER = "x-nonce";

/**
 * Where browsers send violation reports (app/csp-report/route.ts), through
 * `report-uri`, which every major browser supports. Not `report-to`: Chrome
 * then ignores `report-uri`, and its batched reports never arrived in testing.
 */
export const CSP_REPORT_PATH = "/csp-report";

/** A new nonce: 16 random bytes, base64. */
export function createNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The policy for one page response. Scripts run only from this app and only
 * when they carry the nonce, or when a script that does loads them
 * ('strict-dynamic', for Next's chunks and Vercel Analytics). Styles may be
 * inline, because server-rendered `style` attributes can't carry a nonce.
 * Images also come from `blob:` (the results card preview) and `data:`.
 * `connectOrigins` adds places the browser may send data to besides the
 * app: Sentry's ingest address when error reporting is on.
 * Development adds 'unsafe-eval', which React uses for its error overlay.
 */
export function contentSecurityPolicy(
  nonce: string,
  {
    development = false,
    connectOrigins = [],
  }: { development?: boolean; connectOrigins?: string[] } = {},
) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
      development ? " 'unsafe-eval'" : ""
    }`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    ["connect-src 'self'", ...connectOrigins].join(" "),
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `report-uri ${CSP_REPORT_PATH}`,
  ].join("; ");
}
