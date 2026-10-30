import { dealNewHand } from "./game.ts";
import { normalizeChipValue } from "./settle-up.ts";
import type { GameState, PokerSession } from "./types";

export const LEGACY_GAME_STORAGE_KEY = "pokerLedger.v1";
export const LEGACY_HISTORY_STORAGE_KEY = "pokerLedger.history.v1";

export function accountGameStorageKey(accountId: string) {
  return `pokerLedger.account.${accountId}.game.v1`;
}

/**
 * This browser's random ID, so the server knows which device holds a game's
 * backup (lib/poker/game-backup.ts). Kept for this visit when storage is
 * refused, which only means a restore can't tell this device apart later.
 */
export const DEVICE_ID_STORAGE_KEY = "pokerLedger.deviceId.v1";
let deviceIdThisVisit: string | null = null;

function newDeviceId() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function readDeviceId(): string {
  if (deviceIdThisVisit) return deviceIdThisVisit;
  try {
    const stored = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (stored && /^[A-Za-z0-9_-]{16,64}$/.test(stored)) {
      deviceIdThisVisit = stored;
      return stored;
    }
  } catch {
    // Blocked storage: a new ID for this visit.
  }
  deviceIdThisVisit = newDeviceId();
  try {
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceIdThisVisit);
  } catch {
    // Kept for this visit only.
  }
  return deviceIdThisVisit;
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

/**
 * A game kept on a device or restored from a backup, brought up to date with
 * fields older versions didn't have. Null when it isn't a game.
 */
export function normalizeGameState(input: unknown): GameState | null {
  try {
    const data = input as GameState | null;
    if (!data?.players) return null;
    // Games saved before escalating blinds kept one fixed big blind.
    data.baseAnte ??= data.ante;
    data.blinds ??= null;
    data.blindLevel ??= 0;
    data.blindPlans ??= [{
      effectiveHand: 1,
      effectiveAt: data.startedAt,
      baseBigBlind: data.baseAnte,
      schedule: data.blinds,
    }];
    data.blindLevels ??= [
      {
        handNo: 1,
        dealtAt: data.startedAt,
        bigBlind: data.baseAnte,
      },
      ...(data.handNo > 1 && data.ante !== data.baseAnte
        ? [{ handNo: data.handNo, dealtAt: Date.now(), bigBlind: data.ante }]
        : []),
    ];
    data.players.forEach((player) => {
      player.buyIns ??= [data.startStack];
    });
    if (data.chipValue !== undefined && !normalizeChipValue(data.chipValue)) {
      delete data.chipValue;
    }
    if (data.lastHand) {
      data.lastHand.buyInsBefore ??= data.players.map((player) => [
        ...(player.buyIns ?? [data.startStack]),
      ]);
    }
    // Older saved games did not have positional betting. Start their next hand
    // with the new model instead of leaving an unusable in-progress hand.
    if (!Number.isInteger(data.dealerIndex)) {
      data.players.forEach((player, index) => {
        player.stack = data.hand?.stacksBeforeHand[index] ?? player.stack;
      });
      data.dealerIndex = -1;
      data.hand = null;
      data.winnerAnnouncement = null;
      dealNewHand(data);
    }
    return data;
  } catch {
    return null;
  }
}
