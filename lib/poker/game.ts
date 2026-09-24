import { MAX_BUY_INS } from "./buy-ins.ts";
import type {
  BlindPlan,
  BlindSchedule,
  GameState,
  RaiseRecord,
} from "./types";

export const STAGES = ["PREFLOP", "FLOP", "TURN", "RIVER"] as const;
export const MINUTE = 60_000;
export const DEFAULT_BLIND_SCHEDULE: BlindSchedule = {
  unit: "hands",
  every: 10,
  raiseType: "multiply",
  raiseBy: 2,
};

export function formatRupees(value: number) {
  return `₹${Number(value).toLocaleString("en-IN")}`;
}

const chipFormat = new Intl.NumberFormat("en-IN", { signDisplay: "exceptZero" });
const percentFormat = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

/** Signed chip amount for standings, without implying real money. */
export function formatChipChange(value: number) {
  return chipFormat.format(value);
}

/** Signed percentage rounded for display only. */
export function formatPercent(value: number) {
  return `${percentFormat.format(value)}%`;
}

export function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function activeIndexes(game: GameState) {
  if (!game.hand) return [];
  return game.players
    .map((_, index) => index)
    .filter((index) => game.hand?.in[index]);
}

export function playerBuyIns(game: GameState, playerIndex: number) {
  const buyIns = game.players[playerIndex].buyIns;
  return buyIns?.length ? buyIns : [game.startStack];
}

export function totalBuyIns(game: GameState, playerIndex: number) {
  return playerBuyIns(game, playerIndex).reduce(
    (total, amount) => total + amount,
    0,
  );
}

export function nextBuyIn(game: GameState, playerIndex: number) {
  const player = game.players[playerIndex];
  if (!player || game.hand || player.stack !== 0) return null;
  // Every rebuy is the full starting stack.
  const amount = game.startStack;
  return (
    amount > 0 &&
    playerBuyIns(game, playerIndex).length < MAX_BUY_INS &&
    Number.isSafeInteger(totalBuyIns(game, playerIndex) + amount)
  )
    ? amount
    : null;
}

export function buyInPlayer(game: GameState, playerIndex: number) {
  const amount = nextBuyIn(game, playerIndex);
  if (amount === null) return null;
  const player = game.players[playerIndex];
  player.buyIns = [...playerBuyIns(game, playerIndex), amount];
  player.stack = amount;
  return amount;
}

function bettingIsClosed(game: GameState) {
  const hand = game.hand;
  if (!hand) return true;
  const active = activeIndexes(game);
  const funded = active.filter((index) => game.players[index].stack > 0);
  return (
    active.length > 1 &&
    (funded.length === 0 ||
      (funded.length === 1 &&
        hand.committed[funded[0]] >= hand.roundHigh))
  );
}

export function pendingIndexes(game: GameState) {
  if (!game.hand) return [];
  const hand = game.hand;
  const active = activeIndexes(game);
  if (bettingIsClosed(game)) return [];
  return active.filter(
    (index) =>
      game.players[index].stack > 0 &&
      (!hand.acted[index] || hand.committed[index] < hand.roundHigh),
  );
}

export function nextEligibleIndex(inHand: boolean[], from: number) {
  for (let offset = 1; offset <= inHand.length; offset += 1) {
    const index = (from + offset) % inHand.length;
    if (inHand[index]) return index;
  }
  return -1;
}

export function nextPlayerToAct(game: GameState, from: number) {
  const hand = game.hand;
  if (!hand) return null;
  if (bettingIsClosed(game)) return null;
  for (let offset = 1; offset <= game.players.length; offset += 1) {
    const index = (from + offset) % game.players.length;
    if (
      hand.in[index] &&
      game.players[index].stack > 0 &&
      (!hand.acted[index] || hand.committed[index] < hand.roundHigh)
    ) {
      return index;
    }
  }
  return null;
}

/** Bet slider stops between the minimum and all in, as multiples of the minimum. */
export const BET_PRESET_MULTIPLES = [1.5, 2, 5, 10] as const;

/**
 * Exact chip amounts the bet slider snaps to: the minimum, each multiple of
 * it rounded to a whole chip, then the whole stack (all in). Stops at or
 * above the stack collapse into all in; a stack no larger than the minimum
 * leaves only all in.
 */
export function betStops(minimum: number, stack: number) {
  if (stack <= 0) return [];
  if (minimum >= stack) return [stack];
  const multiples = BET_PRESET_MULTIPLES.map((multiple) =>
    Math.round(minimum * multiple),
  ).filter((amount) => amount > minimum && amount < stack);
  return [...new Set([minimum, ...multiples, stack])];
}

/** How much a raise must add this street: the last full bet or raise, or the big blind. */
export function raiseSize(game: GameState) {
  return game.hand?.raiseSize ?? game.ante;
}

/** False after a short all-in: the player already acted, so they may only call or fold. */
export function mayRaise(game: GameState, playerIndex: number) {
  return game.hand?.raiseOpen?.[playerIndex] ?? true;
}

/**
 * Chips this player must add for the smallest legal bet or raise: the
 * current bet plus the last full raise (the big blind when nobody has
 * raised), capped at their stack, which is always allowed as an all in.
 */
export function minimumRaise(game: GameState, playerIndex: number) {
  const hand = game.hand;
  if (!hand) return 0;
  const target = hand.roundHigh + raiseSize(game);
  return Math.max(
    1,
    Math.min(
      target - hand.committed[playerIndex],
      game.players[playerIndex].stack,
    ),
  );
}

/**
 * Updates the betting after a player's chips for this street have been
 * added to `committed`. Going above the current bet makes everyone else
 * act again. Only a full raise (adding at least the last raise size) sets
 * a new raise size and lets players who already acted raise again; a
 * short all-in doesn't. Returns the rules from before, for undo.
 */
export function applyRaiseRules(
  game: GameState,
  playerIndex: number,
): RaiseRecord {
  const hand = game.hand!;
  const open = hand.raiseOpen ?? game.players.map(() => true);
  const before: RaiseRecord = {
    size: raiseSize(game),
    open: [...open],
    full: false,
  };
  const total = hand.committed[playerIndex];
  const increase = total - hand.roundHigh;
  hand.acted[playerIndex] = true;
  if (increase > 0) {
    hand.roundHigh = total;
    hand.acted = hand.acted.map(
      (_, index) =>
        index === playerIndex ||
        !hand.in[index] ||
        game.players[index].stack === 0,
    );
    if (increase >= before.size) {
      before.full = true;
      hand.raiseSize = increase;
      open.fill(true);
    }
  }
  open[playerIndex] = false;
  hand.raiseOpen = open;
  return before;
}

/** Puts the raise rules back to how they were before an undone action. */
export function undoRaiseRules(
  game: GameState,
  playerIndex: number,
  before: RaiseRecord | undefined,
) {
  const hand = game.hand!;
  if (before?.full) {
    hand.raiseSize = before.size;
    hand.raiseOpen = [...before.open];
    return;
  }
  const open = hand.raiseOpen ?? game.players.map(() => true);
  open[playerIndex] = before?.open[playerIndex] ?? true;
  hand.raiseOpen = open;
}

/** Each street starts with raises of one big blind, open to everyone. */
export function resetRaiseRules(game: GameState) {
  const hand = game.hand!;
  hand.raiseSize = game.ante;
  hand.raiseOpen = game.players.map(() => true);
}

export function smallBlindFor(bigBlind: number) {
  return Math.floor(bigBlind / 2);
}

export function startingBigBlind(game: GameState) {
  return game.baseAnte ?? game.ante;
}

function initialBlindPlan(game: GameState): BlindPlan {
  return {
    effectiveHand: 1,
    effectiveAt: game.startedAt,
    baseBigBlind: startingBigBlind(game),
    schedule: game.blinds ?? null,
  };
}

function planForHand(game: GameState, handNo: number): BlindPlan {
  const plans = game.blindPlans;
  if (plans?.length) {
    for (let index = plans.length - 1; index >= 0; index -= 1) {
      if (plans[index].effectiveHand <= handNo) return plans[index];
    }
    return plans[0];
  }
  return initialBlindPlan(game);
}

export function pendingBlindPlan(game: GameState) {
  return game.blindPlans?.find((plan) => plan.effectiveHand > game.handNo);
}

/** A changed plan starts on the next dealt hand, without changing this hand. */
export function editBlindSchedule(
  game: GameState,
  schedule: BlindSchedule | null,
  now = Date.now(),
) {
  const effectiveHand = game.handNo + 1;
  game.blindPlans = [
    ...(game.blindPlans ?? [initialBlindPlan(game)]).filter(
      (plan) => plan.effectiveHand < effectiveHand,
    ),
    {
      effectiveHand,
      effectiveAt: now,
      baseBigBlind: game.ante,
      schedule,
    },
  ];
}

export function bigBlindAtLevel(
  base: number,
  schedule: BlindSchedule | null | undefined,
  level: number,
) {
  if (!schedule || level <= 0) return Math.max(1, Math.round(base));
  const raised =
    schedule.raiseType === "multiply"
      ? base * schedule.raiseBy ** level
      : base + schedule.raiseBy * level;
  return Math.max(1, Math.round(raised));
}

/**
 * Level the given hand is dealt at. Hand-based levels count completed hands,
 * so `every: 10` keeps hands 1-10 at level 0. Time-based levels count real
 * minutes since the game started, and only apply when the next hand is dealt.
 */
export function blindLevelFor(
  game: GameState,
  handNo: number,
  now = Date.now(),
) {
  const plan = planForHand(game, handNo);
  const schedule = plan.schedule;
  if (!schedule || schedule.every <= 0) return 0;
  const elapsed =
    schedule.unit === "hands"
      ? handNo - plan.effectiveHand
      : (now - plan.effectiveAt) / MINUTE;
  return Math.max(0, Math.floor(elapsed / schedule.every));
}

/** What the blinds are now, and what the next level brings. */
export function blindStatus(game: GameState, now = Date.now()) {
  const plan = planForHand(game, game.handNo);
  const schedule = plan.schedule;
  const base = plan.baseBigBlind;
  const level = game.blindLevel ?? 0;
  const bigBlind = game.ante;
  const status = {
    schedule,
    level,
    bigBlind,
    smallBlind: smallBlindFor(bigBlind),
    nextBigBlind: 0,
    nextSmallBlind: 0,
    /** Hands still to be played at this level, for hand-based schedules. */
    handsLeft: 0,
    /** Milliseconds until the next level, for time-based schedules. */
    msLeft: 0,
    /** The next hand dealt will be at a higher level. */
    dueNow: false,
  };
  if (!schedule || schedule.every <= 0) return status;

  status.nextBigBlind = bigBlindAtLevel(base, schedule, level + 1);
  status.nextSmallBlind = smallBlindFor(status.nextBigBlind);
  if (schedule.unit === "hands") {
    status.handsLeft = Math.max(
      0,
      plan.effectiveHand + (level + 1) * schedule.every - 1 - game.handNo,
    );
    status.dueNow = status.handsLeft === 0;
  } else {
    const levelEndsAt =
      plan.effectiveAt + (level + 1) * schedule.every * MINUTE;
    status.msLeft = Math.max(0, levelEndsAt - now);
    status.dueNow = status.msLeft === 0;
  }
  return status;
}

/** Moves `game.ante` to the level the given hand belongs to. */
function applyBlindLevel(game: GameState, handNo: number, now: number) {
  const plan = planForHand(game, handNo);
  const level = blindLevelFor(game, handNo, now);
  const bigBlind = bigBlindAtLevel(plan.baseBigBlind, plan.schedule, level);
  const previousBigBlind = game.ante;
  const changed = bigBlind !== previousBigBlind;
  game.blinds = plan.schedule;
  game.blindLevel = level;
  game.ante = bigBlind;
  const previousLevels = (game.blindLevels ?? []).filter(
    (entry) => entry.handNo < handNo,
  );
  game.blindLevels =
    previousLevels.at(-1)?.bigBlind === bigBlind
      ? previousLevels
      : [...previousLevels, { handNo, dealtAt: now, bigBlind }];
  if (changed) {
    game.log.unshift(
      `Hand ${handNo}: blinds ${bigBlind > previousBigBlind ? "up" : "set"} to ${formatRupees(
        smallBlindFor(bigBlind),
      )}/${formatRupees(bigBlind)} (level ${level + 1})`,
    );
    game.log = game.log.slice(0, 80);
  }
}

export function dealNewHand(game: GameState, now = Date.now()) {
  const alive = game.players.filter((player) => player.stack > 0).length;
  if (alive < 2) {
    game.hand = null;
    return;
  }

  const dealerIndexBefore = game.dealerIndex;
  const anteBefore = game.ante;
  const blindLevelBefore = game.blindLevel ?? 0;
  const blindsBefore = game.blinds ?? null;
  const blindLevelsBefore = structuredClone(game.blindLevels ?? []);
  game.handNo += 1;
  applyBlindLevel(game, game.handNo, now);
  const inHand = game.players.map((player) => player.stack > 0);
  const previousDealer = Number.isInteger(game.dealerIndex)
    ? game.dealerIndex
    : -1;
  const dealerIndex = nextEligibleIndex(inHand, previousDealer);
  const smallBlindIndex =
    alive === 2
      ? dealerIndex
      : nextEligibleIndex(inHand, dealerIndex);
  const bigBlindIndex = nextEligibleIndex(inHand, smallBlindIndex);
  const stacksBeforeHand = game.players.map((player) => player.stack);
  const committed = game.players.map(() => 0);
  let pot = 0;
  [[smallBlindIndex, smallBlindFor(game.ante)], [bigBlindIndex, game.ante]].forEach(
    ([index, blind]) => {
      const chips = Math.min(blind, game.players[index].stack);
      game.players[index].stack -= chips;
      committed[index] += chips;
      pot += chips;
    },
  );
  game.dealerIndex = dealerIndex;

  game.hand = {
    no: game.handNo,
    pot,
    stage: 0,
    in: inHand,
    committed,
    acted: game.players.map(() => false),
    last: game.players.map(() => null),
    roundHigh: committed[bigBlindIndex],
    stacksBeforeHand,
    dealerIndex,
    smallBlindIndex,
    bigBlindIndex,
    currentPlayer: null,
    dealerIndexBefore,
    anteBefore,
    blindLevelBefore,
    blindsBefore,
    blindLevelsBefore,
  };
  resetRaiseRules(game);
  game.hand.currentPlayer = nextPlayerToAct(game, bigBlindIndex);
}

function previousEligibleIndex(inHand: boolean[], from: number) {
  for (let offset = 1; offset <= inHand.length; offset += 1) {
    const index = (from - offset + inHand.length) % inHand.length;
    if (inHand[index]) return index;
  }
  return -1;
}

/** Refunds the current hand and restores the state from immediately before it was dealt. */
export function returnToBetweenHands(game: GameState) {
  const hand = game.hand;
  if (!hand) return false;

  game.players.forEach((player, index) => {
    player.stack = hand.stacksBeforeHand[index];
  });
  game.log = game.log.filter(
    (line) => !new RegExp(`^Hand ${hand.no}(?::|\\s)`).test(line),
  );
  game.handNo = hand.no - 1;
  game.dealerIndex =
    hand.dealerIndexBefore ?? previousEligibleIndex(hand.in, hand.dealerIndex);

  const restoredLevels = hand.blindLevelsBefore
    ? structuredClone(hand.blindLevelsBefore)
    : (game.blindLevels ?? []).filter((level) => level.handNo < hand.no);
  const restoredAnte =
    hand.anteBefore ?? restoredLevels.at(-1)?.bigBlind ?? startingBigBlind(game);
  const currentAnte = game.ante;
  game.ante = restoredAnte;
  game.blindLevel =
    hand.blindLevelBefore ??
    (currentAnte === restoredAnte
      ? (game.blindLevel ?? 0)
      : Math.max(0, (game.blindLevel ?? 0) - 1));
  game.blinds = hand.blindsBefore ?? planForHand(game, Math.max(1, hand.no - 1)).schedule;
  game.blindLevels = restoredLevels;
  game.winnerAnnouncement = null;
  game.hand = null;
  return true;
}
