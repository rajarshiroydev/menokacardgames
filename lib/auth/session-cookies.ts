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

const SESSION_TOKEN_COOKIE = /(?:^|;\s*)[^=;]*neon-auth[^=;]*\.session_token=/;

/** True when the cookie header carries a Neon Auth session token. */
export function hasSessionToken(cookieHeader: string | null) {
  return SESSION_TOKEN_COOKIE.test(cookieHeader ?? "");
}

/**
 * Marks that the browser's session cookie was renewed recently. Neon Auth
 * extends a session at most once a day, so checking twice a day keeps the
 * browser's cookie at most a day or so behind the session's real expiry.
 */
export const SESSION_RENEWED_COOKIE = "menoka-session-renewed";
export const SESSION_RENEWAL_INTERVAL_SECONDS = 12 * 60 * 60;

/** Whether this request should ask Neon Auth for a renewed session cookie. */
export function needsSessionRenewal(cookieHeader: string | null) {
  if (!hasSessionToken(cookieHeader)) return false;
  return !(cookieHeader ?? "")
    .split(";")
    .some((cookie) => cookie.trim().startsWith(`${SESSION_RENEWED_COOKIE}=`));
}
