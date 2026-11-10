import { playerBuyIns, tableLog } from "./game.ts";
import { chipCurrency, formatChips } from "./money.ts";
import type { GameState, Player, PokerSession, SessionResult } from "./types";

/**
 * The host as the bank (plan entry "buy-ins paid to the bank (plan)"):
 * players pay the host for each buy-in at the table, and the host pays out
 * cash-outs there too. During the game each buy-in is paid or still owed;
 * a saved game keeps only the totals, which is all Settle up needs.
 */

/** Whether this player is the host, who is the bank: their buy-ins are paid. */
export function isBankPlayer(game: GameState, playerIndex: number) {
  const id = game.players[playerIndex]?.id;
  return Boolean(game.bankPlayerId && id === game.bankPlayerId);
}

/** The places in a player's buy-ins still owed to the bank, oldest first. */
export function unpaidBuyIns(game: GameState, playerIndex: number) {
  const player = game.players[playerIndex];
  if (!game.hostIsBank || !player || isBankPlayer(game, playerIndex)) return [];
  const count = playerBuyIns(game, playerIndex).length;
  return [...new Set(player.unpaidBuyIns ?? [])]
    .filter((place) => Number.isInteger(place) && place >= 0 && place < count)
    .sort((a, b) => a - b);
}

/** What a player still owes the bank for their buy-ins, in chips. */
export function owedToBank(game: GameState, playerIndex: number) {
  const buyIns = playerBuyIns(game, playerIndex);
  return unpaidBuyIns(game, playerIndex).reduce(
    (sum, place) => sum + buyIns[place],
    0,
  );
}

/** What the bank still owes a player who cashed out and wasn't paid. */
export function owedByBank(game: GameState, playerIndex: number) {
  const player = game.players[playerIndex];
  return game.hostIsBank && player?.left && !player.paidOut
    ? Math.max(0, player.stack)
    : 0;
}

function setUnpaid(player: Player, places: number[]) {
  if (places.length) player.unpaidBuyIns = places;
  else delete player.unpaidBuyIns;
}

/**
 * Notes whether the buy-in just added (the player's last) was paid. Call
 * after every buy-in in a bank game. Places at or past it are dropped first:
 * an undo can leave marks for buy-ins that no longer exist.
 */
export function noteBuyInPaid(game: GameState, playerIndex: number, paid: boolean) {
  const player = game.players[playerIndex];
  if (!game.hostIsBank || !player) return;
  const last = playerBuyIns(game, playerIndex).length - 1;
  const kept = (player.unpaidBuyIns ?? []).filter((place) => place < last);
  setUnpaid(
    player,
    paid || isBankPlayer(game, playerIndex) ? kept : [...kept, last],
  );
}

/**
 * Marks one of a player's buy-ins paid or owed. Returns false, changing
 * nothing, when it doesn't apply or wouldn't change anything.
 */
export function setBuyInPaid(
  game: GameState,
  playerIndex: number,
  place: number,
  paid: boolean,
) {
  const player = game.players[playerIndex];
  const count = playerBuyIns(game, playerIndex).length;
  if (
    !game.hostIsBank ||
    !player ||
    isBankPlayer(game, playerIndex) ||
    !Number.isInteger(place) ||
    place < 0 ||
    place >= count
  ) {
    return false;
  }
  const unpaid = unpaidBuyIns(game, playerIndex);
  if (unpaid.includes(place) !== paid) return false;
  setUnpaid(
    player,
    paid ? unpaid.filter((other) => other !== place) : [...unpaid, place].sort((a, b) => a - b),
  );
  return true;
}

/** Marks whether the bank paid a player who cashed out. */
export function setPaidOut(game: GameState, playerIndex: number, paid: boolean) {
  const player = game.players[playerIndex];
  if (!game.hostIsBank || !player?.left || Boolean(player.paidOut) === paid) {
    return false;
  }
  if (paid) player.paidOut = true;
  else delete player.paidOut;
  return true;
}

/**
 * The bank's part of a saved result: what the player paid the bank at the
 * table, what the bank paid them, and whether they are the bank. Nothing
 * outside a bank game. `end` is the chips they finished with.
 */
export function bankResult(
  game: GameState,
  playerIndex: number,
  end: number,
): Pick<SessionResult, "bankPaidIn" | "bankPaidOut" | "bank"> {
  if (!game.hostIsBank) return {};
  const player = game.players[playerIndex];
  const bought = playerBuyIns(game, playerIndex).reduce((sum, amount) => sum + amount, 0);
  return {
    bankPaidIn: bought - owedToBank(game, playerIndex),
    bankPaidOut: player?.left && player.paidOut ? Math.max(0, end) : 0,
    ...(isBankPlayer(game, playerIndex) ? { bank: true as const } : {}),
  };
}

/**
 * A saved bank game's flags back on its players, for Continue game. Only the
 * totals were saved, so the owed amount is put on the latest buy-ins that
 * add up to it exactly (any set that does gives the same Settle up).
 */
export function restoreBankPlayer(
  session: Pick<PokerSession, "startStack">,
  result: SessionResult,
): Pick<Player, "unpaidBuyIns" | "paidOut"> {
  if (result.bankPaidIn === undefined) return {};
  const buyIns = result.buyIns?.length ? result.buyIns : [session.startStack];
  const bought = buyIns.reduce((sum, amount) => sum + amount, 0);
  const owed = bought - result.bankPaidIn;
  const places = owed > 0 ? placesAddingUpTo(buyIns, owed) : [];
  return {
    ...(places.length ? { unpaidBuyIns: places } : {}),
    ...(result.bankPaidOut ? { paidOut: true } : {}),
  };
}

/** The latest buy-ins adding up to `total` exactly, oldest first; [] if none. */
function placesAddingUpTo(amounts: number[], total: number) {
  // Sums reachable using buy-ins from the latest back, with the places used.
  let reach = new Map<number, number[]>([[0, []]]);
  for (let place = amounts.length - 1; place >= 0; place -= 1) {
    const next = new Map(reach);
    for (const [sum, places] of reach) {
      const more = sum + amounts[place];
      if (more <= total && !next.has(more)) next.set(more, [place, ...places]);
    }
    reach = next;
    if (reach.has(total)) return reach.get(total)!;
    if (reach.size > 20_000) break;
  }
  return [];
}

function money(game: GameState, chips: number) {
  return formatChips(chips, game.chipUnit, chipCurrency(game.currency, game.chipValue));
}

/** The log line for marking a buy-in paid or owed. */
export function bankLine(
  game: GameState,
  playerIndex: number,
  place: number,
  paid: boolean,
) {
  const player = game.players[playerIndex];
  const amount = playerBuyIns(game, playerIndex)[place] ?? 0;
  return paid
    ? `${player.name} pays the bank ${money(game, amount)}`
    : `${player.name} owes the bank ${money(game, amount)}`;
}

/** The log line for marking a cash-out paid by the bank or owed. */
export function paidOutLine(game: GameState, playerIndex: number, paid: boolean) {
  const player = game.players[playerIndex];
  return paid
    ? `The bank pays ${player.name} ${money(game, player.stack)}`
    : `The bank owes ${player.name} ${money(game, player.stack)}`;
}

/**
 * Hand by hand: marks one of a player's buy-ins paid or owed, at any time,
 * with a line in the log (between hands, like a rebuy). Marking it back
 * undoes it.
 */
export function tableSetBuyInPaid(
  game: GameState,
  playerIndex: number,
  place: number,
  paid: boolean,
) {
  if (!setBuyInPaid(game, playerIndex, place, paid)) return false;
  tableLog(game, bankLine(game, playerIndex, place, paid));
  return true;
}

/** Hand by hand: marks whether the bank paid a player who cashed out. */
export function tableSetPaidOut(game: GameState, playerIndex: number, paid: boolean) {
  if (!setPaidOut(game, playerIndex, paid)) return false;
  tableLog(game, paidOutLine(game, playerIndex, paid));
  return true;
}

/**
 * For the live link (user decision 2026-11-10: players see it too): what a
 * player still owes the bank, and the bank owes them. Only what isn't zero.
 */
export function liveBankFields(game: GameState, playerIndex: number) {
  const owed = owedToBank(game, playerIndex);
  const bankOwes = owedByBank(game, playerIndex);
  return {
    ...(owed ? { owed } : {}),
    ...(bankOwes ? { bankOwes } : {}),
  };
}

/**
 * The server's check of those fields in a live snapshot: whole chips, owed
 * at most what was bought in, owed by the bank at most what they left with.
 */
export function validLiveBankFields(
  player: Record<string, unknown>,
  name: string,
  limits: { invested: number; cashedOut: number | undefined },
) {
  const amount = (value: unknown, field: string, max: number) => {
    if (value === undefined) return undefined;
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > max
    ) {
      throw new Error(`Invalid ${field} for ${name}`);
    }
    return value || undefined;
  };
  const owed = amount(player.owed, "amount owed to the bank", limits.invested);
  const bankOwes = amount(
    player.bankOwes,
    "amount the bank owes",
    limits.cashedOut ?? 0,
  );
  return {
    ...(owed ? { owed } : {}),
    ...(bankOwes ? { bankOwes } : {}),
  };
}
