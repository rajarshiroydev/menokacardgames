import { IDENTITY_CODE_PATTERN } from "../accounts/identity-code.ts";

/** Pending requests one person may have sent at once (migration 0011). */
export const MAX_PENDING_SENT_REQUESTS = 20;
/** Days before someone can ask again after being declined (migration 0011). */
export const DECLINE_WAIT_DAYS = 7;

export type ParsedCode =
  | { kind: "user"; code: string }
  | { kind: "player"; code: string };

/**
 * Reads a code as typed or pasted: case, spaces and dashes don't matter.
 * Eight characters are a user code; `P` plus eight is a player code.
 */
export function parseCodeInput(value: unknown): ParsedCode | null {
  if (typeof value !== "string" || value.length > 40) return null;
  const compact = value.toUpperCase().replace(/[\s-]/g, "");
  if (IDENTITY_CODE_PATTERN.test(compact)) {
    return { kind: "user", code: compact };
  }
  if (compact.length === 9 && compact.startsWith("P")) {
    const code = compact.slice(1);
    if (IDENTITY_CODE_PATTERN.test(code)) return { kind: "player", code };
  }
  return null;
}

export type FriendRelation =
  | "self"
  | "friends"
  | "request-sent"
  | "request-received"
  | "none";

export type FoundAccount = {
  displayName: string | null;
  relation: FriendRelation;
};

export type FriendOverview = {
  friends: Array<{
    accountId: string;
    displayName: string | null;
    since: number;
    myPlayer: { id: string; name: string } | null;
    theirNameForMe: string | null;
  }>;
  received: Array<{
    requestId: string;
    displayName: string | null;
    sentAt: number;
    claimedPlayerCode: string | null;
    claimedPlayer: { id: string; name: string } | null;
  }>;
  sent: Array<{
    requestId: string;
    displayName: string | null;
    sentAt: number;
    myPlayerName: string | null;
  }>;
};

/**
 * What each `friend:` error raised by the database functions means to the
 * person, and the HTTP status the API answers with.
 */
const FRIEND_ERRORS = {
  locked: [423, "This account is locked while deletion is pending"],
  "name-required": [409, "Save your name first, so your friend knows who you are"],
  "not-found": [404, "No one has that user code. Check it and try again"],
  self: [400, "That's your own code"],
  "already-friends": [409, "You're already friends"],
  "request-pending": [409, "You've already sent them a request"],
  "request-waiting": [409, "They've already sent you a request. Accept it below"],
  "declined-recently": [
    429,
    `They declined your last request. You can ask again ${DECLINE_WAIT_DAYS} days after that`,
  ],
  "too-many-pending": [
    429,
    `You have ${MAX_PENDING_SENT_REQUESTS} requests waiting. Cancel one or wait for answers`,
  ],
  "player-unavailable": [409, "That player can't be linked. Pick another one"],
  "request-not-found": [404, "That request is no longer waiting"],
  "invalid-name": [400, "Player names must be 1 to 80 characters"],
  "name-taken": [409, "You already have a player with that name. Pick them, or choose another name"],
  "not-friends": [404, "You're not friends with this person"],
} as const satisfies Record<string, readonly [number, string]>;

export type FriendErrorCode = keyof typeof FRIEND_ERRORS;

/** Maps a database error from a friend function to a response, if it is one. */
export function friendErrorFromDatabase(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  const match = /^friend:([a-z-]+)$/.exec(message);
  if (!match || !(match[1] in FRIEND_ERRORS)) return null;
  const code = match[1] as FriendErrorCode;
  const [status, text] = FRIEND_ERRORS[code];
  return { status, error: text, code: `friend-${code}` };
}
