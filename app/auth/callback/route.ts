import { NextResponse } from "next/server";

import { exchangeMagicLinkVerifier } from "@/lib/auth/server";
import { afterSignInPath } from "@/lib/auth/sign-in-destination";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  if (!requestUrl.searchParams.has("neon_auth_session_verifier")) {
    return NextResponse.redirect(new URL("/auth/sign-in?error=INVALID_CALLBACK", requestUrl));
  }

  const sessionResponse = await exchangeMagicLinkVerifier(request);

  if (!sessionResponse.ok) {
    return NextResponse.redirect(new URL("/auth/sign-in?error=INVALID_TOKEN", requestUrl));
  }

  // Back to the invite page (migration 0030) or the admin dashboard the
  // link was asked from, otherwise Home.
  const response = NextResponse.redirect(
    new URL(afterSignInPath(requestUrl.searchParams), requestUrl),
  );
  response.headers.set("Cache-Control", "no-store");

  for (const cookie of sessionResponse.headers.getSetCookie()) {
    response.headers.append("Set-Cookie", cookie);
  }

  return response;
}
