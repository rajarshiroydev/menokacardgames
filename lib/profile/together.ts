import type { GroupSessions } from "../friends/group-standings.ts";

/**
 * Games the signed-in person played together with each player in their list,
 * keyed by that player's id. A game counts when both of them have a result in
 * it, whoever hosted it:
 *
 * - in the person's own games, any player in their list;
 * - in a friend's games (the ones where that friend linked them), a player
 *   counts when the result belongs to an account the person has linked in
 *   their own list. That host's own player and other linked friends are known
 *   by account; guests in someone else's list can't be told apart, so they
 *   never count there.
 *
 * Each host's games are separate games, so nothing is counted twice.
 */
export function buildGamesTogether(
  own: { myPlayerId: string | null; sessions: GroupSessions["sessions"] },
  groups: Array<Pick<GroupSessions, "myPlayerId" | "sessions">>,
  /** The person's own players linked to an account: account id → player id. */
  linkedPlayers: Map<string, string>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  const add = (players: Set<string>) => {
    for (const playerId of players) counts[playerId] = (counts[playerId] ?? 0) + 1;
  };

  if (own.myPlayerId) {
    for (const session of own.sessions) {
      if (!session.results.some((result) => result.playerId === own.myPlayerId)) {
        continue;
      }
      add(
        new Set(
          session.results
            .map((result) => result.playerId)
            .filter((playerId) => playerId !== own.myPlayerId),
        ),
      );
    }
  }

  for (const group of groups) {
    for (const session of group.sessions) {
      if (!session.results.some((result) => result.playerId === group.myPlayerId)) {
        continue;
      }
      const players = new Set<string>();
      for (const result of session.results) {
        if (result.playerId === group.myPlayerId || !result.accountId) continue;
        const playerId = linkedPlayers.get(result.accountId);
        if (playerId && playerId !== own.myPlayerId) players.add(playerId);
      }
      add(players);
    }
  }
  return counts;
}
