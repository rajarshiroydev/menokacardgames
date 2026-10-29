import type { NextConfig } from "next";

/**
 * Sent with every response (audit step 2, docs/LAUNCH-AUDIT.md H1). The
 * Content Security Policy is per page and comes from proxy.ts.
 * - HSTS: HTTPS only for 2 years, subdomains included. Not `preload`:
 *   joining the browsers' preload list is a separate, slow-to-undo step.
 * - Framing is refused, so the app can't be shown inside another site to
 *   trick a tap (clickjacking).
 * - Only the app's own pages may use the camera (scanning a QR code); other
 *   powerful features are off.
 */
const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingRoot: process.cwd(),
  // Files the results card reads at run time (lib/poker/results-card-image.tsx),
  // for the host's card and a friend's.
  outputFileTracingIncludes: {
    "/api/sessions/[id]/card": [
      "./assets/fonts/*.ttf",
      "./public/avatars/*.svg",
      "./public/icons/icon-192.png",
    ],
    "/api/groups/card": [
      "./assets/fonts/*.ttf",
      "./public/avatars/*.svg",
      "./public/icons/icon-192.png",
    ],
  },
};

export default nextConfig;
