import { timingSafeEqual } from "node:crypto";

import type { PokerSession, SessionResult } from "./types";

export const MAX_SESSIONS_PER_REQUEST = 250;
const MAX_RESULTS_PER_SESSION = 10;
const MAX_GAME_NAME_LENGTH = 80;

function asSafeInteger(
  value: unknown,
  field: string,
  { min = Number.MIN_SAFE_INTEGER }: { min?: number } = {},
) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min) {
    throw new Error(`${field} must be a valid whole number`);
  }
  return number;
}

export function validateSession(input: unknown): PokerSession {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid session");
  }

  const candidate = input as Record<string, unknown>;
  const id = String(candidate.id || "");
  if (!/^[A-Za-z0-9._:-]{1,100}$/.test(id)) {
    throw new Error("Invalid session id");
  }

  const date = asSafeInteger(candidate.date, "date", { min: 1 });
  const ended = asSafeInteger(candidate.ended, "ended", { min: date });
  const ante = asSafeInteger(candidate.ante, "ante", { min: 1 });
  const startStack = asSafeInteger(candidate.startStack, "starting stack", {
    min: 0,
  });
  const hands = asSafeInteger(candidate.hands, "hands", { min: 1 });
  const name = String(candidate.name || "").trim();
  if (name.length > MAX_GAME_NAME_LENGTH) {
    throw new Error(
      `Game names must be ${MAX_GAME_NAME_LENGTH} characters or fewer`,
    );
  }

  if (
    !Array.isArray(candidate.results) ||
    candidate.results.length < 2 ||
    candidate.results.length > MAX_RESULTS_PER_SESSION
  ) {
    throw new Error("A session must have 2 to 10 player results");
  }

  const results: SessionResult[] = candidate.results.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid player result");
    }
    const result = value as Record<string, unknown>;
    const name = String(result.name || "").trim();
    const playerId = result.playerId
      ? String(result.playerId).trim()
      : undefined;
    if (!name || name.length > 80) {
      throw new Error("Player names must be 1 to 80 characters");
    }
    if (playerId && !/^[A-Za-z0-9._:-]{1,100}$/.test(playerId)) {
      throw new Error("Invalid player id");
    }
    return {
      ...(playerId ? { playerId } : {}),
      name,
      net: asSafeInteger(result.net, "net result"),
      end: asSafeInteger(result.end, "ending stack", { min: 0 }),
    };
  });

  return {
    id,
    ...(name ? { name } : {}),
    date,
    ended,
    ante,
    startStack,
    hands,
    results,
  };
}

export function passwordMatches(candidate?: string | null, expected?: string) {
  if (!candidate || !expected) return false;
  const supplied = Buffer.from(candidate);
  const secret = Buffer.from(expected);
  return (
    supplied.length === secret.length && timingSafeEqual(supplied, secret)
  );
}
