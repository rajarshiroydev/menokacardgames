/** Initial buy-in plus rebuys a player can have in one session. */
export const MAX_BUY_INS = 64;

/**
 * A rebuy is the full starting stack. Before 24 September 2026 a rebuy was
 * half the previous buy-in, rounded down; saved games, old backups and games
 * already in progress can still contain those amounts, so both are accepted.
 */
export function isValidRebuy(
  amount: number,
  previous: number,
  startStack: number,
) {
  return (
    amount > 0 &&
    (amount === startStack || amount === Math.floor(previous / 2))
  );
}
