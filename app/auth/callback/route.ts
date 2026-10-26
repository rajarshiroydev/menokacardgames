import { NextResponse } from "next/server";

import { exchangeMagicLinkVerifier } from "@/lib/auth/server";
import { invitePath, isInviteToken } from "@/lib/friends/invites";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  if (!requestUrl.searchParams.has("neon_auth_session_verifier")) {
    return NextResponse.redirect(new URL("/auth/sign-in?error=INVALID_CALLBACK", requestUrl));
  }

  const sessionResponse = await exchangeMagicLinkVerifier(request);

  if (!sessionResponse.ok) {
    return NextResponse.redirect(new URL("/auth/sign-in?error=INVALID_TOKEN", requestUrl));
  }

  // Signed in from an invite: back to the invite page (migration 0030).
  const invite = requestUrl.searchParams.get("invite");
  const response = NextResponse.redirect(
    new URL(isInviteToken(invite) ? invitePath(invite) : "/", requestUrl),
  );
  response.headers.set("Cache-Control", "no-store");

  for (const cookie of sessionResponse.headers.getSetCookie()) {
    response.headers.append("Set-Cookie", cookie);
  }

  return response;
}
