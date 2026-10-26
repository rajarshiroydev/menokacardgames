import { isValidBuyIn, MAX_BUY_INS } from "./buy-ins.ts";
import {
  canJoinGame,
  MAX_GAME_PLAYERS,
  savedPlayerRecord,
  totalBuyIns,
} from "./game.ts";
import { chipCurrency, formatChips, type ChipUnit } from "./money.ts";
import type { ChipValue, GameState, LedgerStep, PokerSession } from "./types";

/**
 * Quick ledger: a game recorded without hands. The host notes buy-ins as
 * they happen and players who cash out, then counts everyone's chips at the
 * end. Saved games rank exactly like games played hand by hand, since the
 * ranking only uses what each player put in and finished with.
 */

/** How many changes Undo can take back. */
export const LEDGER_UNDO_LIMIT = 30;
const LOG_LIMIT = 80;

export function isLedgerGame(game: Pick<GameState, "kind"> | null | undefined) {
  return game?.kind === "ledger";
}

function money(game: GameState, chips: number) {
  return formatChips(chips, game.chipUnit, chipCurrency(game.currency, game.chipValue));
}

function snapshot(game: GameState) {
  return {
    players: structuredClone(game.players),
    customBuyIns: game.customBuyIns === true,
  };
}

/** Logs a change and keeps what came before it for Undo. */
function record(
  game: GameState,
  before: Omit<LedgerStep, "line">,
  line: string,
) {
  game.ledgerUndo = [{ ...before, line }, ...(game.ledgerUndo ?? [])].slice(
    0,
    LEDGER_UNDO_LIMIT,
  );
  game.log.unshift(line);
  game.log = game.log.slice(0, LOG_LIMIT);
}

/** A buy-in other than the usual one lets players choose their own from then on. */
function noteBuyInAmount(game: GameState, amount: number) {
  if (amount !== game.startStack) game.customBuyIns = true;
}

function nameKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * A new quick ledger game. `buyIns` is each player's first buy-in, in the
 * order given; null is `startStack` for everyone. Null when the players or
 * amounts aren't valid.
 */
export function createLedgerGame(input: {
  gameName: string;
  sessionLabel: string;
  currency: string;
  chipUnit: ChipUnit;
  /** What the chips cost; null is a chip per unit of the currency. */
  chipValue?: ChipValue | null;
  startStack: number;
  players: Array<{ id?: string; name: string }>;
  buyIns: number[] | null;
  startedAt: number;
}): GameState | null {
  const { players, buyIns } = input;
  if (
    players.length < 2 ||
    players.length > MAX_GAME_PLAYERS ||
    new Set(players.map((player) => player.id ?? `name:${nameKey(player.name)}`))
      .size !== players.length ||
    new Set(players.map((player) => nameKey(player.name))).size !==
      players.length ||
    !isValidBuyIn(input.startStack) ||
    (buyIns &&
      (buyIns.length !== players.length || !buyIns.every(isValidBuyIn)))
  ) {
    return null;
  }
  const gameName = input.gameName.trim();
  return {
    kind: "ledger",
    ...(gameName ? { gameName } : {}),
    sessionLabel: gameName || input.sessionLabel,
    currency: input.currency,
    ...(input.chipUnit === "cents" ? { chipUnit: input.chipUnit } : {}),
    ...(input.chipValue ? { chipValue: { ...input.chipValue } } : {}),
    ante: 0,
    baseAnte: 0,
    blinds: null,
    blindLevel: 0,
    blindPlans: [],
    blindLevels: [],
    startStack: input.startStack,
    ...(buyIns && buyIns.some((amount) => amount !== input.startStack)
      ? { customBuyIns: true }
      : {}),
    startedAt: input.startedAt,
    players: players.map((player, index) => ({
      ...(player.id ? { id: player.id } : {}),
      name: player.name,
      stack: 0,
      buyIns: [buyIns?.[index] ?? input.startStack],
    })),
    hand: null,
    handNo: 0,
    dealerIndex: -1,
    log: [],
    tracksPlayers: true,
    _setupCount: players.length,
  };
}

/**
 * Records another buy-in for a seated player. In a quick ledger anyone at
 * the table can buy more chips at any time, busted or not. Returns false,
 * changing nothing, when it isn't allowed.
 */
export function ledgerBuyIn(game: GameState, playerIndex: number, amount: number) {
  const player = game.players[playerIndex];
  if (
    !isLedgerGame(game) ||
    !player ||
    player.left ||
    !isValidBuyIn(amount) ||
    (player.buyIns?.length ?? 1) >= MAX_BUY_INS ||
    !Number.isSafeInteger(totalBuyIns(game, playerIndex) + amount)
  ) {
    return false;
  }
  const before = snapshot(game);
  player.buyIns = [...(player.buyIns ?? [game.startStack]), amount];
  noteBuyInAmount(game, amount);
  record(game, before, `${player.name} buys in again for ${money(game, amount)}`);
  return true;
}

/** A player from the host's list joins during the game, bought in for `amount`. */
export function ledgerJoin(
  game: GameState,
  player: { id?: string; name: string },
  amount: number,
  now = Date.now(),
) {
  if (
    !isLedgerGame(game) ||
    !canJoinGame(game, player) ||
    !isValidBuyIn(amount)
  ) {
    return false;
  }
  const before = snapshot(game);
  game.players.push({
    ...(player.id ? { id: player.id } : {}),
    name: player.name,
    stack: 0,
    buyIns: [amount],
    ...(game.tracksPlayers ? { joinedAt: now } : {}),
  });
  noteBuyInAmount(game, amount);
  record(game, before, `${player.name} joins for ${money(game, amount)}`);
  return true;
}

/** A player leaves with `chips`, which become their result. */
export function ledgerCashOut(
  game: GameState,
  playerIndex: number,
  chips: number,
  now = Date.now(),
) {
  const player = game.players[playerIndex];
  if (
    !isLedgerGame(game) ||
    !player ||
    player.left ||
    !Number.isSafeInteger(chips) ||
    chips < 0
  ) {
    return false;
  }
  const before = snapshot(game);
  player.left = true;
  player.stack = chips;
  if (game.tracksPlayers) player.leftAt = now;
  record(game, before, `${player.name} cashes out with ${money(game, chips)}`);
  return true;
}

/**
 * A player who cashed out sits down again. The chips they left with go back
 * on the table, so they are counted with everyone else's at the end.
 */
export function ledgerReturn(game: GameState, playerIndex: number) {
  const player = game.players[playerIndex];
  if (!isLedgerGame(game) || !player?.left) return false;
  const before = snapshot(game);
  const chips = player.stack;
  delete player.left;
  delete player.leftAt;
  player.stack = 0;
  record(
    game,
    before,
    `${player.name} is back at the table with ${money(game, chips)}`,
  );
  return true;
}

/** The change Undo would take back, or null. */
export function ledgerUndoLine(game: GameState) {
  return game.ledgerUndo?.[0]?.line ?? null;
}

/** Takes back the latest change. Returns its log line, or null with nothing to undo. */
export function undoLedgerStep(game: GameState) {
  const [step, ...rest] = game.ledgerUndo ?? [];
  if (!isLedgerGame(game) || !step) return null;
  game.players = step.players;
  if (step.customBuyIns) game.customBuyIns = true;
  else delete game.customBuyIns;
  game.ledgerUndo = rest;
  const lineIndex = game.log.indexOf(step.line);
  if (lineIndex >= 0) game.log.splice(lineIndex, 1);
  return step.line;
}

export type LedgerTotals = {
  /** Every buy-in by everyone. */
  bought: number;
  /** Chips taken away by players who cashed out. */
  cashedOut: number;
  /** What the final count must come to: bought less cashed out. */
  onTable: number;
};

export function ledgerTotals(game: GameState): LedgerTotals {
  const bought = game.players.reduce(
    (sum, _, index) => sum + totalBuyIns(game, index),
    0,
  );
  const cashedOut = game.players.reduce(
    (sum, player) => sum + (player.left ? player.stack : 0),
    0,
  );
  return { bought, cashedOut, onTable: bought - cashedOut };
}

/** Indexes of the players whose chips are counted at the end: everyone seated. */
export function ledgerSeated(game: GameState) {
  return game.players.flatMap((player, index) => (player.left ? [] : [index]));
}

/**
 * The final count against the chips that should be on the table: positive
 * when the count is short, negative when it is over, 0 when it balances.
 * `counts` is by player index; a missing or null count is 0.
 */
export function ledgerCountGap(
  game: GameState,
  counts: ReadonlyArray<number | null | undefined>,
) {
  const counted = ledgerSeated(game).reduce(
    (sum, index) => sum + (counts[index] ?? 0),
    0,
  );
  return ledgerTotals(game).onTable - counted;
}

/**
 * The saved game for a quick ledger whose count balances. Each seated
 * player finishes with their count; anyone who cashed out with what they
 * left with. Throws with a reason the host can act on otherwise.
 */
export function ledgerSession(
  game: GameState,
  counts: ReadonlyArray<number | null | undefined>,
  ended: number,
): PokerSession {
  if (!isLedgerGame(game)) throw new Error("Not a quick ledger game");
  for (const index of ledgerSeated(game)) {
    const count = counts[index] ?? 0;
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`Check ${game.players[index].name}'s chip count`);
    }
  }
  const gap = ledgerCountGap(game, counts);
  if (gap > 0) {
    throw new Error(`The count is ${money(game, gap)} short of the chips bought`);
  }
  if (gap < 0) {
    throw new Error(`The count is ${money(game, -gap)} over the chips bought`);
  }
  return {
    kind: "ledger",
    id: `s${game.startedAt}`,
    ...(game.gameName ? { name: game.gameName } : {}),
    date: game.startedAt,
    ended: Math.max(ended, game.startedAt),
    ...(game.chipUnit === "cents" ? { chipUnit: game.chipUnit } : {}),
    ...(game.chipValue ? { chipValue: game.chipValue } : {}),
    ante: 0,
    startStack: game.startStack,
    hands: 0,
    results: game.players.map((player, index) => {
      const end = player.left ? player.stack : (counts[index] ?? 0);
      const buyIns = player.buyIns ?? [game.startStack];
      return {
        ...(player.id ? { playerId: player.id } : {}),
        name: player.name,
        net: end - totalBuyIns(game, index),
        end,
        // Only a single buy-in of the usual amount can be left out.
        ...(buyIns.length > 1 || buyIns[0] !== game.startStack
          ? { buyIns }
          : {}),
        ...savedPlayerRecord(game, index, 0),
      };
    }),
  };
}
