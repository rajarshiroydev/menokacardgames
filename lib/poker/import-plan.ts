import { cleanPlayerName, playerNameKey } from "./player-validation.ts";
import type { PlayerProfile, PokerSession } from "./types";

/**
 * How one player named in a backup file will be saved. These mirror the
 * server's rules in the sessions API: a player ID must belong to this ledger,
 * and a name alone matches an existing player (active or discarded) ignoring
 * case, or adds a new one.
 */
export type ImportPlayerMapping =
  | { kind: "existing"; fileName: string; player: PlayerProfile; games: number }
  | { kind: "discarded"; fileName: string; player: PlayerProfile; games: number }
  | { kind: "new"; fileName: string; games: number }
  | { kind: "unknown-record"; fileName: string; games: number };

export type ImportPlan = {
  /** New sessions to send, in file order, each ID once. */
  additions: PokerSession[];
  /** Sessions whose ID is already in the ledger (active or discarded). */
  alreadySaved: number;
  /** Repeated IDs inside the file; only the first copy is considered. */
  duplicatesInFile: number;
  /** Entries without an ID, results or readable player names. */
  unreadable: number;
  players: ImportPlayerMapping[];
  /** True when the server would refuse the import as a whole. */
  blocked: boolean;
};

function readableSession(value: unknown): value is PokerSession {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const session = value as Partial<PokerSession>;
  if (typeof session.id !== "string" || !session.id) return false;
  if (!Array.isArray(session.results) || !session.results.length) return false;
  return session.results.every((result) => {
    if (!result || typeof result !== "object") return false;
    try {
      playerNameKey(result.name);
      return true;
    } catch {
      return false;
    }
  });
}

/** The sessions in a parsed backup file: an array, or `{ sessions: [...] }`. */
export function sessionsInBackup(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const sessions = (data as { sessions?: unknown }).sessions;
    if (Array.isArray(sessions)) return sessions;
  }
  return null;
}

export function planImport(
  entries: unknown[],
  savedSessionIds: Iterable<string>,
  players: PlayerProfile[],
): ImportPlan {
  const saved = new Set(savedSessionIds);
  const seen = new Set<string>();
  const additions: PokerSession[] = [];
  let alreadySaved = 0;
  let duplicatesInFile = 0;
  let unreadable = 0;

  for (const entry of entries) {
    if (!readableSession(entry)) {
      unreadable += 1;
      continue;
    }
    if (seen.has(entry.id)) {
      duplicatesInFile += 1;
      continue;
    }
    seen.add(entry.id);
    if (saved.has(entry.id)) alreadySaved += 1;
    else additions.push(entry);
  }

  const playersById = new Map(players.map((player) => [player.id, player]));
  const playersByName = new Map(
    players.map((player) => [playerNameKey(player.name), player]),
  );
  const mappings = new Map<string, ImportPlayerMapping>();

  for (const session of additions) {
    // A player counts once per game even if listed twice; the server rejects
    // such a game, and the preview only needs to show who is involved.
    const inGame = new Set<string>();
    for (const result of session.results) {
      const key = result.playerId
        ? `id:${result.playerId}`
        : `name:${playerNameKey(result.name)}`;
      if (inGame.has(key)) continue;
      inGame.add(key);

      const current = mappings.get(key);
      if (current) {
        current.games += 1;
        continue;
      }

      const fileName = cleanPlayerName(result.name);
      const player = result.playerId
        ? playersById.get(result.playerId)
        : playersByName.get(playerNameKey(result.name));
      mappings.set(
        key,
        player
          ? {
              kind: player.discardedAt ? "discarded" : "existing",
              fileName,
              player,
              games: 1,
            }
          : {
              kind: result.playerId ? "unknown-record" : "new",
              fileName,
              games: 1,
            },
      );
    }
  }

  const mappedPlayers = [...mappings.values()];
  return {
    additions,
    alreadySaved,
    duplicatesInFile,
    unreadable,
    players: mappedPlayers,
    blocked: mappedPlayers.some((mapping) => mapping.kind === "unknown-record"),
  };
}
