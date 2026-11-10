import { isAvatarId } from "../avatars.ts";
import { liveBankFields, validLiveBankFields } from "./bank.ts";
import { MAX_BUY_INS } from "./buy-ins.ts";
import { MAX_GAME_PLAYERS } from "./game.ts";
import { type ChipUnit, isChipUnit } from "./money.ts";
import { cleanPlayerName, playerNameKey } from "./player-validation.ts";
import type { GameState } from "./types";

/**
 * The live link for a quick ledger. A quick ledger has no stacks until the
 * final count, so the hand-by-hand standings (ranked by net from stacks)
 * don't apply: players see what everyone has bought in, who cashed out with
 * what, and the latest changes. The link, token, expiry and polling are the
 * hand-by-hand link's (`live-view.ts`); only the snapshot and view differ,
 * told apart by `kind`.
 */

/** The page lists this many of the latest changes. */
export const LIVE_LEDGER_ACTIVITY = 10;
/** Longest log line accepted; real ones are well under it. */
const MAX_ACTIVITY_LENGTH = 200;
const MAX_GAME_NAME_LENGTH = 80;

export type LiveLedgerSnapshotPlayer = {
  name: string;
  avatar?: string;
  /** Initial buy-in followed by each rebuy. */
  buyIns: number[];
  /** Cashed out and left with this many chips; absent while seated. */
  cashedOut?: number;
  /**
   * The host is the bank: chips this player still owes the bank for buy-ins,
   * and the bank still owes them for a cash-out. Absent is none.
   */
  owed?: number;
  bankOwes?: number;
};

export type LiveLedgerSnapshot = {
  kind: "ledger";
  gameName: string;
  chipUnit?: ChipUnit;
  /** The chips have a value, so they show as plain counts, not money. */
  plainChips?: boolean;
  startedAt?: number;
  /** The usual buy-in. */
  startStack: number;
  /** In the host's order. */
  players: LiveLedgerSnapshotPlayer[];
  /** The latest log lines, newest first. */
  activity: string[];
};

export type LiveLedgerPlayer = {
  name: string;
  avatar?: string;
  /** How many times they bought in, the first included. */
  buyIns: number;
  invested: number;
  /** What they left with, and the result that makes; absent while seated. */
  cashedOut?: number;
  net?: number;
  /** The host is the bank: what they still owe it, or it owes them. */
  owed?: number;
  bankOwes?: number;
};

export type LiveLedgerView = {
  kind: "ledger";
  gameName: string;
  /** The host's currency code, added by the server. */
  currency?: string;
  chipUnit?: ChipUnit;
  plainChips?: boolean;
  startedAt?: number;
  startStack: number;
  bought: number;
  cashedOut: number;
  /** Bought in less cashed out: what the final count must come to. */
  onTable: number;
  /** Seated players in the host's order, then those who cashed out. */
  players: LiveLedgerPlayer[];
  activity: string[];
};

/** What the host's device sends for a quick ledger. */
export function buildLiveLedgerSnapshot(
  game: GameState,
  avatarOf: (player: GameState["players"][number]) => string | undefined = () =>
    undefined,
): LiveLedgerSnapshot {
  return {
    kind: "ledger",
    gameName: game.sessionLabel || game.gameName || "Game",
    ...(game.chipUnit === "cents" ? { chipUnit: game.chipUnit } : {}),
    ...(game.chipValue ? { plainChips: true } : {}),
    startedAt: game.startedAt,
    startStack: game.startStack,
    players: game.players.map((player, index) => {
      const avatar = avatarOf(player);
      return {
        name: player.name,
        ...(avatar ? { avatar } : {}),
        buyIns: player.buyIns?.length ? [...player.buyIns] : [game.startStack],
        ...(player.left ? { cashedOut: player.stack } : {}),
        ...liveBankFields(game, index),
      };
    }),
    activity: game.log.slice(0, LIVE_LEDGER_ACTIVITY),
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

/** Server-side check of a quick ledger snapshot sent by the host's device. */
export function validateLiveLedgerSnapshot(input: unknown): LiveLedgerSnapshot {
  const snapshot = asObject(input, "live snapshot");
  if (snapshot.kind !== "ledger") throw new Error("Invalid game kind");
  const gameName = String(snapshot.gameName ?? "").trim().replace(/\s+/g, " ");
  if (!gameName || gameName.length > MAX_GAME_NAME_LENGTH) {
    throw new Error(`Game names must be 1 to ${MAX_GAME_NAME_LENGTH} characters`);
  }
  if (snapshot.chipUnit !== undefined && !isChipUnit(snapshot.chipUnit)) {
    throw new Error("Invalid chip unit");
  }
  if (snapshot.plainChips !== undefined && snapshot.plainChips !== true) {
    throw new Error("Invalid chip value");
  }
  const startedAt =
    snapshot.startedAt === undefined
      ? undefined
      : asChips(snapshot.startedAt, "Start time", 1);
  const startStack = asChips(snapshot.startStack, "Usual buy-in", 1);
  if (
    !Array.isArray(snapshot.players) ||
    snapshot.players.length < 2 ||
    snapshot.players.length > MAX_GAME_PLAYERS
  ) {
    throw new Error(`A live game has 2 to ${MAX_GAME_PLAYERS} players`);
  }
  const seen = new Set<string>();
  const players = snapshot.players.map((value) => {
    const player = asObject(value, "player");
    const name = cleanPlayerName(player.name);
    const key = playerNameKey(name);
    if (seen.has(key)) throw new Error(`${name} is in the game twice`);
    seen.add(key);
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
    // A cash-out may be 0, and may even be more than is on the table: the
    // host's app allows it until the count, so the link shows it as it is.
    const cashedOut =
      player.cashedOut === undefined
        ? undefined
        : asChips(player.cashedOut, `${name}'s cash-out`);
    // An avatar the server doesn't know is dropped; the page draws a stand-in.
    const avatar = isAvatarId(player.avatar) ? player.avatar : undefined;
    const bank = validLiveBankFields(player, name, {
      invested: buyIns.reduce((sum, amount) => sum + amount, 0),
      cashedOut,
    });
    return {
      name,
      ...(avatar ? { avatar } : {}),
      buyIns,
      ...(cashedOut === undefined ? {} : { cashedOut }),
      ...bank,
    };
  });
  if (!Array.isArray(snapshot.activity)) throw new Error("Invalid activity");
  const activity = snapshot.activity
    .slice(0, LIVE_LEDGER_ACTIVITY)
    .map((line) => {
      if (typeof line !== "string") throw new Error("Invalid activity");
      // One line of plain text; any control characters become spaces.
      const clean = line.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
      if (!clean || clean.length > MAX_ACTIVITY_LENGTH) {
        throw new Error("Invalid activity");
      }
      return clean;
    });
  return {
    kind: "ledger",
    gameName,
    ...(snapshot.chipUnit === "cents" ? { chipUnit: "cents" as const } : {}),
    ...(snapshot.plainChips ? { plainChips: true } : {}),
    ...(startedAt === undefined ? {} : { startedAt }),
    startStack,
    players,
    activity,
  };
}

/** The totals and players' rows players see. */
export function deriveLiveLedgerView(snapshot: LiveLedgerSnapshot): LiveLedgerView {
  const rows = snapshot.players.map((player) => {
    const invested = player.buyIns.reduce((sum, amount) => sum + amount, 0);
    return {
      name: player.name,
      ...(player.avatar ? { avatar: player.avatar } : {}),
      buyIns: player.buyIns.length,
      invested,
      ...(player.cashedOut === undefined
        ? {}
        : { cashedOut: player.cashedOut, net: player.cashedOut - invested }),
      ...(player.owed ? { owed: player.owed } : {}),
      ...(player.bankOwes ? { bankOwes: player.bankOwes } : {}),
    };
  });
  const bought = rows.reduce((sum, row) => sum + row.invested, 0);
  const cashedOut = rows.reduce((sum, row) => sum + (row.cashedOut ?? 0), 0);
  return {
    kind: "ledger",
    gameName: snapshot.gameName,
    ...(snapshot.chipUnit ? { chipUnit: snapshot.chipUnit } : {}),
    ...(snapshot.plainChips ? { plainChips: true } : {}),
    ...(snapshot.startedAt === undefined ? {} : { startedAt: snapshot.startedAt }),
    startStack: snapshot.startStack,
    bought,
    cashedOut,
    onTable: bought - cashedOut,
    players: [
      ...rows.filter((row) => row.cashedOut === undefined),
      ...rows.filter((row) => row.cashedOut !== undefined),
    ],
    activity: snapshot.activity,
  };
}

/** Stored views without a `kind` are hand by hand. */
export function isLiveLedgerView(view: object): view is LiveLedgerView {
  return "kind" in view && view.kind === "ledger";
}
