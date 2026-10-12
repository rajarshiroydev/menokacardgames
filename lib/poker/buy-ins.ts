import { type ChipUnit, formatChips } from "./money.ts";
import type { RebuyRules } from "./types";

/** Initial buy-in plus rebuys a player can have in one session. */
export const MAX_BUY_INS = 64;
/** Most rebuys a host can allow; the rest of MAX_BUY_INS is the first buy-in. */
export const MAX_REBUYS = MAX_BUY_INS - 1;

/**
 * Any buy-in, first or rebuy, is a positive whole number of chips. The
 * starting stack is only the default: since 12 October 2026 a game can let
 * players choose their own amounts. Older games used the starting stack, or
 * half the previous buy-in for rebuys before 24 September 2026; both fit.
 */
export function isValidBuyIn(amount: unknown): amount is number {
  return typeof amount === "number" && Number.isSafeInteger(amount) && amount > 0;
}

/**
 * A buy-in this many times the starting stack, or this many times smaller,
 * is likely a typo, so the app asks the host to check it. It is still allowed.
 */
export const UNUSUAL_BUY_IN_FACTOR = 5;

export function isUnusualBuyIn(amount: number, startStack: number) {
  return (
    amount > startStack * UNUSUAL_BUY_IN_FACTOR ||
    amount * UNUSUAL_BUY_IN_FACTOR < startStack
  );
}

/** The rules as stored: absent when neither limit is set. */
export function normalizeRebuyRules(
  rules: RebuyRules | null | undefined,
): RebuyRules | undefined {
  if (!rules || (rules.maxRebuys === null && rules.closeAtBigBlind === null)) {
    return undefined;
  }
  return {
    maxRebuys: rules.maxRebuys,
    closeAtBigBlind: rules.closeAtBigBlind,
  };
}

function parseLimit(value: unknown, field: string, min: number, max: number) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new Error(`${field} must be a whole number from ${min} to ${max}`);
  }
  return number;
}

/**
 * Rebuy limits sent to the server (a saved game or a live snapshot).
 * Absent, null or both limits off is no limits. Throws on anything else.
 */
export function parseRebuyRules(value: unknown): RebuyRules | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid rebuy rules");
  }
  const input = value as Record<string, unknown>;
  return normalizeRebuyRules({
    maxRebuys: parseLimit(input.maxRebuys, "The rebuy limit", 0, MAX_REBUYS),
    closeAtBigBlind: parseLimit(
      input.closeAtBigBlind,
      "The big blind that closes rebuys",
      1,
      Number.MAX_SAFE_INTEGER,
    ),
  });
}

export type RebuyBlock = "max" | "closed";

/**
 * Why a busted player can't rebuy under `rules`, or null when they can.
 * `rebuysUsed` doesn't count the first buy-in; `bigBlind` is the current one.
 */
export function rebuyBlock(
  rules: RebuyRules | null | undefined,
  rebuysUsed: number,
  bigBlind: number,
): RebuyBlock | null {
  if (!rules) return null;
  if (rules.maxRebuys !== null && rebuysUsed >= rules.maxRebuys) return "max";
  if (rules.closeAtBigBlind !== null && bigBlind >= rules.closeAtBigBlind) {
    return "closed";
  }
  return null;
}

/** "No rebuys", "Up to 2 rebuys each" or "Unlimited rebuys". */
export function describeMaxRebuys(maxRebuys: number | null) {
  if (maxRebuys === null) return "Unlimited rebuys";
  if (maxRebuys === 0) return "No rebuys";
  return `Up to ${maxRebuys} rebuy${maxRebuys === 1 ? "" : "s"} each`;
}

/**
 * The rules in one line, for example "Up to 2 rebuys each, until the big
 * blind reaches ₹800". Null when there are no limits.
 */
export function describeRebuyRules(
  rules: RebuyRules | null | undefined,
  currency?: string,
  chipUnit?: ChipUnit,
) {
  const stored = normalizeRebuyRules(rules);
  if (!stored) return null;
  const count = describeMaxRebuys(stored.maxRebuys);
  if (stored.closeAtBigBlind === null || stored.maxRebuys === 0) return count;
  return `${count}, until the big blind reaches ${formatChips(
    stored.closeAtBigBlind,
    chipUnit,
    currency,
  )}`;
}
