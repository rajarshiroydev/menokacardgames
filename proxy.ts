import { NextRequest, NextResponse } from "next/server";

import { auth, fetchUncachedSession } from "@/lib/auth/server";
import {
  needsSessionRenewal,
  SESSION_RENEWAL_INTERVAL_SECONDS,
  SESSION_RENEWED_COOKIE,
} from "@/lib/auth/session-cookies";
import { sentryIngestOrigin } from "@/lib/monitoring/scrub";
import { logSecurityEvent } from "@/lib/security/security-log";
import { redactTokenPath } from "@/lib/security/token-paths";
import {
  contentSecurityPolicy,
  createNonce,
  CSP_HEADER,
  NONCE_HEADER,
} from "@/lib/security/content-security-policy";
import {
  CROSS_SITE_REQUEST,
  isMutatingMethod,
  isSameOriginRequest,
} from "@/lib/security/request-origin";

const requireSignIn = auth.middleware({
  loginUrl: "/auth/sign-in",
});

/** Pages that need a signed-in person; every other page is public. */
const SIGNED_IN_PAGES = new Set(["/", "/admin"]);

export default async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    // Every API route that can change data only accepts requests made by the
    // app's own pages. Route handlers still check the session themselves.
    if (
      isMutatingMethod(request.method) &&
      !isSameOriginRequest(request.headers)
    ) {
      logSecurityEvent("cross-site-request-refused", {
        method: request.method,
        path: redactTokenPath(request.nextUrl.pathname),
      });
      return NextResponse.json(
        {
          error: "This request did not come from the app",
          code: CROSS_SITE_REQUEST,
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    // The live standings API is public and cached at the CDN, so it must
    // never carry anyone's session cookies.
    if (request.nextUrl.pathname.startsWith("/api/live/")) {
      return NextResponse.next();
    }
    return withRenewedSession(request, NextResponse.next());
  }

  // Pages: a fresh nonce each time. Next.js finds it in the policy on the
  // request and puts it on its scripts; the root layout reads NONCE_HEADER.
  const nonce = createNonce();
  const sentryOrigin = sentryIngestOrigin(process.env.NEXT_PUBLIC_SENTRY_DSN);
  const policy = contentSecurityPolicy(nonce, {
    development: process.env.NODE_ENV === "development",
    connectOrigins: sentryOrigin ? [sentryOrigin] : [],
  });
  const headers = new Headers(request.headers);
  // Next.js reads an enforced policy before a report-only one, so one sent
  // by the client must not reach it.
  headers.delete("Content-Security-Policy");
  headers.set(CSP_HEADER, policy);
  headers.set(NONCE_HEADER, nonce);

  // The sign-in check reads only the URL and headers, and passes the
  // headers it was given on to the page.
  const response = SIGNED_IN_PAGES.has(request.nextUrl.pathname)
    ? await withRenewedSession(
        request,
        await requireSignIn(
          new NextRequest(request.url, { method: request.method, headers }),
        ),
      )
    : NextResponse.next({ request: { headers } });
  response.headers.set(CSP_HEADER, policy);
  return response;
}

/**
 * Twice a day, asks Neon Auth for the session without the SDK's cache and
 * passes on the cookies it sends, so the browser's sign-in cookie follows the
 * session's real expiry instead of ending 7 days after sign-in. A failed
 * check changes nothing and is retried on the next request.
 */
async function withRenewedSession(request: NextRequest, response: Response) {
  if (!needsSessionRenewal(request.headers.get("cookie"))) return response;

  try {
    const session = await fetchUncachedSession(request);
    if (!session.ok) return response;

    for (const cookie of session.headers.getSetCookie()) {
      response.headers.append("Set-Cookie", cookie);
    }
    response.headers.append(
      "Set-Cookie",
      `${SESSION_RENEWED_COOKIE}=1; Path=/; Max-Age=${SESSION_RENEWAL_INTERVAL_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
    );
  } catch (error) {
    console.error("session cookie renewal failed", error);
  }
  return response;
}

export const config = {
  // Every page and API route; not build output, Vercel's own scripts, the
  // CSP report endpoint or files from public/ and the app icons.
  matcher: [
    "/((?!_next/static|_next/image|_vercel|csp-report|.*\\.(?:svg|png|ico|webmanifest|txt|xml)$).*)",
  ],
};
