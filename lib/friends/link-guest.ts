/**
 * Which friends a guest can be linked to ("Link to friend…" on Profile).
 *
 * Accepting a request makes the new friend's player and the friendship in one
 * database transaction (`friend_accept`), so both share the transaction's
 * `now()`. A friend whose player still has that time has never been linked to
 * a guest; one linked to a guest (here or on the accept card) holds the
 * guest's older player instead. `createdAt` is truncated to the millisecond
 * and `since` rounded, so they may differ by 1.
 */
export function madeAtAccept(player: { createdAt: number }, since: number) {
  return Math.abs(player.createdAt - since) <= 1;
}

/**
 * The friends a guest may be linked to: those not yet linked to a guest. Any
 * guest may be any of them, whenever either was added (user request,
 * 2026-10-26: hiding the option by date was confusing).
 */
export function linkableFriends<
  Friend extends { since: number; myPlayer: { id: string } | null },
>(
  friends: readonly Friend[],
  playersById: ReadonlyMap<string, { createdAt: number }>,
): Friend[] {
  return friends.filter((friend) => {
    const player = friend.myPlayer ? playersById.get(friend.myPlayer.id) : undefined;
    return !!player && madeAtAccept(player, friend.since);
  });
}
