/** Days an invite link works (migration 0030). */
export const INVITE_EXPIRY_DAYS = 30;
/** Usable invites one host may have at once (migration 0030). */
export const MAX_OPEN_INVITES = 20;

/** An invite token as made by `createInviteToken`: 43 base64url characters. */
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && INVITE_TOKEN_PATTERN.test(value);
}

/** The invite page for a token. */
export function invitePath(token: string) {
  return `/join/${token}`;
}

/** What the share sheet sends with the link. */
export function inviteMessage(hostName: string, guestName: string) {
  return `${hostName} invited you to Pokerize, where your poker results as ${guestName} are waiting.`;
}

/** What each `invite:` error raised by the database functions means. */
const INVITE_ERRORS = {
  "player-unavailable": [409, "Only your own guests can be invited"],
  "too-many": [
    429,
    `You have ${MAX_OPEN_INVITES} invites waiting. Wait for answers or invite again later`,
  ],
  "not-found": [404, "This invite has expired or was already used"],
  self: [409, "This is your own invite. Share it with your guest"],
  "already-friends": [
    409,
    "You're already friends with this host. Ask them to use Link to friend… on your guest",
  ],
} as const satisfies Record<string, readonly [number, string]>;

/** Maps a database error from an invite function to a response, if it is one. */
export function inviteErrorFromDatabase(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const match = /^invite:([a-z-]+)$/.exec(message);
  if (!match || !(match[1] in INVITE_ERRORS)) return null;
  const code = match[1] as keyof typeof INVITE_ERRORS;
  const [status, text] = INVITE_ERRORS[code];
  return { status, error: text, code: `invite-${code}` };
}
