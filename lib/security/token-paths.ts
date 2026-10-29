/**
 * Paths whose last part is an access token: live standings links
 * (`/live/<token>`, `/api/live/<token>`) and invites (`/join/<token>`).
 * Anything that records a page address, such as analytics or CSP reports,
 * blanks the token, so a link that grants access never leaves the app.
 */
const TOKEN_PATH = /^(\/(?:api\/)?(?:live|join))\/[^/]+/;

/** The path with any access token replaced by `[token]`. */
export function redactTokenPath(pathname: string) {
  return pathname.replace(TOKEN_PATH, "$1/[token]");
}
