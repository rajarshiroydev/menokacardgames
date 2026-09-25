import { deriveSessionAccounting } from "./accounting.ts";
import { isValidRebuy, MAX_BUY_INS } from "./buy-ins.ts";
import { cleanPlayerName } from "./player-validation.ts";
import type { GameState } from "./types";

/**
 * Live standings shared with players through a link. The host's device sends
 * a snapshot of the game in progress; the server validates it and derives the
 * standings players see. Only names and chip counts leave the device.
 */

/** Phones check for a new snapshot this often. */
export const LIVE_VIEW_POLL_MS = 5_000;
/** The host's device re-sends unchanged standings this often, as a heartbeat. */
export const LIVE_VIEW_HEARTBEAT_MS = 60_000;
/** Without an update for this long, the host's device may be offline. */
export const LIVE_VIEW_STALE_MS = 150_000;
/** A link stops working this long after the host's last update. */
export const LIVE_VIEW_EXPIRY_HOURS = 12;
const MAX_LIVE_PLAYERS = 10;
const MAX_GAME_NAME_LENGTH = 80;

export type LiveSnapshotPlayer = {
  name: string;
  /** Chips behind right now, after any bets in the current hand. */
  stack: number;
  /** Initial buy-in followed by each rebuy. */
  buyIns: number[];
  /** Chips at the start of the current hand, or `stack` between hands. */
  settledStack: number;
};

export type LiveSnapshot = {
  gameName: string;
  startStack: number;
  handNo: number;
  handInProgress: boolean;
  bigBlind: number;
  players: LiveSnapshotPlayer[];
};

export type LiveStanding = {
  rank: number;
  name: string;
  stack: number;
  invested: number;
  net: number;
  rebuys: number;
};

export type LiveView = {
  gameName: string;
  handNo: number;
  handInProgress: boolean;
  bigBlind: number;
  standings: LiveStanding[];
};

/** What the host's device sends. Net and rank are left to the server. */
export function buildLiveSnapshot(game: GameState): LiveSnapshot {
  const hand = game.hand;
  return {
    gameName: game.sessionLabel || game.gameName || "Game",
    startStack: game.startStack,
    handNo: game.handNo,
    handInProgress: Boolean(hand),
    bigBlind: game.ante,
    players: game.players.map((player, index) => {
      const buyIns = player.buyIns?.length ? [...player.buyIns] : [game.startStack];
      const before = hand?.stacksBeforeHand[index];
      // A player who was bust when the hand was dealt sat it out, so their
      // stack only changes by a rebuy and is already settled.
      const settledStack = hand && before ? before : player.stack;
      return { name: player.name, stack: player.stack, buyIns, settledStack };
    }),
  };
}

function asObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return value as Record<string, unknown>;
}

function asChips(value: unknown, field: string, min = 0) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) {
    throw new Error(`${field} must be a valid whole number`);
  }
  return value;
}

/** Server-side check of a snapshot sent by the host's device. */
export function validateLiveSnapshot(input: unknown): LiveSnapshot {
  const snapshot = asObject(input, "live snapshot");
  const gameName = String(snapshot.gameName ?? "").trim().replace(/\s+/g, " ");
  if (!gameName || gameName.length > MAX_GAME_NAME_LENGTH) {
    throw new Error(`Game names must be 1 to ${MAX_GAME_NAME_LENGTH} characters`);
  }
  const startStack = asChips(snapshot.startStack, "Starting stack", 1);
  const handNo = asChips(snapshot.handNo, "Hand number");
  const bigBlind = asChips(snapshot.bigBlind, "Big blind", 1);
  if (typeof snapshot.handInProgress !== "boolean") {
    throw new Error("Invalid hand status");
  }
  if (
    !Array.isArray(snapshot.players) ||
    snapshot.players.length < 2 ||
    snapshot.players.length > MAX_LIVE_PLAYERS
  ) {
    throw new Error(`A live game has 2 to ${MAX_LIVE_PLAYERS} players`);
  }

  const players = snapshot.players.map((value) => {
    const player = asObject(value, "player");
    const name = cleanPlayerName(player.name);
    if (
      !Array.isArray(player.buyIns) ||
      player.buyIns.length < 1 ||
      player.buyIns.length > MAX_BUY_INS
    ) {
      throw new Error(`${name} must have 1 to ${MAX_BUY_INS} buy-ins`);
    }
    const buyIns = player.buyIns.map((amount) =>
      asChips(amount, `${name}'s buy-in`, 1),
    );
    if (buyIns[0] !== startStack) {
      throw new Error(`${name}'s first buy-in must be the starting stack`);
    }
    buyIns.slice(1).forEach((amount, index) => {
      if (!isValidRebuy(amount, buyIns[index], startStack)) {
        throw new Error(`${name}'s rebuy amount is not allowed`);
      }
    });
    const stack = asChips(player.stack, `${name}'s stack`);
    const settledStack = asChips(player.settledStack, `${name}'s stack`);
    if (!snapshot.handInProgress && stack !== settledStack) {
      throw new Error(`${name}'s stack does not match between hands`);
    }
    if (stack > settledStack && snapshot.handInProgress) {
      throw new Error(`${name}'s stack cannot grow during a hand`);
    }
    return { name, stack, buyIns, settledStack };
  });

  return {
    gameName,
    startStack,
    handNo,
    handInProgress: snapshot.handInProgress,
    bigBlind,
    players,
  };
}

/**
 * Ranks players by net result from settled stacks, so the order changes when
 * a hand ends rather than with every bet. Throws unless the settled chips
 * balance against everything bought in, as a saved game must.
 */
export function deriveLiveView(snapshot: LiveSnapshot): LiveView {
  const accounting = deriveSessionAccounting({
    startStack: snapshot.startStack,
    results: snapshot.players.map((player) => ({
      name: player.name,
      end: player.settledStack,
      net: player.settledStack - player.buyIns.reduce((sum, value) => sum + value, 0),
      buyIns: player.buyIns,
    })),
  });

  const rows = accounting.results.map((result, index) => ({
    name: result.name,
    stack: snapshot.players[index].stack,
    invested: result.invested,
    net: result.net,
    rebuys: result.buyIns.length - 1,
  }));
  rows.sort(
    (a, b) =>
      b.net - a.net ||
      a.name.localeCompare(b.name, "en-IN", { sensitivity: "base" }),
  );

  let rank = 0;
  const standings = rows.map((row, index) => {
    if (index === 0 || row.net !== rows[index - 1].net) rank = index + 1;
    return { rank, ...row };
  });

  return {
    gameName: snapshot.gameName,
    handNo: snapshot.handNo,
    handInProgress: snapshot.handInProgress,
    bigBlind: snapshot.bigBlind,
    standings,
  };
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** A share token is 32 random bytes in unpadded base64url. */
export function isLiveToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}
