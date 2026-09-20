import type { PokerSession } from "./types";

export const LEGACY_GAME_STORAGE_KEY = "pokerLedger.v1";
export const LEGACY_HISTORY_STORAGE_KEY = "pokerLedger.history.v1";

export function accountGameStorageKey(accountId: string) {
  return `pokerLedger.account.${accountId}.game.v1`;
}

export function prepareLegacySessionsForAdoption(
  sessions: PokerSession[],
  selectedIds: Set<string>,
) {
  return sessions
    .filter((session) => selectedIds.has(session.id))
    .map((session) => ({
      ...session,
      results: session.results.map((result) => {
        const adoptedResult = { ...result };
        delete adoptedResult.playerId;
        return adoptedResult;
      }),
    }));
}
