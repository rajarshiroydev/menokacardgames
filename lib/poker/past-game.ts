import { MAX_BUY_INS } from "./buy-ins.ts";
import type { ChipUnit } from "./money.ts";
import { inUnit } from "./stakes.ts";
import type { PokerSession } from "./types";

/**
 * A game played without the app, entered afterwards (plan entry "enter a
 * past game (plan)"). It is saved as an ordinary quick ledger, so the server
 * checks it like any other. Amounts here are in hundredths, as typed; the
 * saved game uses whole chips unless an amount has cents.
 */
export type PastGamePlayer = {
  playerId: string;
  name: string;
  /** Each buy-in in hundredths, the first one first. */
  buyIns: Array<number | null>;
  /** Chips at the end in hundredths; null until entered. */
  end: number | null;
};

export type PastGameDraft = {
  name: string;
  /** "2026-11-08", from a date input. */
  date: string;
  /** "21:30", or "" when not given. */
  time: string;
  /** How long it was played, or null when not given. */
  minutes: number | null;
  players: PastGamePlayer[];
};

const MAX_NAME_LENGTH = 80;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;

/** When the game started on this phone's clock, or null for a bad date. */
export function pastGameStart(draft: Pick<PastGameDraft, "date" | "time">) {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(draft.date);
  if (!date) return null;
  const time = /^(\d{2}):(\d{2})$/.exec(draft.time);
  const [, year, month, day] = date.map(Number);
  const start = new Date(
    year,
    month - 1,
    day,
    time ? Number(time[1]) : 0,
    time ? Number(time[2]) : 0,
  );
  return start.getFullYear() === year && start.getMonth() === month - 1
    ? start.getTime()
    : null;
}

const sum = (amounts: ReadonlyArray<number | null>) =>
  amounts.reduce<number>((total, amount) => total + (amount ?? 0), 0);

/** Everything bought in, in hundredths. */
export function pastGameBought(players: ReadonlyArray<PastGamePlayer>) {
  return players.reduce((total, player) => total + sum(player.buyIns), 0);
}

/**
 * The chips at the end against the chips bought in: positive when the ends
 * are short, negative when over, 0 when they balance (as `ledgerCountGap`).
 */
export function pastGameGap(players: ReadonlyArray<PastGamePlayer>) {
  return pastGameBought(players) - sum(players.map((player) => player.end));
}

/**
 * The quick ledger to save for a past game, or an error the host can act on.
 * `now` is the time it is saved, for its id and the no-future check.
 */
export function pastGameSession(draft: PastGameDraft, now: number): PokerSession {
  const name = draft.name.trim();
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`Game names must be ${MAX_NAME_LENGTH} characters or fewer`);
  }
  const start = pastGameStart(draft);
  if (start === null) throw new Error("Choose the day the game was played");
  const ended = start + (draft.minutes ?? 0) * 60_000;
  if (start > now) throw new Error("A past game can't start in the future");
  if (ended > now) throw new Error("A past game can't end in the future");
  if (draft.players.length < MIN_PLAYERS || draft.players.length > MAX_PLAYERS) {
    throw new Error(`Pick ${MIN_PLAYERS} to ${MAX_PLAYERS} players`);
  }
  for (const player of draft.players) {
    if (
      !player.buyIns.length ||
      player.buyIns.some((amount) => amount === null || amount <= 0)
    ) {
      throw new Error(`Every buy-in needs an amount above 0 (${player.name})`);
    }
    if (player.buyIns.length > MAX_BUY_INS) {
      throw new Error(`${player.name} has more than ${MAX_BUY_INS} buy-ins`);
    }
    if (player.end === null) throw new Error(`Enter ${player.name}'s chips at the end`);
  }
  if (pastGameGap(draft.players) !== 0) {
    throw new Error("The chips at the end must add up to the chips bought in");
  }

  const amounts = draft.players.flatMap((player) => [...player.buyIns, player.end]);
  const unit: ChipUnit = amounts.some((amount) => (amount ?? 0) % 100 !== 0)
    ? "cents"
    : "whole";
  const chips = (hundredths: number | null) => inUnit(hundredths ?? 0, unit);
  // The usual buy-in: the first buy-in most players had.
  const firsts = draft.players.map((player) => chips(player.buyIns[0]));
  const startStack = firsts
    .slice()
    .sort(
      (a, b) =>
        firsts.filter((amount) => amount === b).length -
          firsts.filter((amount) => amount === a).length || b - a,
    )[0];

  return {
    kind: "ledger",
    id: `past-${now}`,
    ...(name ? { name } : {}),
    date: start,
    ended,
    ...(unit === "cents" ? { chipUnit: unit } : {}),
    ante: 0,
    startStack,
    hands: 0,
    results: draft.players.map((player) => {
      const buyIns = player.buyIns.map(chips);
      const end = chips(player.end);
      return {
        playerId: player.playerId,
        name: player.name,
        net: end - buyIns.reduce((total, amount) => total + amount, 0),
        end,
        buyIns,
      };
    }),
  };
}
