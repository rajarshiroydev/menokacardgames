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

/** Whether this device clicks when a player acts. On unless turned off. */
export const TURN_SOUND_STORAGE_KEY = "pokerLedger.turnSound.v1";
// Kept here too, so the switch still works when storage is refused.
let turnSoundThisVisit: boolean | null = null;

export function readTurnSound(): boolean {
  if (turnSoundThisVisit !== null) return turnSoundThisVisit;
  try {
    return window.localStorage.getItem(TURN_SOUND_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function storeTurnSound(on: boolean) {
  turnSoundThisVisit = on;
  try {
    window.localStorage.setItem(TURN_SOUND_STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Private windows may refuse storage; the choice lasts this visit only.
  }
}

/**
 * How many places the table view is turned on this device, so the seats can
 * match where people really sit. Display only: deal order never changes. Kept
 * per game (by its start time), so a new game starts unturned.
 */
export const TABLE_TURN_STORAGE_KEY = "pokerLedger.tableTurn.v1";

export function readTableTurn(startedAt: number): number {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(TABLE_TURN_STORAGE_KEY) || "null",
    );
    return stored?.startedAt === startedAt && Number.isInteger(stored.turn)
      ? stored.turn
      : 0;
  } catch {
    return 0;
  }
}

export function storeTableTurn(startedAt: number, turn: number) {
  try {
    window.localStorage.setItem(
      TABLE_TURN_STORAGE_KEY,
      JSON.stringify({ startedAt, turn }),
    );
  } catch {
    // Private windows may refuse storage; the turn lasts this hand only.
  }
}
