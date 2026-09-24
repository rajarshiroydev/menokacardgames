const SESSION_COOKIE = /^[^=]*neon-auth[^=]*\.(session_token|local\.session_data)=/;

/** Cookie header without Neon Auth session cookies; other cookies are kept. */
export function stripSessionCookies(cookieHeader: string | null) {
  return (cookieHeader ?? "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie && !SESSION_COOKIE.test(cookie))
    .join("; ");
}

/**
 * Existing session cookies make the Neon Auth SDK answer get-session from its
 * cache without exchanging the verifier, so a sign-in link used while signed in
 * would never create a fresh session. Dropping them forces the exchange.
 */
export function withoutSessionCookies(request: Request) {
  const headers = new Headers(request.headers);
  const cookies = stripSessionCookies(headers.get("cookie"));
  if (cookies) headers.set("cookie", cookies);
  else headers.delete("cookie");
  return new Request(request.url, { method: "GET", headers });
}
