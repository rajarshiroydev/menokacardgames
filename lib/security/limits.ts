import { TOO_MANY_REQUESTS_MESSAGE } from "./rate-limit-message.ts";
import { logSecurityEvent } from "./security-log.ts";

/**
 * Per-account rate limits and storage caps (pre-launch audit step 4; user
 * decisions 2026-10-29). The database counts and enforces them (migration
 * 0033): `consume_rate_limit()` takes these numbers, and the storage caps
 * are fixed in the migration's triggers. Change a number together with
 * docs/FEATURES.md, and a cap together with a new migration.
 */
export const RATE_LIMITS = {
  /** Any API request that changes data. A host with the live link sends about 26 a minute. */
  writes: { limit: 60, windowSeconds: 60 },
  /** Results card pictures, the host's and friends' together. */
  cards: { limit: 120, windowSeconds: 10 * 60 },
  /** Finding someone by user code, and sending friend requests. */
  "friend-lookups": { limit: 30, windowSeconds: 10 * 60 },
  /** Bytes of requests that save, import or continue games. */
  "game-data": { limit: 25 * 1024 * 1024, windowSeconds: 24 * 60 * 60 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

export const STORAGE_CAPS = { players: 500, games: 5000, backups: 5 } as const;

const RATE_LIMIT_MESSAGES: Record<RateLimitBucket, string> = {
  writes: TOO_MANY_REQUESTS_MESSAGE,
  cards: "Too many results cards in a short time. Try again in a few minutes.",
  "friend-lookups":
    "Too many friend code lookups in a short time. Try again in a few minutes.",
  "game-data": "You've saved a lot of game data today. Try again tomorrow.",
};

const QUOTA_MESSAGES = {
  players: `You can have up to ${STORAGE_CAPS.players} players. Delete players you no longer play with to add more.`,
  games: `You can keep up to ${STORAGE_CAPS.games.toLocaleString("en-US")} games. Permanently delete discarded games to save more.`,
} as const;

export type LimitError =
  | {
      kind: "rate";
      status: 429;
      error: string;
      code: "rate-limited";
      bucket: RateLimitBucket;
      retryAfterSeconds: number;
    }
  | {
      kind: "quota";
      status: 409;
      error: string;
      code: `quota-${keyof typeof QUOTA_MESSAGES}`;
    };

function isBucket(value: string): value is RateLimitBucket {
  return Object.hasOwn(RATE_LIMITS, value);
}

/** A refused rate limit or storage cap from the database, if that's what it is. */
export function limitErrorFromDatabase(error: unknown): LimitError | null {
  const message = error instanceof Error ? error.message : "";

  const rate = /^rate:limited:([a-z-]+):(\d+)$/.exec(message);
  if (rate && isBucket(rate[1])) {
    return {
      kind: "rate",
      status: 429,
      error: RATE_LIMIT_MESSAGES[rate[1]],
      code: "rate-limited",
      bucket: rate[1],
      retryAfterSeconds: Math.max(1, Number(rate[2])),
    };
  }

  const quota = /^quota:(players|games)$/.exec(message);
  if (quota) {
    const kind = quota[1] as keyof typeof QUOTA_MESSAGES;
    return {
      kind: "quota",
      status: 409,
      error: QUOTA_MESSAGES[kind],
      code: `quota-${kind}`,
    };
  }
  return null;
}

/** The API response for a refused limit or cap, or null for any other error. */
export function limitErrorResponse(error: unknown) {
  const limit = limitErrorFromDatabase(error);
  if (!limit) return null;
  if (limit.kind === "rate") {
    logSecurityEvent("rate-limited", { bucket: limit.bucket });
  } else {
    logSecurityEvent("storage-cap-reached", { cap: limit.code });
  }
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (limit.kind === "rate") {
    headers["Retry-After"] = String(limit.retryAfterSeconds);
  }
  return Response.json(
    { error: limit.error, code: limit.code },
    { status: limit.status, headers },
  );
}
