import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/lib/auth/server";
import {
  CROSS_SITE_REQUEST,
  isMutatingMethod,
  isSameOriginRequest,
} from "@/lib/security/request-origin";

const requireSignIn = auth.middleware({
  loginUrl: "/auth/sign-in",
});

export default function proxy(request: NextRequest) {
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
    return NextResponse.next();
  }

  return requireSignIn(request);
}

export const config = {
  matcher: ["/", "/api/:path*"],
};
