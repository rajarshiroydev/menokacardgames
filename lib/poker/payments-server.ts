import { runAsAuthenticatedUser } from "./database.ts";
import {
  groupPaymentRows,
  keepList,
  type SettlementPayment,
  type VisiblePaymentRow,
} from "./payments.ts";
import type { PokerSession } from "./types";

/**
 * Server helpers for paid marks (migration 0034). Reads never fail a page:
 * without the migration, or on an error, games simply show no ticks.
 */

/** Every tick the signed-in person can see, by game (paymentGameKey). */
export async function readVisiblePayments(
  authUserId: string,
): Promise<Map<string, SettlementPayment[]>> {
  try {
    const [rows] = await runAsAuthenticatedUser(authUserId, (sql) => [
      sql`SELECT public.settlement_payments_visible() AS result`,
    ]);
    const result =
      (rows as Array<{ result: VisiblePaymentRow[] | null }>)[0]?.result ?? [];
    return groupPaymentRows(result);
  } catch (error) {
    console.error("payments read error", error);
    return new Map();
  }
}

/**
 * After the host changes a game's chip value or continues it, drops the
 * ticks whose payment Settle up no longer shows. Returns how many went, or
 * null if that failed (the ticks are then ignored until the next change).
 */
export async function keepMatchingPayments(
  authUserId: string,
  session: PokerSession,
): Promise<number | null> {
  try {
    const [rows] = await runAsAuthenticatedUser(authUserId, (sql) => [
      sql`
        SELECT public.settlement_payments_keep(
          ${session.id},
          ${JSON.stringify(keepList(session))}::jsonb
        ) AS cleared
      `,
    ]);
    return Number((rows as Array<{ cleared: number }>)[0]?.cleared ?? 0);
  } catch (error) {
    console.error("payments keep error", error);
    return null;
  }
}
