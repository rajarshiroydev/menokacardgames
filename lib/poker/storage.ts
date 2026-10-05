import type { PokerSession } from "./types";

export const LEGACY_GAME_STORAGE_KEY = "pokerLedger.v1";
export const LEGACY_HISTORY_STORAGE_KEY = "pokerLedger.history.v1";

export function accountGameStorageKey(accountId: string) {
  return `pokerLedger.account.${accountId}.game.v1`;
}

/** The share token for this account's live standings link, if sharing. */
export function accountLiveTokenStorageKey(accountId: string) {
  return `pokerLedger.account.${accountId}.live.v1`;
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

/** How the live hand is shown on this device: the seat list or the table. */
export const HAND_LAYOUT_STORAGE_KEY = "pokerLedger.handLayout.v1";
export type HandLayout = "list" | "table";

export function readHandLayout(): HandLayout {
  try {
    return window.localStorage.getItem(HAND_LAYOUT_STORAGE_KEY) === "table"
      ? "table"
      : "list";
  } catch {
    return "list";
  }
}

export function storeHandLayout(layout: HandLayout) {
  try {
    window.localStorage.setItem(HAND_LAYOUT_STORAGE_KEY, layout);
  } catch {
    // Private windows may refuse storage; the choice lasts this visit only.
  }
}
