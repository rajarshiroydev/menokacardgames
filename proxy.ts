import { NextResponse, type NextRequest } from "next/server";

import { auth, fetchUncachedSession } from "@/lib/auth/server";
import {
  needsSessionRenewal,
  SESSION_RENEWAL_INTERVAL_SECONDS,
  SESSION_RENEWED_COOKIE,
} from "@/lib/auth/session-cookies";
import {
  CROSS_SITE_REQUEST,
  isMutatingMethod,
  isSameOriginRequest,
} from "@/lib/security/request-origin";

const requireSignIn = auth.middleware({
  loginUrl: "/auth/sign-in",
});

export default async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    // Every API route that can change data only accepts requests made by the
    // app's own pages. Route handlers still check the session themselves.
    if (
      isMutatingMethod(request.method) &&
      !isSameOriginRequest(request.headers)
    ) {
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

  return withRenewedSession(request, await requireSignIn(request));
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
  matcher: ["/", "/admin", "/api/:path*"],
};
