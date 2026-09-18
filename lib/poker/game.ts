import type {
  BlindSchedule,
  GameState,
  LeaderboardEntry,
  PokerSession,
} from "./types";

export const GAME_STORAGE_KEY = "pokerLedger.v1";
export const HISTORY_STORAGE_KEY = "pokerLedger.history.v1";
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

export function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function playerKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function activeIndexes(game: GameState) {
  if (!game.hand) return [];
  return game.players
    .map((_, index) => index)
    .filter((index) => game.hand?.in[index]);
}

export function pendingIndexes(game: GameState) {
  if (!game.hand) return [];
  const hand = game.hand;
  return activeIndexes(game).filter(
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

export function minimumRaise(game: GameState, playerIndex: number) {
  const hand = game.hand;
  if (!hand) return 0;

  const utgIndex = nextEligibleIndex(hand.in, hand.bigBlindIndex);
  const isUtgOpeningAction =
    hand.stage === 0 &&
    playerIndex === utgIndex &&
    !hand.acted.some(Boolean);
  const target = isUtgOpeningAction ? game.ante * 2 : hand.roundHigh + 1;

  return Math.max(
    1,
    Math.min(
      target - hand.committed[playerIndex],
      game.players[playerIndex].stack,
    ),
  );
}

export function smallBlindFor(bigBlind: number) {
  return Math.floor(bigBlind / 2);
}

export function startingBigBlind(game: GameState) {
  return game.baseAnte ?? game.ante;
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
  const schedule = game.blinds;
  if (!schedule || schedule.every <= 0) return 0;
  const elapsed =
    schedule.unit === "hands"
      ? handNo - 1
      : (now - game.startedAt) / MINUTE;
  return Math.max(0, Math.floor(elapsed / schedule.every));
}

/** What the blinds are now, and what the next level brings. */
export function blindStatus(game: GameState, now = Date.now()) {
  const schedule = game.blinds;
  const base = startingBigBlind(game);
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
    status.handsLeft = Math.max(0, (level + 1) * schedule.every - game.handNo);
    status.dueNow = status.handsLeft === 0;
  } else {
    const levelEndsAt =
      game.startedAt + (level + 1) * schedule.every * MINUTE;
    status.msLeft = Math.max(0, levelEndsAt - now);
    status.dueNow = status.msLeft === 0;
  }
  return status;
}

/** Moves `game.ante` to the level the given hand belongs to. */
function applyBlindLevel(game: GameState, handNo: number, now: number) {
  if (!game.blinds) return;
  const level = blindLevelFor(game, handNo, now);
  const bigBlind = bigBlindAtLevel(startingBigBlind(game), game.blinds, level);
  const raised = bigBlind !== game.ante;
  game.blindLevel = level;
  game.ante = bigBlind;
  if (raised) {
    game.log.unshift(
      `Hand ${handNo}: blinds up to ${formatRupees(
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
  };
  game.hand.currentPlayer = nextPlayerToAct(game, bigBlindIndex);
}

export function buildLeaderboard(sessions: PokerSession[]) {
  const entries = new Map<string, LeaderboardEntry>();

  sessions.filter((session) => !session.discardedAt).forEach((session) => {
    session.results.forEach((result) => {
      const key = result.playerId
        ? `id:${result.playerId}`
        : `name:${playerKey(result.name)}`;
      const entry = entries.get(key) ?? {
        playerId: result.playerId,
        name: result.name,
        net: 0,
        sessions: 0,
        hands: 0,
        wins: 0,
        best: result.net,
        worst: result.net,
      };

      entry.name = result.name;
      entry.net += result.net;
      entry.sessions += 1;
      entry.hands += session.hands;
      if (result.net > 0) entry.wins += 1;
      entry.best = Math.max(entry.best, result.net);
      entry.worst = Math.min(entry.worst, result.net);
      entries.set(key, entry);
    });
  });

  return [...entries.values()].sort((a, b) => b.net - a.net);
}
