import {
  describeRebuyRules,
  MAX_BUY_INS,
  normalizeRebuyRules,
  rebuyBlock,
} from "./buy-ins.ts";
import { formatChips } from "./money.ts";
import type {
  BlindHistory,
  BlindPlan,
  BlindSchedule,
  CompletedHand,
  GameState,
  PokerSession,
  Pot,
  PotResult,
  RaiseRecord,
  RebuyRules,
  SmallBlindRatio,
} from "./types";

export const STAGES = ["PREFLOP", "FLOP", "TURN", "RIVER"] as const;
export const MINUTE = 60_000;
export const DEFAULT_BLIND_SCHEDULE: BlindSchedule = {
  unit: "hands",
  every: 10,
  raiseType: "multiply",
  raiseBy: 2,
};

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

/** Rebuys a player has made, not counting their first buy-in. */
export function rebuysUsed(game: GameState, playerIndex: number) {
  return playerBuyIns(game, playerIndex).length - 1;
}

/** The most rebuys any player has made; a lower limit can't be set. */
export function mostRebuysUsed(game: GameState) {
  return Math.max(0, ...game.players.map((_, index) => rebuysUsed(game, index)));
}

/** Why the host's rebuy limits stop this player rebuying, or null. */
export function rebuyBlockReason(game: GameState, playerIndex: number) {
  return rebuyBlock(game.rebuyRules, rebuysUsed(game, playerIndex), game.ante);
}

/**
 * Changes the rebuy limits between hands. Returns false, changing nothing,
 * when the limit is below rebuys already made.
 */
export function editRebuyRules(game: GameState, rules: RebuyRules | null) {
  const stored = normalizeRebuyRules(rules);
  const maxRebuys = stored?.maxRebuys ?? null;
  if (maxRebuys !== null && maxRebuys < mostRebuysUsed(game)) return false;
  if (stored) game.rebuyRules = stored;
  else delete game.rebuyRules;
  // Not "Hand N:", so undoing that hand keeps this line, like the change.
  game.log.unshift(
    `Before hand ${game.handNo + 1}: rebuy rules changed to ${(
      describeRebuyRules(stored, game.currency, game.chipUnit) ?? "Unlimited rebuys"
    ).replace(/^./, (first) => first.toLowerCase())}`,
  );
  game.log = game.log.slice(0, 80);
  return true;
}

export function nextBuyIn(game: GameState, playerIndex: number) {
  const player = game.players[playerIndex];
  if (!player || game.hand || player.stack !== 0) return null;
  if (rebuyBlockReason(game, playerIndex)) return null;
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
    acted: [...hand.acted],
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
  // A bet or raise made everyone act again; undoing it keeps everyone who
  // had acted before it, or has acted since, as having acted.
  if (before?.acted) {
    hand.acted = hand.acted.map(
      (acted, index) =>
        index !== playerIndex && (acted || (before.acted?.[index] ?? false)),
    );
  }
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

/**
 * The small blind for a big blind: half, rounded down, unless the game uses
 * odd blinds, which keep the share chosen at setup as the big blind rises
 * (₹40/₹100 becomes ₹80/₹200), rounded, between ₹1 and the big blind.
 */
export function smallBlindFor(
  bigBlind: number,
  ratio?: SmallBlindRatio | null,
) {
  if (!ratio) return Math.floor(bigBlind / 2);
  return Math.min(
    bigBlind,
    Math.max(1, Math.round((bigBlind * ratio.small) / ratio.big)),
  );
}

/** An odd small blind may be anything from ₹1 up to the big blind. */
export function isValidSmallBlind(smallBlind: number, bigBlind: number) {
  return (
    Number.isSafeInteger(smallBlind) &&
    Number.isSafeInteger(bigBlind) &&
    smallBlind >= 1 &&
    smallBlind <= bigBlind
  );
}

/**
 * A saved game's blind plan and the blinds it used. Games saved before
 * 18 September 2026 have no record, and blinds couldn't change then, so they
 * show as fixed at the starting big blind with the usual half small blind.
 */
export function sessionBlindHistory(
  session: Pick<PokerSession, "ante" | "date" | "blindHistory">,
): BlindHistory {
  if (session.blindHistory?.plans.length && session.blindHistory.levels.length) {
    return session.blindHistory;
  }
  return {
    plans: [
      {
        effectiveHand: 1,
        effectiveAt: session.date,
        baseBigBlind: session.ante,
        schedule: null,
      },
    ],
    levels: [{ handNo: 1, dealtAt: session.date, bigBlind: session.ante }],
    ...(session.blindHistory?.smallBlindRatio
      ? { smallBlindRatio: session.blindHistory.smallBlindRatio }
      : {}),
  };
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

/**
 * The next few big blinds above the current one under the plan for the next
 * hand, for choosing when rebuys close. Empty when the blinds are fixed.
 */
export function upcomingBigBlinds(game: GameState, count = 4) {
  const pending = pendingBlindPlan(game);
  const plan = pending ?? planForHand(game, game.handNo);
  if (!plan.schedule || plan.schedule.every <= 0) return [];
  const firstLevel = pending ? 1 : (game.blindLevel ?? 0) + 1;
  const amounts: number[] = [];
  // Levels that round to the same big blind count once.
  for (let level = firstLevel; level < firstLevel + 1000; level += 1) {
    if (amounts.length >= count) break;
    const bigBlind = bigBlindAtLevel(plan.baseBigBlind, plan.schedule, level);
    if (!Number.isSafeInteger(bigBlind)) break;
    if (bigBlind > game.ante && bigBlind !== amounts.at(-1)) {
      amounts.push(bigBlind);
    }
  }
  return amounts;
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
    smallBlind: smallBlindFor(bigBlind, game.smallBlindRatio),
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
  status.nextSmallBlind = smallBlindFor(
    status.nextBigBlind,
    game.smallBlindRatio,
  );
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
      `Hand ${handNo}: blinds ${bigBlind > previousBigBlind ? "up" : "set"} to ${formatChips(
        smallBlindFor(bigBlind, game.smallBlindRatio),
        game.chipUnit,
        game.currency,
      )}/${formatChips(bigBlind, game.chipUnit, game.currency)} (level ${level + 1})`,
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
  [
    [smallBlindIndex, smallBlindFor(game.ante, game.smallBlindRatio)],
    [bigBlindIndex, game.ante],
  ].forEach(
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
    dealtAt: now,
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

export function belongsToHand(line: string, handNo: number) {
  return (
    line.startsWith(`Hand ${handNo} `) ||
    line.startsWith(`Hand ${handNo}:`) ||
    line.startsWith(`H${handNo} `) ||
    line.startsWith(`H${handNo}:`)
  );
}

/** Recorded when a hand's pot is awarded, before the hand is cleared. */
export function completedHandRecord(game: GameState): CompletedHand {
  const hand = game.hand!;
  return {
    stacksBefore: [...hand.stacksBeforeHand],
    buyInsBefore: game.players.map((_, index) => [
      ...playerBuyIns(game, index),
    ]),
    handNo: hand.no,
    dealtAt: hand.dealtAt,
    dealerIndexBefore: hand.dealerIndexBefore,
    anteBefore: hand.anteBefore,
    blindLevelBefore: hand.blindLevelBefore,
    blindsBefore: hand.blindsBefore,
    blindLevelsBefore: hand.blindLevelsBefore
      ? structuredClone(hand.blindLevelsBefore)
      : undefined,
  };
}

/**
 * Undoes the last completed hand, and the next hand if it has been dealt,
 * then deals the undone hand again from the same seat, blinds and time, so
 * it matches the moment it was first dealt. Only one hand can be undone.
 */
export function undoLastHand(game: GameState, now = Date.now()) {
  const last = game.lastHand;
  if (!last) return false;
  const undoneNumber =
    last.handNo ?? (game.hand ? game.hand.no - 1 : game.handNo);
  const currentHandNumber = game.hand?.no;
  // The dealer of the undone hand, for games saved without the record.
  const undoneDealer =
    game.hand?.no === undoneNumber + 1
      ? (game.hand.dealerIndexBefore ?? game.dealerIndex)
      : game.dealerIndex;

  game.players.forEach((player, index) => {
    player.stack = last.stacksBefore[index] ?? player.stack;
    player.buyIns = last.buyInsBefore?.[index] ?? player.buyIns;
  });
  game.log = game.log.filter(
    (line) =>
      !belongsToHand(line, undoneNumber) &&
      (!currentHandNumber || !belongsToHand(line, currentHandNumber)),
  );
  game.handNo = undoneNumber - 1;
  if (last.dealerIndexBefore !== undefined) {
    game.dealerIndex = last.dealerIndexBefore;
  } else {
    // Any seat whose next funded player is the undone dealer deals the
    // same positions again.
    const funded = last.stacksBefore.map((stack) => stack > 0);
    game.dealerIndex = previousEligibleIndex(funded, undoneDealer);
  }
  if (last.anteBefore !== undefined) {
    game.ante = last.anteBefore;
    game.blindLevel = last.blindLevelBefore ?? game.blindLevel;
    game.blinds = last.blindsBefore ?? null;
    game.blindLevels = structuredClone(last.blindLevelsBefore ?? []);
  }
  game.lastHand = null;
  game.winnerAnnouncement = null;
  game.hand = null;
  dealNewHand(game, last.dealtAt ?? now);
  return true;
}

/**
 * Refunds the current hand and deals it again from the same seat, blinds and
 * time, so it matches the moment it was first dealt.
 */
export function cancelCurrentHand(game: GameState, now = Date.now()) {
  const hand = game.hand;
  if (!hand) return false;
  game.players.forEach((player, index) => {
    player.stack = hand.stacksBeforeHand[index] ?? player.stack;
  });
  game.log = game.log.filter((line) => !belongsToHand(line, hand.no));
  game.handNo = hand.no - 1;
  if (hand.dealerIndexBefore !== undefined) {
    game.dealerIndex = hand.dealerIndexBefore;
  } else {
    // Hands dealt before the fuller record: any seat whose next funded
    // player is this hand's dealer deals the same positions again.
    const funded = hand.stacksBeforeHand.map((stack) => stack > 0);
    game.dealerIndex = previousEligibleIndex(funded, hand.dealerIndex);
  }
  if (hand.anteBefore !== undefined) {
    game.ante = hand.anteBefore;
    game.blindLevel = hand.blindLevelBefore ?? game.blindLevel;
    game.blinds = hand.blindsBefore ?? null;
    game.blindLevels = structuredClone(hand.blindLevelsBefore ?? []);
  }
  game.hand = null;
  dealNewHand(game, hand.dealtAt ?? now);
  return true;
}

/** Chips each player has put in this hand, blinds included. */
export function handContributions(game: GameState) {
  const hand = game.hand;
  if (!hand) return game.players.map(() => 0);
  return game.players.map((player, index) =>
    Math.max(0, (hand.stacksBeforeHand[index] ?? player.stack) - player.stack),
  );
}

/**
 * Splits the chips in the hand into a main pot and side pots. A player can
 * only win, from each opponent, as much as they put in themselves, so every
 * all-in amount of a player still in closes a pot; only players still in who
 * reached it can win it. Chips a single player put in beyond what anyone
 * else did were never called and go back to them (`refund`). Folded players'
 * chips stay in the pots they reached.
 */
export function potsFor(game: GameState): {
  pots: Pot[];
  refund: { playerIndex: number; amount: number } | null;
} {
  const hand = game.hand;
  if (!hand) return { pots: [], refund: null };
  const totals = handContributions(game);
  const highest = Math.max(0, ...totals);
  const top = totals.flatMap((chips, index) =>
    chips === highest ? [index] : [],
  );
  let refund: { playerIndex: number; amount: number } | null = null;
  if (top.length === 1 && highest > 0) {
    const next = Math.max(
      0,
      ...totals.filter((_, index) => index !== top[0]),
    );
    refund = { playerIndex: top[0], amount: highest - next };
    totals[top[0]] = next;
  }

  // Pots close at each all-in amount of a player still in; the rest of the
  // chips form the last pot. Players with chips left can still match any
  // pot, so mid-street they count for every one.
  const contenders = activeIndexes(game);
  const allIn = (index: number) => game.players[index].stack === 0;
  const levels = [
    ...new Set([
      ...contenders.filter(allIn).map((index) => totals[index]),
      Math.max(0, ...contenders.map((index) => totals[index])),
    ]),
  ]
    .filter((chips) => chips > 0)
    .sort((a, b) => a - b);
  const pots: Pot[] = [];
  let previous = 0;
  for (const level of levels) {
    const amount = totals.reduce(
      (sum, chips) => sum + Math.max(0, Math.min(chips, level) - previous),
      0,
    );
    const eligible = contenders.filter(
      (index) => totals[index] >= level || !allIn(index),
    );
    if (amount > 0) pots.push({ amount, eligible });
    previous = level;
  }
  // Folded chips above every player still in (rare) go to the last pot.
  const placed = pots.reduce((sum, pot) => sum + pot.amount, 0);
  const rest = totals.reduce((sum, chips) => sum + chips, 0) - placed;
  if (rest > 0) {
    if (pots.length) pots[pots.length - 1].amount += rest;
    else pots.push({ amount: rest, eligible: contenders });
  }
  return { pots, refund: refund?.amount ? refund : null };
}

/** "Main pot", then "Side pot", or "Side pot 1", "Side pot 2", … */
export function potLabel(index: number, count: number) {
  if (index === 0) return "Main pot";
  return count > 2 ? `Side pot ${index}` : "Side pot";
}

/** More than one pot to win, or chips to give back: the side-pot showdown. */
export function hasSidePots(game: GameState) {
  const { pots, refund } = potsFor(game);
  return pots.length > 1 || refund !== null;
}

/**
 * Pays out every pot. `winners[i]` holds the winners of pot i, one player or
 * several for a split (even shares, odd chips in seat order); a pot only one
 * player can win goes to them whatever is passed. Gives back any uncalled
 * chips, logs each pot, records the hand for undo and clears it. Returns
 * false, changing nothing, if a pot has no valid winner.
 */
export function awardPots(game: GameState, winners: number[][]) {
  const hand = game.hand;
  if (!hand) return false;
  const { pots, refund } = potsFor(game);
  const chosen = pots.map((pot, index) =>
    pot.eligible.length === 1
      ? pot.eligible
      : [...new Set(winners[index] ?? [])].sort((a, b) => a - b),
  );
  if (
    chosen.some(
      (players, index) =>
        !players.length ||
        players.some((player) => !pots[index].eligible.includes(player)),
    )
  ) {
    return false;
  }

  const name = (index: number) => game.players[index].name;
  const money = (value: number) =>
    formatChips(value, game.chipUnit, game.currency);
  const lines: string[] = [];
  if (refund) {
    game.players[refund.playerIndex].stack += refund.amount;
    lines.push(
      `Hand ${hand.no}: ${money(refund.amount)} returned to ${name(refund.playerIndex)} (not called)`,
    );
  }
  const results: PotResult[] = pots.map((pot, index) => {
    const players = chosen[index];
    const each = Math.floor(pot.amount / players.length);
    const remainder = pot.amount - each * players.length;
    players.forEach((player, rank) => {
      game.players[player].stack += each + (rank < remainder ? 1 : 0);
    });
    const label = pots.length > 1 ? potLabel(index, pots.length) : "Pot";
    const potName = label.toLowerCase();
    lines.push(
      players.length > 1
        ? `Hand ${hand.no}: split ${potName} ${money(pot.amount)} between ${players.map(name).join(", ")}`
        : `Hand ${hand.no}: ${name(players[0])} wins ${potName} ${money(pot.amount)}`,
    );
    return { label, amount: pot.amount, names: players.map(name) };
  });
  lines.forEach((line) => game.log.unshift(line));
  game.log = game.log.slice(0, 80);

  const names = [...new Set(chosen.flat())].sort((a, b) => a - b).map(name);
  game.lastHand = completedHandRecord(game);
  game.winnerAnnouncement = {
    names,
    pot: pots.reduce((sum, pot) => sum + pot.amount, 0),
    handNo: hand.no,
    split: names.length > 1,
    pots: results,
  };
  game.hand = null;
  return true;
}
