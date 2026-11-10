import { chipsInCents } from "./money.ts";
import { deriveSessionAccounting } from "./accounting.ts";
import type { ChipValue, PokerSession } from "./types";

/**
 * The most a chip value's price can be, in hundredths of a currency unit
 * (₹1,00,00,00,000). Keeps every converted amount far inside the safe range.
 */
export const MAX_CHIP_VALUE_CENTS = 100_000_000_000;

/**
 * A chip value, checked: whole numbers, at least one chip for at least one
 * hundredth. Null for anything else.
 */
export function normalizeChipValue(value: unknown): ChipValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const chips = Number(input.chips);
  const cents = Number(input.cents);
  if (
    !Number.isSafeInteger(chips) ||
    chips < 1 ||
    !Number.isSafeInteger(cents) ||
    cents < 1 ||
    cents > MAX_CHIP_VALUE_CENTS
  ) {
    return null;
  }
  return { chips, cents };
}

/** A saved game's chip value; absent or null is none. Throws on anything else. */
export function parseChipValue(value: unknown): ChipValue | undefined {
  if (value === undefined || value === null) return undefined;
  const chipValue = normalizeChipValue(value);
  if (!chipValue) throw new Error("Invalid chip value");
  return chipValue;
}

export function sameChipValue(
  a: ChipValue | null | undefined,
  b: ChipValue | null | undefined,
) {
  return (a?.chips ?? null) === (b?.chips ?? null) &&
    (a?.cents ?? null) === (b?.cents ?? null);
}

// BigInt literals need ES2020; the project targets lower.
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);

/** `numerator / denominator` rounded down, for any signs (denominator > 0). */
function floorDiv(numerator: bigint, denominator: bigint) {
  const quotient = numerator / denominator;
  return numerator % denominator < ZERO ? quotient - ONE : quotient;
}

function toSafeNumber(value: bigint, label: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new Error(`${label} is too large`);
  }
  return number;
}

/**
 * Stored chips as money, in hundredths of the currency: with a chip value,
 * at its price (rounded to the nearest hundredth, halves away from zero);
 * without one, a chip is one unit of the currency, as the app always counted.
 */
export function chipsToCents(
  chips: number,
  session: Pick<PokerSession, "chipUnit" | "chipValue">,
) {
  const value = session.chipValue;
  if (!value) return chipsInCents(chips, session.chipUnit);
  const exact = BigInt(chips) * BigInt(value.cents);
  const divisor = BigInt(value.chips);
  const size = (TWO * (exact < ZERO ? -exact : exact) + divisor) / (TWO * divisor);
  return toSafeNumber(exact < ZERO ? -size : size, "The amount");
}

export type MoneyResult = {
  /** Won (positive) or lost, in hundredths of the currency. */
  net: number;
  /** Everything bought in, in hundredths of the currency. */
  invested: number;
};

export type SessionMoney = {
  /** One per result, in the session's order. */
  results: MoneyResult[];
  /** The house's rake, in hundredths of the currency. */
  house: number;
};

/**
 * A saved game's results in money. Rounding each player's result on its own
 * could leave a hundredth over or short, so the results are rounded to add
 * up exactly to minus the house's rake (zero without rake): each is rounded
 * down, and the hundredths still missing go to the largest remainders, the
 * earlier result first on a tie. Throws if the game's chips don't balance.
 */
export function sessionMoney(
  session: Pick<
    PokerSession,
    "results" | "startStack" | "rake" | "chipUnit" | "chipValue"
  >,
): SessionMoney {
  const accounting = deriveSessionAccounting(session);
  const invested = accounting.results.map((result) =>
    chipsToCents(result.invested, session),
  );
  const house = chipsToCents(session.rake ?? 0, session);
  const value = session.chipValue;
  if (!value) {
    return {
      results: session.results.map((result, index) => ({
        net: chipsInCents(result.net, session.chipUnit),
        invested: invested[index],
      })),
      house,
    };
  }
  const divisor = BigInt(value.chips);
  const parts = session.results.map((result, index) => {
    const exact = BigInt(result.net) * BigInt(value.cents);
    const floor = floorDiv(exact, divisor);
    return { index, floor, remainder: exact - floor * divisor };
  });
  const missing =
    BigInt(-house) - parts.reduce((sum, part) => sum + part.floor, ZERO);
  const order = [...parts].sort((a, b) =>
    a.remainder === b.remainder
      ? a.index - b.index
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  const extra = new Set(
    order.slice(0, Math.max(0, Number(missing))).map((part) => part.index),
  );
  return {
    results: parts.map((part) => ({
      net: toSafeNumber(
        part.floor + (extra.has(part.index) ? ONE : ZERO),
        "The result",
      ),
      invested: invested[part.index],
    })),
    house,
  };
}

export type Balance = {
  /** Who this is: a player's name, or "the house". */
  name: string;
  /** Owed to them (positive) or owed by them, in hundredths. */
  cents: number;
};

export type Transfer = {
  from: string;
  to: string;
  cents: number;
};

/** Above this many people, settle with the plain largest-first matching. */
const MAX_EXACT_PEOPLE = 16;

/** Pays off one group: the biggest debt to the biggest credit, repeatedly. */
function settleGroup(group: Balance[]): Transfer[] {
  const debtors = group
    .filter((entry) => entry.cents < 0)
    .map((entry) => ({ name: entry.name, left: -entry.cents }));
  const creditors = group
    .filter((entry) => entry.cents > 0)
    .map((entry) => ({ name: entry.name, left: entry.cents }));
  const transfers: Transfer[] = [];
  const largest = (list: Array<{ left: number }>) =>
    list.reduce(
      (best, entry, index) => (entry.left > list[best].left ? index : best),
      0,
    );
  while (debtors.some((entry) => entry.left > 0)) {
    const debtor = debtors[largest(debtors)];
    const creditor = creditors[largest(creditors)];
    if (!creditor || creditor.left <= 0) break;
    const cents = Math.min(debtor.left, creditor.left);
    transfers.push({ from: debtor.name, to: creditor.name, cents });
    debtor.left -= cents;
    creditor.left -= cents;
  }
  return transfers;
}

/**
 * Who pays whom, with the fewest transfers. Balances must add up to zero.
 * Everyone owed or owing is split into the most groups that settle among
 * themselves; a group of n people then needs n − 1 transfers, so more groups
 * means fewer transfers (found exactly for up to 16 people). Within a group
 * the biggest debt pays the biggest credit first. Largest transfers first.
 */
export function settleUp(balances: Balance[]): Transfer[] {
  const people = balances.filter((entry) => entry.cents !== 0);
  if (people.reduce((sum, entry) => sum + entry.cents, 0) !== 0) {
    throw new Error("Results don't add up to zero");
  }
  if (!people.length) return [];
  if (people.length > MAX_EXACT_PEOPLE) return sortTransfers(settleGroup(people));

  // best[mask]: the most groups adding up to zero that the people in mask
  // can be split into, for any order of removing them one at a time.
  const count = people.length;
  const full = (1 << count) - 1;
  const sum = new Array<number>(full + 1).fill(0);
  const best = new Array<number>(full + 1).fill(0);
  for (let mask = 1; mask <= full; mask += 1) {
    const low = mask & -mask;
    sum[mask] = sum[mask ^ low] + people[Math.log2(low)].cents;
    let most = 0;
    for (let index = 0; index < count; index += 1) {
      if (mask & (1 << index)) most = Math.max(most, best[mask ^ (1 << index)]);
    }
    best[mask] = most + (sum[mask] === 0 ? 1 : 0);
  }

  // Walk back from everyone: each step drops one person while keeping the
  // best split. Wherever the people left add up to zero, a group ends.
  const groups: Balance[][] = [];
  let mask = full;
  let group: Balance[] = [];
  while (mask) {
    const target = best[mask] - (sum[mask] === 0 ? 1 : 0);
    let index = 0;
    while (!(mask & (1 << index)) || best[mask ^ (1 << index)] !== target) {
      index += 1;
    }
    group.push(people[index]);
    mask ^= 1 << index;
    if (sum[mask] === 0) {
      groups.push(group);
      group = [];
    }
  }
  return sortTransfers(groups.flatMap(settleGroup));
}

function sortTransfers(transfers: Transfer[]) {
  return transfers.sort(
    (a, b) =>
      b.cents - a.cents ||
      a.from.localeCompare(b.from) ||
      a.to.localeCompare(b.to),
  );
}

/** The name the house goes by in a settle-up. */
export const HOUSE_NAME = "The house";

/** The house's key in a payment; players are keyed by their place in the results. */
export const HOUSE_KEY = "house";

/** The bank's name when the host was the bank but didn't play. */
export const BANK_NAME = "The bank";

/** The bank's key in a payment when it isn't one of the players. */
export const BANK_KEY = "bank";

/**
 * Whether a saved game had the host as the bank: every result says what was
 * paid at the table. Throws when only some do, or the amounts can't be right.
 */
export function bankGame(session: Pick<PokerSession, "results">) {
  const marked = session.results.filter(
    (result) =>
      result.bankPaidIn !== undefined || result.bankPaidOut !== undefined,
  ).length;
  if (!marked) {
    if (session.results.some((result) => result.bank)) {
      throw new Error("Only a bank game has a bank");
    }
    return false;
  }
  if (marked !== session.results.length) {
    throw new Error("Every result in a bank game says what was paid");
  }
  if (session.results.filter((result) => result.bank).length > 1) {
    throw new Error("A game has one bank");
  }
  for (const result of session.results) {
    const paidIn = result.bankPaidIn;
    const paidOut = result.bankPaidOut;
    if (
      !Number.isSafeInteger(paidIn) ||
      !Number.isSafeInteger(paidOut) ||
      paidIn! < 0 ||
      paidOut! < 0 ||
      paidOut! > Math.max(0, result.end)
    ) {
      throw new Error(`Check what ${result.name} paid at the table`);
    }
  }
  return true;
}

/**
 * A payment Settle up shows, with who pays whom as keys that don't change
 * with names: each player's index in the game's results ("0" to "9"), or
 * "house". Paid marks are stored against these (lib/poker/payments.ts).
 */
export type SettlementTransfer = Transfer & { fromKey: string; toKey: string };

export type Settlement = {
  /** Each player's result in money, biggest winner first. */
  players: Array<{ name: string; playerId?: string; net: number }>;
  /** The house's rake in hundredths; 0 without rake. */
  house: number;
  /**
   * The host was the bank: money paid at the table is taken off, so the
   * transfers cover only what is still owed. Absent in other games.
   */
  bank?: {
    /** Paid to the bank at the table, in hundredths. */
    paidIn: number;
    /** Paid out by the bank at the table, in hundredths. */
    paidOut: number;
    /** The bank's name in the transfers: the host's, or "The bank". */
    name: string;
  };
  transfers: SettlementTransfer[];
};

/**
 * Settling a saved game: everyone's result in money and who pays whom.
 * Two players with the same name are told apart by a number, since a
 * transfer names people. The rake is owed to the house.
 */
export function settleSession(
  session: Pick<
    PokerSession,
    "results" | "startStack" | "rake" | "chipUnit" | "chipValue"
  >,
): Settlement {
  const money = sessionMoney(session);
  const seen = new Map<string, number>();
  const names = session.results.map((result) => {
    const key = result.name.trim().toLowerCase();
    const times = (seen.get(key) ?? 0) + 1;
    seen.set(key, times);
    return times === 1 ? result.name : `${result.name} (${times})`;
  });
  const players = session.results
    .map((result, index) => ({
      name: names[index],
      ...(result.playerId ? { playerId: result.playerId } : {}),
      net: money.results[index].net,
    }))
    .sort((a, b) => b.net - a.net);
  const keys = new Map<string, string>(
    names.map((name, index) => [name, String(index)]),
  );
  if (money.house) keys.set(HOUSE_NAME, HOUSE_KEY);

  // Each person is owed their result. In a bank game, money paid at the
  // table moves between them and the bank: a player who paid the bank is
  // owed it back, one the bank paid out is owed that much less, and the
  // bank the other way round. The balances still add up to zero.
  const balances = money.results.map((result) => result.net);
  let bank: Settlement["bank"];
  // Owed to (or by) a bank that isn't one of the players.
  let bankBalance = 0;
  const banked = bankGame(session);
  if (banked) {
    const paidIn = session.results.map((result) =>
      chipsToCents(result.bankPaidIn!, session),
    );
    const paidOut = session.results.map((result) =>
      chipsToCents(result.bankPaidOut!, session),
    );
    const totalIn = paidIn.reduce((sum, cents) => sum + cents, 0);
    const totalOut = paidOut.reduce((sum, cents) => sum + cents, 0);
    paidIn.forEach((cents, index) => {
      balances[index] += cents - paidOut[index];
    });
    const host = session.results.findIndex((result) => result.bank);
    if (host >= 0) balances[host] += totalOut - totalIn;
    bank = {
      paidIn: totalIn,
      paidOut: totalOut,
      name: host >= 0 ? names[host] : BANK_NAME,
    };
    if (host < 0) keys.set(BANK_NAME, BANK_KEY);
    if (host < 0) bankBalance = totalOut - totalIn;
  }
  const transfers = settleUp([
    ...names.map((name, index) => ({ name, cents: balances[index] })),
    ...(money.house ? [{ name: HOUSE_NAME, cents: money.house }] : []),
    ...(bankBalance ? [{ name: BANK_NAME, cents: bankBalance }] : []),
  ]).map((transfer) => ({
    ...transfer,
    fromKey: keys.get(transfer.from)!,
    toKey: keys.get(transfer.to)!,
  }));
  return { players, house: money.house, ...(bank ? { bank } : {}), transfers };
}
