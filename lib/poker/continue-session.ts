import { bigBlindAtLevel, sessionBlindHistory } from "./game.ts";
import type { SavedSession } from "./session-conflict.ts";
import type {
  BlindHistory,
  BlindPlan,
  GameState,
  PlayerProfile,
  PokerSession,
} from "./types";

/** Levels searched when working out which level a saved big blind was. */
const MAX_LEVEL_SEARCH = 1000;

/** The level of `plan` whose big blind is `bigBlind`, or 0 if none is. */
function levelForBigBlind(plan: BlindPlan, bigBlind: number) {
  if (!plan.schedule) return 0;
  for (let level = 0; level <= MAX_LEVEL_SEARCH; level += 1) {
    const atLevel = bigBlindAtLevel(plan.baseBigBlind, plan.schedule, level);
    if (atLevel === bigBlind) return level;
    if (atLevel > bigBlind) break;
  }
  return 0;
}

/**
 * Reopens a saved game between hands, so it can be played on and saved
 * again over the same game. Everyone keeps their seat, final chips and
 * buy-ins; hand numbers carry on. The dealer isn't saved, so the next one is
 * drawn at random. A timed blind schedule restarts its clock at the current
 * big blind on the next hand, so time away from the table doesn't raise it.
 */
export function gameFromSession(
  session: SavedSession,
  profiles: Pick<PlayerProfile, "id" | "name">[],
  currency: string,
  now = Date.now(),
  random = Math.random,
): GameState {
  const history = sessionBlindHistory(session);
  const lastPlan = history.plans.at(-1)!;
  const bigBlind = history.levels.at(-1)!.bigBlind;
  const label = session.name || `Game ${session.sessionNumber}`;
  const names = new Map(profiles.map((profile) => [profile.id, profile.name]));
  const plans: BlindPlan[] = history.plans.map((plan) => ({ ...plan }));
  if (lastPlan.schedule?.unit === "minutes") {
    plans.push({
      effectiveHand: session.hands + 1,
      effectiveAt: now,
      baseBigBlind: bigBlind,
      schedule: { ...lastPlan.schedule },
    });
  }
  const firstDealer = Math.floor(random() * session.results.length);

  return {
    ...(session.name ? { gameName: session.name } : {}),
    sessionLabel: label,
    currency,
    ...(history.smallBlindRatio
      ? { smallBlindRatio: { ...history.smallBlindRatio } }
      : {}),
    ante: bigBlind,
    baseAnte: session.ante,
    blinds: lastPlan.schedule ? { ...lastPlan.schedule } : null,
    blindLevel: levelForBigBlind(lastPlan, bigBlind),
    blindPlans: plans,
    blindLevels: history.levels.map((level) => ({ ...level })),
    startStack: session.startStack,
    startedAt: session.date,
    players: session.results.map((result) => ({
      ...(result.playerId ? { id: result.playerId } : {}),
      name: (result.playerId && names.get(result.playerId)) || result.name,
      stack: result.end,
      buyIns: result.buyIns?.length
        ? [...result.buyIns]
        : [session.startStack],
    })),
    hand: null,
    handNo: session.hands,
    // The next hand deals from the seat after this one.
    dealerIndex: firstDealer - 1,
    log: [
      `Continued from ${label} after ${session.hands} hand${
        session.hands === 1 ? "" : "s"
      }`,
    ],
    winnerAnnouncement: null,
    lastHand: null,
    continues: {
      id: session.id,
      sessionNumber: session.sessionNumber,
      ended: session.ended,
      hands: session.hands,
    },
    _setupCount: session.results.length,
  };
}

function canonicalPlans(history: BlindHistory) {
  return history.plans.map((plan) =>
    JSON.stringify([
      plan.effectiveHand,
      plan.effectiveAt,
      plan.baseBigBlind,
      plan.schedule
        ? [
            plan.schedule.unit,
            plan.schedule.every,
            plan.schedule.raiseType,
            plan.schedule.raiseBy,
          ]
        : null,
    ]),
  );
}

function canonicalLevels(history: BlindHistory) {
  return history.levels.map((level) =>
    JSON.stringify([level.handNo, level.dealtAt, level.bigBlind]),
  );
}

function startsWith(list: string[], prefix: string[]) {
  return (
    prefix.length <= list.length &&
    prefix.every((value, index) => list[index] === value)
  );
}

/**
 * Why `incoming` can't be saved over `saved` as its continuation, or null
 * when it can. Both must have resolved player IDs. A continuation is the same
 * game played on: same start, stakes and seats, more hands, and every
 * buy-in and blind change from before kept as it was.
 */
export function continuationError(
  saved: PokerSession,
  incoming: PokerSession,
): string | null {
  if (
    incoming.id !== saved.id ||
    incoming.date !== saved.date ||
    incoming.startStack !== saved.startStack ||
    incoming.ante !== saved.ante
  ) {
    return "The continued game doesn't match the saved game";
  }
  if (incoming.hands <= saved.hands) {
    return "No new hands to save";
  }
  if (incoming.ended <= saved.ended) {
    return "The continued game must end after the saved game";
  }
  if (
    incoming.results.length !== saved.results.length ||
    incoming.results.some(
      (result, index) =>
        !result.playerId || result.playerId !== saved.results[index].playerId,
    )
  ) {
    return "The continued game must keep the same players in the same seats";
  }
  const keptBuyIns = saved.results.every((result, index) => {
    const before = result.buyIns ?? [saved.startStack];
    const after = incoming.results[index].buyIns ?? [incoming.startStack];
    return startsWith(after.map(String), before.map(String));
  });
  if (!keptBuyIns) {
    return "The continued game must keep every earlier buy-in";
  }
  if (saved.blindHistory) {
    const before = saved.blindHistory;
    const after = incoming.blindHistory;
    if (
      !after ||
      !startsWith(canonicalPlans(after), canonicalPlans(before)) ||
      !startsWith(canonicalLevels(after), canonicalLevels(before)) ||
      JSON.stringify(after.smallBlindRatio ?? null) !==
        JSON.stringify(before.smallBlindRatio ?? null)
    ) {
      return "The continued game must keep the earlier blinds";
    }
  }
  return null;
}
