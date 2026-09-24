import type { BlindHistory, PokerSession } from "./types";

export const SESSION_CONFLICT = "session-conflict";

/** A saved session as the ledger reads it back, with its owner-local number. */
export type SavedSession = PokerSession & { sessionNumber: number };

function canonicalBlindHistory(history: BlindHistory | undefined) {
  if (!history) return null;
  return {
    plans: history.plans.map((plan) => ({
      effectiveHand: plan.effectiveHand,
      effectiveAt: plan.effectiveAt,
      baseBigBlind: plan.baseBigBlind,
      schedule: plan.schedule
        ? {
            unit: plan.schedule.unit,
            every: plan.schedule.every,
            raiseType: plan.schedule.raiseType,
            raiseBy: plan.schedule.raiseBy,
          }
        : null,
    })),
    levels: history.levels.map((level) => ({
      handNo: level.handNo,
      dealtAt: level.dealtAt,
      bigBlind: level.bigBlind,
    })),
  };
}

function canonicalContent(session: PokerSession, name: string) {
  return JSON.stringify({
    name,
    date: session.date,
    ended: session.ended,
    ante: session.ante,
    startStack: session.startStack,
    hands: session.hands,
    blindHistory: canonicalBlindHistory(session.blindHistory),
    // Player names are display labels; the resolved player ID is the identity.
    results: session.results.map((result) => ({
      playerId: result.playerId ?? null,
      end: result.end,
      net: result.net,
      buyIns: result.buyIns ?? [session.startStack],
    })),
  });
}

/**
 * True when a retried save describes the session that is already stored.
 * Both sides must have resolved player IDs. An unnamed incoming session
 * matches the default "Game N" name the ledger shows, so a re-imported
 * export still counts as the same session.
 */
export function isSameSession(saved: SavedSession, incoming: PokerSession) {
  const defaultName = `Game ${saved.sessionNumber}`;
  return (
    canonicalContent(saved, saved.name || defaultName) ===
    canonicalContent(incoming, incoming.name || defaultName)
  );
}
