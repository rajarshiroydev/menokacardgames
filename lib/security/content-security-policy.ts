/**
 * The Content Security Policy every page is sent with (audit step 2,
 * docs/LAUNCH-AUDIT.md H1). `proxy.ts` makes a fresh nonce for each page
 * request; Next.js reads it from the policy and puts it on its own scripts,
 * and the root layout puts it on the theme script.
 *
 * Report-only for now: browsers report what the policy would block to
 * CSP_REPORT_PATH and block nothing. To enforce it, change CSP_HEADER to
 * "Content-Security-Policy".
 */
export const CSP_HEADER = "Content-Security-Policy-Report-Only";

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
 * Development adds 'unsafe-eval', which React uses for its error overlay.
 */
export function contentSecurityPolicy(
  nonce: string,
  { development = false }: { development?: boolean } = {},
) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
      development ? " 'unsafe-eval'" : ""
    }`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `report-uri ${CSP_REPORT_PATH}`,
  ].join("; ");
}
