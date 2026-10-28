import { isAvatarId } from "../avatars.ts";
import { deriveSessionAccounting } from "./accounting.ts";
import { MAX_BUY_INS, parseRebuyRules } from "./buy-ins.ts";
import {
  blindStatus,
  handContributions,
  handsUntilBigBlind,
  isShowdown,
  SEAT_STATUS_LABELS,
  type SeatStatusLabel,
  seatRole,
  seatStatusParts,
  smallBlindFor,
} from "./game.ts";
import { type ChipUnit, isChipUnit } from "./money.ts";
import { cleanPlayerName } from "./player-validation.ts";
import type { GameState, RebuyRules } from "./types";

/**
 * Live standings shared with players through a link. The host's device sends
 * a snapshot of the game in progress; the server validates it and derives the
 * standings players see. Only names, avatars and chip counts leave the device.
 */

/** Phones check for a new snapshot this often. */
export const LIVE_VIEW_POLL_MS = 5_000;
/** A check that takes longer is abandoned, so a hung request can't stall the page. */
export const LIVE_VIEW_REQUEST_TIMEOUT_MS = 8_000;
/** The host's device re-sends unchanged standings this often, as a heartbeat. */
export const LIVE_VIEW_HEARTBEAT_MS = 60_000;
/** Without an update for this long, the host's device may be offline. */
export const LIVE_VIEW_STALE_MS = 150_000;
/** A link stops working this long after the host's last update. */
export const LIVE_VIEW_EXPIRY_HOURS = 12;
const MAX_LIVE_PLAYERS = 10;
const MAX_GAME_NAME_LENGTH = 80;
/** The chart on the link covers at most this many recent hands. */
export const LIVE_HISTORY_HANDS = 50;
const MAX_POTS = MAX_LIVE_PLAYERS;
const ROLES = new Set(["", "D", "SB", "BB", "D SB"]);
const POT_LABEL = /^(Pot|Main pot|Side pot( \d{1,2})?)$/;

/** A seat's status this hand: its words and any amount. */
export type LiveStatus = { label: SeatStatusLabel; amount?: number };

/** How a finished hand went: what was paid out and to whom. */
export type LiveHandResult = {
  no: number;
  pot: number;
  names: string[];
  split: boolean;
  /** Each pot's winners, when the hand had side pots. */
  pots?: { label: string; amount: number; names: string[] }[];
};

/** The next blind level and when it starts. */
export type LiveNextBlinds = {
  smallBlind: number;
  bigBlind: number;
  /** Hand-based levels: hands still to play at this level. */
  handsLeft?: number;
  /** Timed levels: when the level ends, on the host's clock. */
  endsAt?: number;
  /** Timed levels with the clock paused: time left, frozen. */
  pausedMsLeft?: number;
  /** The next hand dealt is at the new level. */
  dueNow?: boolean;
};

/** The hand being played. */
export type LiveHand = {
  /** 0 pre-flop to 3 river. */
  stage: number;
  pot: number;
  /** Who is to act, by seat; null when nobody is (round over, showdown). */
  toAct: number | null;
  showdown: boolean;
};

export type LiveSnapshotPlayer = {
  name: string;
  /** The avatar the host's list shows them as; absent from older devices. */
  avatar?: string;
  /** Chips behind right now, after any bets in the current hand. */
  stack: number;
  /** Initial buy-in followed by each rebuy. */
  buyIns: number[];
  /** Chips at the start of the current hand, or `stack` between hands. */
  settledStack: number;
  /** Cashed out and left the table; `stack` is what they left with. */
  left?: boolean;
  /** During a hand: what they did, what they've put in and their position. */
  status?: LiveStatus;
  inHand?: number;
  role?: string;
  /** Deals until they're the big blind (0 is this hand); absent if not dealt in. */
  bigBlindIn?: number;
};

export type LiveSnapshot = {
  gameName: string;
  /** "cents" when amounts are in hundredths; absent is whole chips. */
  chipUnit?: ChipUnit;
  startStack: number;
  handNo: number;
  handInProgress: boolean;
  bigBlind: number;
  /** Absent from older devices; the page then shows half the big blind. */
  smallBlind?: number;
  /** The host's rebuy limits; absent when there are none. */
  rebuyRules?: RebuyRules;
  /** Chips the house has raked so far; absent is none. */
  rake?: number;
  /**
   * The chips have a value, so they show as plain counts, not money. The
   * value itself stays on the host's device.
   */
  plainChips?: boolean;
  /** When the game began, on the host's clock; absent from older devices. */
  startedAt?: number;
  /** The blind level, from 0, when blinds rise. */
  blindLevel?: number;
  /** The big blind also posts an ante of one big blind. */
  bigBlindAnte?: boolean;
  /** The hand being played; absent between hands and from older devices. */
  hand?: LiveHand;
  /** The next blind level, when blinds rise. */
  nextBlinds?: LiveNextBlinds;
  /** The last finished hand. */
  lastHand?: LiveHandResult;
  /** The biggest pot paid out so far. */
  biggestPot?: { no: number; amount: number };
  /** Recent finished hands, oldest first: every seat's net after each. */
  history?: { no: number; nets: number[] }[];
  players: LiveSnapshotPlayer[];
};

export type LiveStanding = {
  rank: number;
  name: string;
  avatar?: string;
  stack: number;
  invested: number;
  /**
   * The first buy-in; `invested` less this is the rebuys. Views stored
   * before it existed lack it.
   */
  start?: number;
  net: number;
  rebuys: number;
  /** Cashed out and left the table; absent while seated. */
  left?: boolean;
  status?: LiveStatus;
  inHand?: number;
  role?: string;
  bigBlindIn?: number;
  /** Places up (positive) or down since the hand before the last. */
  move?: number;
  /**
   * Rebuys still allowed under the host's limits; absent when unlimited.
   * `rebuysClosed` means the big blind has reached the closing level.
   */
  rebuysLeft?: number;
  rebuysClosed?: boolean;
  /**
   * Net after each recent hand, oldest first, lined up with the view's
   * `historyHands`; null for hands before they joined.
   */
  nets?: (number | null)[];
  /** The seat they sit in, so the hand's "to act" can be matched. */
  seat?: number;
};

export type LiveView = {
  gameName: string;
  /** The host's currency code; views stored before it existed lack it (INR). */
  currency?: string;
  /** "cents" when amounts are in hundredths; absent is whole chips. */
  chipUnit?: ChipUnit;
  handNo: number;
  handInProgress: boolean;
  bigBlind: number;
  smallBlind?: number;
  rebuyRules?: RebuyRules;
  rake?: number;
  /** Amounts are plain chip counts; absent is chips shown as money. */
  plainChips?: boolean;
  startedAt?: number;
  blindLevel?: number;
  bigBlindAnte?: boolean;
  hand?: LiveHand;
  nextBlinds?: LiveNextBlinds;
  lastHand?: LiveHandResult;
  biggestPot?: { no: number; amount: number };
  /** Hand numbers the players' `nets` belong to. */
  historyHands?: number[];
  /** Chips at the table (settled) and the average of those with chips. */
  chipsInPlay?: number;
  averageStack?: number;
  standings: LiveStanding[];
};

/** What the host's device sends. Net and rank are left to the server. */
export function buildLiveSnapshot(
  game: GameState,
  avatarOf: (player: GameState["players"][number]) => string | undefined = () =>
    undefined,
  now = Date.now(),
): LiveSnapshot {
  const hand = game.hand;
  const inHand = handContributions(game);
  const bigBlindIn = handsUntilBigBlind(game);
  const blinds = blindStatus(game, now);
  const results = game.handResults ?? [];
  const last = results.at(-1);
  const biggest = results.reduce<(typeof results)[number] | undefined>(
    (best, result) => (!best || result.pot > best.pot ? result : best),
    undefined,
  );
  let nextBlinds: LiveNextBlinds | undefined;
  if (blinds.schedule && blinds.nextBigBlind > 0) {
    nextBlinds = {
      smallBlind: blinds.nextSmallBlind,
      bigBlind: blinds.nextBigBlind,
      ...(blinds.dueNow
        ? { dueNow: true }
        : blinds.schedule.unit === "hands"
          ? { handsLeft: blinds.handsLeft }
          : blinds.paused
            ? { pausedMsLeft: blinds.msLeft }
            : { endsAt: now + blinds.msLeft }),
    };
  }
  return {
    gameName: game.sessionLabel || game.gameName || "Game",
    ...(game.chipUnit === "cents" ? { chipUnit: game.chipUnit } : {}),
    startStack: game.startStack,
    handNo: game.handNo,
    handInProgress: Boolean(hand),
    bigBlind: game.ante,
    smallBlind: smallBlindFor(game.ante, game.smallBlindRatio),
    ...(game.rebuyRules ? { rebuyRules: game.rebuyRules } : {}),
    ...(game.rake ? { rake: game.rake } : {}),
    ...(game.chipValue ? { plainChips: true } : {}),
    startedAt: game.startedAt,
    ...(blinds.schedule ? { blindLevel: blinds.level } : {}),
    ...(game.bigBlindAnte ? { bigBlindAnte: true } : {}),
    ...(hand
      ? {
          hand: {
            stage: hand.stage,
            pot: hand.pot,
            toAct: hand.currentPlayer,
            showdown: isShowdown(game),
          },
        }
      : {}),
    ...(nextBlinds ? { nextBlinds } : {}),
    ...(last
      ? {
          lastHand: {
            no: last.no,
            pot: last.pot,
            names: last.names,
            split: last.split,
            ...(last.pots
              ? {
                  pots: last.pots.map((pot) => ({
                    label: pot.label,
                    amount: pot.amount,
                    names: pot.names,
                  })),
                }
              : {}),
          },
        }
      : {}),
    ...(biggest ? { biggestPot: { no: biggest.no, amount: biggest.pot } } : {}),
    ...(results.length
      ? {
          history: results
            .slice(-LIVE_HISTORY_HANDS)
            .map((result) => ({ no: result.no, nets: result.nets })),
        }
      : {}),
    players: game.players.map((player, index) => {
      const buyIns = player.buyIns?.length ? [...player.buyIns] : [game.startStack];
      const before = hand?.stacksBeforeHand[index];
      // A player who was bust when the hand was dealt sat it out, so their
      // stack only changes by a rebuy and is already settled.
      const settledStack = hand && before ? before : player.stack;
      const avatar = avatarOf(player);
      return {
        name: player.name,
        ...(avatar ? { avatar } : {}),
        stack: player.stack,
        buyIns,
        settledStack,
        ...(player.left ? { left: true } : {}),
        ...(hand
          ? {
              status: seatStatusParts(game, index),
              inHand: inHand[index],
              role: seatRole(game, index),
            }
          : {}),
        ...(bigBlindIn[index] === null ? {} : { bigBlindIn: bigBlindIn[index] }),
      };
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

/** A whole number that may be negative, like a net result. */
function asWhole(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${field} must be a valid whole number`);
  }
  return value;
}

function optional<T>(value: unknown, read: (value: unknown) => T) {
  return value === undefined ? undefined : read(value);
}

function asStatus(value: unknown, name: string): LiveStatus {
  const status = asObject(value, `${name}'s status`);
  if (!SEAT_STATUS_LABELS.includes(status.label as SeatStatusLabel)) {
    throw new Error(`Invalid status for ${name}`);
  }
  const amount = optional(status.amount, (amount) =>
    asChips(amount, `${name}'s status amount`),
  );
  return {
    label: status.label as SeatStatusLabel,
    ...(amount === undefined ? {} : { amount }),
  };
}

/** Winner names must be players in this game. */
function asNames(value: unknown, names: Set<string>, field: string) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_LIVE_PLAYERS) {
    throw new Error(`Invalid ${field}`);
  }
  return value.map((name) => {
    const clean = cleanPlayerName(name);
    if (!names.has(clean)) throw new Error(`Invalid ${field}`);
    return clean;
  });
}

function asHandResult(value: unknown, names: Set<string>): LiveHandResult {
  const result = asObject(value, "last hand");
  const pots = optional(result.pots, (pots) => {
    if (!Array.isArray(pots) || pots.length < 1 || pots.length > MAX_POTS) {
      throw new Error("Invalid pots");
    }
    return pots.map((value) => {
      const pot = asObject(value, "pot");
      if (typeof pot.label !== "string" || !POT_LABEL.test(pot.label)) {
        throw new Error("Invalid pot name");
      }
      return {
        label: pot.label,
        amount: asChips(pot.amount, "Pot"),
        names: asNames(pot.names, names, "pot winners"),
      };
    });
  });
  if (typeof result.split !== "boolean") throw new Error("Invalid last hand");
  return {
    no: asChips(result.no, "Hand number", 1),
    pot: asChips(result.pot, "Pot"),
    names: asNames(result.names, names, "winners"),
    split: result.split,
    ...(pots ? { pots } : {}),
  };
}

function asNextBlinds(value: unknown, bigBlind: number): LiveNextBlinds {
  const next = asObject(value, "next blinds");
  const nextBig = asChips(next.bigBlind, "Next big blind", 1);
  const nextSmall = asChips(next.smallBlind, "Next small blind", 1);
  if (nextSmall > nextBig || nextBig < bigBlind) {
    throw new Error("Invalid next blinds");
  }
  const handsLeft = optional(next.handsLeft, (hands) =>
    asChips(hands, "Hands left"),
  );
  const endsAt = optional(next.endsAt, (at) => asChips(at, "Level end", 1));
  const pausedMsLeft = optional(next.pausedMsLeft, (ms) =>
    asChips(ms, "Time left"),
  );
  if (next.dueNow !== undefined && next.dueNow !== true) {
    throw new Error("Invalid next blinds");
  }
  const kinds = [handsLeft, endsAt, pausedMsLeft, next.dueNow].filter(
    (kind) => kind !== undefined,
  ).length;
  if (kinds !== 1) throw new Error("Invalid next blinds");
  return {
    smallBlind: nextSmall,
    bigBlind: nextBig,
    ...(handsLeft === undefined ? {} : { handsLeft }),
    ...(endsAt === undefined ? {} : { endsAt }),
    ...(pausedMsLeft === undefined ? {} : { pausedMsLeft }),
    ...(next.dueNow ? { dueNow: true } : {}),
  };
}

/** Server-side check of a snapshot sent by the host's device. */
export function validateLiveSnapshot(input: unknown): LiveSnapshot {
  const snapshot = asObject(input, "live snapshot");
  const gameName = String(snapshot.gameName ?? "").trim().replace(/\s+/g, " ");
  if (!gameName || gameName.length > MAX_GAME_NAME_LENGTH) {
    throw new Error(`Game names must be 1 to ${MAX_GAME_NAME_LENGTH} characters`);
  }
  if (snapshot.chipUnit !== undefined && !isChipUnit(snapshot.chipUnit)) {
    throw new Error("Invalid chip unit");
  }
  const cents = snapshot.chipUnit === "cents";
  const startStack = asChips(snapshot.startStack, "Starting stack", 1);
  const handNo = asChips(snapshot.handNo, "Hand number");
  const bigBlind = asChips(snapshot.bigBlind, "Big blind", 1);
  const smallBlind =
    snapshot.smallBlind === undefined
      ? undefined
      : asChips(snapshot.smallBlind, "Small blind", 1);
  if (smallBlind !== undefined && smallBlind > bigBlind) {
    throw new Error("The small blind can't be bigger than the big blind");
  }
  const rebuyRules = parseRebuyRules(snapshot.rebuyRules);
  const rake =
    snapshot.rake === undefined ? 0 : asChips(snapshot.rake, "Rake");
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
    // Players may choose their own amounts; each must be at least 1 chip.
    const buyIns = player.buyIns.map((amount) =>
      asChips(amount, `${name}'s buy-in`, 1),
    );
    const stack = asChips(player.stack, `${name}'s stack`);
    const settledStack = asChips(player.settledStack, `${name}'s stack`);
    if (!snapshot.handInProgress && stack !== settledStack) {
      throw new Error(`${name}'s stack does not match between hands`);
    }
    if (stack > settledStack && snapshot.handInProgress) {
      throw new Error(`${name}'s stack cannot grow during a hand`);
    }
    // An avatar the server doesn't know is dropped; the page draws a stand-in.
    const avatar = isAvatarId(player.avatar) ? player.avatar : undefined;
    if (player.left !== undefined && player.left !== true) {
      throw new Error(`Invalid table status for ${name}`);
    }
    if (player.left && stack !== settledStack) {
      throw new Error(`${name} left the table and can't be in a hand`);
    }
    const status =
      snapshot.handInProgress && player.status !== undefined
        ? asStatus(player.status, name)
        : undefined;
    const inHand =
      snapshot.handInProgress && player.inHand !== undefined
        ? asChips(player.inHand, `${name}'s chips in the hand`)
        : undefined;
    if (inHand !== undefined && inHand !== settledStack - stack) {
      throw new Error(`${name}'s chips in the hand don't match their stack`);
    }
    const role =
      snapshot.handInProgress && player.role !== undefined
        ? String(player.role)
        : undefined;
    if (role !== undefined && !ROLES.has(role)) {
      throw new Error(`Invalid position for ${name}`);
    }
    const bigBlindIn = optional(player.bigBlindIn, (deals) =>
      asChips(deals, `${name}'s turn in the big blind`),
    );
    if (bigBlindIn !== undefined && bigBlindIn > MAX_LIVE_PLAYERS) {
      throw new Error(`Invalid turn in the big blind for ${name}`);
    }
    return {
      name,
      ...(avatar ? { avatar } : {}),
      stack,
      buyIns,
      settledStack,
      ...(player.left ? { left: true } : {}),
      ...(status ? { status } : {}),
      ...(inHand === undefined ? {} : { inHand }),
      ...(role ? { role } : {}),
      ...(bigBlindIn === undefined ? {} : { bigBlindIn }),
    };
  });
  const names = new Set(players.map((player) => player.name));

  const startedAt = optional(snapshot.startedAt, (at) =>
    asChips(at, "Start time", 1),
  );
  const blindLevel = optional(snapshot.blindLevel, (level) =>
    asChips(level, "Blind level"),
  );
  if (snapshot.bigBlindAnte !== undefined && snapshot.bigBlindAnte !== true) {
    throw new Error("Invalid ante");
  }
  const hand =
    snapshot.handInProgress && snapshot.hand !== undefined
      ? (() => {
          const value = asObject(snapshot.hand, "hand");
          const stage = asChips(value.stage, "Street");
          if (stage > 3) throw new Error("Invalid street");
          const toAct =
            value.toAct === null
              ? null
              : asChips(value.toAct, "Player to act");
          if (toAct !== null && toAct >= players.length) {
            throw new Error("Invalid player to act");
          }
          if (typeof value.showdown !== "boolean") {
            throw new Error("Invalid hand");
          }
          return {
            stage,
            pot: asChips(value.pot, "Pot"),
            toAct,
            showdown: value.showdown,
          };
        })()
      : undefined;
  const nextBlinds = optional(snapshot.nextBlinds, (next) =>
    asNextBlinds(next, bigBlind),
  );
  const lastHand = optional(snapshot.lastHand, (result) =>
    asHandResult(result, names),
  );
  const biggestPot = optional(snapshot.biggestPot, (value) => {
    const pot = asObject(value, "biggest pot");
    return {
      no: asChips(pot.no, "Hand number", 1),
      amount: asChips(pot.amount, "Biggest pot"),
    };
  });
  const history = optional(snapshot.history, (value) => {
    if (!Array.isArray(value) || value.length > LIVE_HISTORY_HANDS) {
      throw new Error("Invalid hand history");
    }
    return value.map((entry) => {
      const item = asObject(entry, "hand history");
      if (!Array.isArray(item.nets) || item.nets.length > players.length) {
        throw new Error("Invalid hand history");
      }
      return {
        no: asChips(item.no, "Hand number", 1),
        nets: item.nets.map((net) => asWhole(net, "Net")),
      };
    });
  });

  return {
    gameName,
    ...(cents ? { chipUnit: "cents" as const } : {}),
    startStack,
    handNo,
    handInProgress: snapshot.handInProgress,
    bigBlind,
    ...(smallBlind === undefined ? {} : { smallBlind }),
    ...(rebuyRules ? { rebuyRules } : {}),
    ...(rake > 0 ? { rake } : {}),
    ...(snapshot.plainChips === true ? { plainChips: true } : {}),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(blindLevel === undefined ? {} : { blindLevel }),
    ...(snapshot.bigBlindAnte ? { bigBlindAnte: true } : {}),
    ...(hand ? { hand } : {}),
    ...(nextBlinds ? { nextBlinds } : {}),
    ...(lastHand ? { lastHand } : {}),
    ...(biggestPot ? { biggestPot } : {}),
    ...(history?.length ? { history } : {}),
    players,
  };
}

/** Standings order: best net first, ties by name. */
function byNet(a: { net: number; name: string }, b: { net: number; name: string }) {
  return (
    b.net - a.net || a.name.localeCompare(b.name, "en-IN", { sensitivity: "base" })
  );
}

/** Rank by net, players with the same net sharing a rank. */
function rankOf<T extends { net: number; name: string }>(rows: T[]) {
  const sorted = [...rows].sort(byNet);
  const ranks = new Map<T, number>();
  let rank = 0;
  sorted.forEach((row, index) => {
    if (index === 0 || row.net !== sorted[index - 1].net) rank = index + 1;
    ranks.set(row, rank);
  });
  return ranks;
}

/**
 * Ranks players by net result from settled stacks, so the order changes when
 * a hand ends rather than with every bet. Throws unless the settled chips
 * and the rake balance against everything bought in, as a saved game must.
 */
export function deriveLiveView(snapshot: LiveSnapshot): LiveView {
  const accounting = deriveSessionAccounting({
    startStack: snapshot.startStack,
    rake: snapshot.rake,
    results: snapshot.players.map((player) => ({
      name: player.name,
      end: player.settledStack,
      net: player.settledStack - player.buyIns.reduce((sum, value) => sum + value, 0),
      buyIns: player.buyIns,
    })),
  });

  const rules = snapshot.rebuyRules;
  const rebuysClosed =
    !!rules &&
    rules.closeAtBigBlind !== null &&
    snapshot.bigBlind >= rules.closeAtBigBlind;
  const history = snapshot.history ?? [];
  const rows = accounting.results.map((result, index) => {
    const player = snapshot.players[index];
    const rebuys = result.buyIns.length - 1;
    const nets = history.map((entry) =>
      index < entry.nets.length ? entry.nets[index] : null,
    );
    return {
      name: result.name,
      ...(player.avatar ? { avatar: player.avatar } : {}),
      stack: player.stack,
      invested: result.invested,
      start: result.buyIns[0] ?? 0,
      net: result.net,
      rebuys,
      ...(player.left ? { left: true } : {}),
      ...(player.status ? { status: player.status } : {}),
      ...(player.inHand === undefined ? {} : { inHand: player.inHand }),
      ...(player.role ? { role: player.role } : {}),
      ...(player.bigBlindIn === undefined || player.left
        ? {}
        : { bigBlindIn: player.bigBlindIn }),
      ...(rules && !player.left
        ? rebuysClosed
          ? { rebuysLeft: 0, rebuysClosed: true }
          : rules.maxRebuys === null
            ? {}
            : { rebuysLeft: Math.max(0, rules.maxRebuys - rebuys) }
        : {}),
      ...(nets.some((net) => net !== null) ? { nets } : {}),
      seat: index,
    };
  });

  const ranks = rankOf(rows);
  // Places moved since the hand before the last one finished.
  const before = history.at(-2);
  const earlier = before
    ? rankOf(
        rows
          .filter((row) => row.seat < before.nets.length)
          .map((row) => ({ name: row.name, net: before.nets[row.seat], seat: row.seat })),
      )
    : null;
  const earlierRank = new Map<number, number>();
  earlier?.forEach((rank, row) => earlierRank.set(row.seat, rank));

  const standings = [...rows].sort(byNet).map((row) => {
    const rank = ranks.get(row)!;
    const previous = earlierRank.get(row.seat);
    const move = previous === undefined ? 0 : previous - rank;
    return { rank, ...row, ...(move ? { move } : {}) };
  });

  const seated = snapshot.players.filter((player) => !player.left);
  const chipsInPlay = seated.reduce((sum, player) => sum + player.settledStack, 0);
  const withChips = seated.filter((player) => player.settledStack > 0);

  return {
    gameName: snapshot.gameName,
    ...(snapshot.chipUnit === "cents" ? { chipUnit: snapshot.chipUnit } : {}),
    handNo: snapshot.handNo,
    handInProgress: snapshot.handInProgress,
    bigBlind: snapshot.bigBlind,
    ...(snapshot.smallBlind === undefined ? {} : { smallBlind: snapshot.smallBlind }),
    ...(snapshot.rebuyRules ? { rebuyRules: snapshot.rebuyRules } : {}),
    ...(snapshot.rake ? { rake: snapshot.rake } : {}),
    ...(snapshot.plainChips ? { plainChips: true } : {}),
    ...(snapshot.startedAt === undefined ? {} : { startedAt: snapshot.startedAt }),
    ...(snapshot.blindLevel === undefined ? {} : { blindLevel: snapshot.blindLevel }),
    ...(snapshot.bigBlindAnte ? { bigBlindAnte: true } : {}),
    ...(snapshot.hand ? { hand: snapshot.hand } : {}),
    ...(snapshot.nextBlinds ? { nextBlinds: snapshot.nextBlinds } : {}),
    ...(snapshot.lastHand ? { lastHand: snapshot.lastHand } : {}),
    ...(snapshot.biggestPot ? { biggestPot: snapshot.biggestPot } : {}),
    ...(history.length ? { historyHands: history.map((entry) => entry.no) } : {}),
    chipsInPlay,
    ...(withChips.length
      ? { averageStack: Math.round(chipsInPlay / withChips.length) }
      : {}),
    standings,
  };
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** A share token is 32 random bytes in unpadded base64url. */
export function isLiveToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}
