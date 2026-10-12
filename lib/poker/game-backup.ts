import type { GameState } from "./types";

/**
 * Backups of the game in progress, so a host can carry on from another
 * device (migration 0024). The host's device sends the whole game state; the
 * server checks its shape and size and keeps it for the host alone.
 */

/** A backup nobody updates for this long is deleted. */
export const GAME_BACKUP_EXPIRY_DAYS = 7;
/** Quiet time after the last change before a backup is sent. */
export const GAME_BACKUP_QUIET_MS = 2_000;
/**
 * Least time between backups: at most 6 writes a minute, so with the live
 * link's 20 the host stays under the firewall's 30 writes a minute per IP.
 */
export const GAME_BACKUP_MIN_INTERVAL_MS = 10_000;
/** Largest request a backup may be; a long game is well under 100 KB. */
export const GAME_BACKUP_BODY_LIMIT = 256 * 1024;

const GAME_ID_PATTERN = /^[A-Za-z0-9._:-]{1,100}$/;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_PLAYERS = 10;
const MAX_LOG_LINES = 200;

/** The ID a game is saved under: the saved game's when continued. */
export function gameBackupId(game: Pick<GameState, "continues" | "startedAt">) {
  return game.continues?.id ?? `s${game.startedAt}`;
}

export function isGameBackupId(value: unknown): value is string {
  return typeof value === "string" && GAME_ID_PATTERN.test(value);
}

export function isDeviceId(value: unknown): value is string {
  return typeof value === "string" && DEVICE_ID_PATTERN.test(value);
}

/** What Home shows about a backup, without sending the whole game. */
export type GameBackupSummary = {
  gameId: string;
  /** Whether the backup was written by the device asking. */
  thisDevice: boolean;
  name: string;
  handNo: number;
  handInProgress: boolean;
  players: number;
  updatedAt: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isChips(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Checks that a backup looks like a game in progress the app can open again,
 * and that it belongs to the game it is stored as. Throws with a reason.
 * The rest of the state is the host's own data; the app normalizes it when
 * it is restored, as it does for a game kept on the device.
 */
export function validateGameBackupState(
  input: unknown,
  gameId: string,
): GameState {
  if (!isObject(input)) throw new Error("Invalid game backup");
  const { players, startStack, startedAt, handNo, log } = input;
  if (
    !Array.isArray(players) ||
    players.length < 2 ||
    players.length > MAX_PLAYERS ||
    !players.every(
      (player) =>
        isObject(player) &&
        typeof player.name === "string" &&
        player.name.trim().length > 0 &&
        player.name.length <= 80 &&
        isChips(player.stack),
    )
  ) {
    throw new Error("A game backup needs 2 to 10 players with chips");
  }
  if (!isChips(startStack) || startStack === 0) {
    throw new Error("Invalid starting stack in game backup");
  }
  if (!isChips(startedAt) || startedAt === 0 || !isChips(handNo)) {
    throw new Error("Invalid game time or hand number in game backup");
  }
  if (
    log !== undefined &&
    (!Array.isArray(log) ||
      log.length > MAX_LOG_LINES ||
      !log.every((line) => typeof line === "string"))
  ) {
    throw new Error("Invalid action log in game backup");
  }
  const state = input as unknown as GameState;
  if (gameBackupId(state) !== gameId) {
    throw new Error("The game backup doesn't match its game");
  }
  return state;
}

/** Home's summary of a stored backup. */
export function summarizeGameBackup(
  gameId: string,
  state: GameState,
  updatedAt: number,
  thisDevice: boolean,
): GameBackupSummary {
  return {
    gameId,
    thisDevice,
    name: state.sessionLabel || state.gameName || "Game",
    handNo: state.handNo,
    handInProgress: Boolean(state.hand),
    players: state.players.filter((player) => !player.left).length,
    updatedAt,
  };
}
