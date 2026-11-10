import {
  HOUSE_KEY,
  type Settlement,
  type SettlementTransfer,
  settleSession,
} from "./settle-up.ts";
import type { PokerSession } from "./types";

/**
 * Settle up payments marked as paid (plan entry "track who has paid (plan)";
 * migration 0034). Like Splitwise, the host and every friend who played in
 * the game may tick or untick any payment in it. A tick names the payment by
 * its keys and amount; one whose payment Settle up no longer shows (the chip
 * value changed, or the game was continued) is ignored and later cleared.
 */

/** A ticked payment, as the phone gets it. */
export type SettlementPayment = {
  from: string;
  to: string;
  cents: number;
  /** When it was ticked (ms). */
  paidAt: number;
  /** The name of the account that ticked it; null once that account is gone. */
  markedBy: string | null;
  /** Ticked by the person looking. */
  markedByMe?: true;
};

/** A row of settlement_payments_visible(). */
export type VisiblePaymentRow = {
  hostAccountId: string;
  sessionId: string;
  from: string;
  to: string;
  cents: number | string;
  paidAt: number | string;
  markedBy: string | null;
  markedByGone: boolean;
  markedByMe: boolean;
};

const KEY = /^([0-9]|house|bank)$/;

export function isPaymentKey(value: unknown): value is string {
  return typeof value === "string" && KEY.test(value);
}

/** Where a game's ticks are filed: the host and the game's ID. */
export function paymentGameKey(hostAccountId: string, sessionId: string) {
  return `${hostAccountId}\u0000${sessionId}`;
}

/** The visible ticks, grouped by game, as the phone gets them. */
export function groupPaymentRows(rows: VisiblePaymentRow[]) {
  const games = new Map<string, SettlementPayment[]>();
  for (const row of rows) {
    const key = paymentGameKey(row.hostAccountId, row.sessionId);
    const list = games.get(key) ?? [];
    list.push({
      from: row.from,
      to: row.to,
      cents: Number(row.cents),
      paidAt: Number(row.paidAt),
      markedBy: row.markedByGone ? null : (row.markedBy ?? "Someone"),
      ...(row.markedByMe ? { markedByMe: true as const } : {}),
    });
    games.set(key, list);
  }
  return games;
}

/** The game's settlement, or null when its chips don't add up. */
export function settlementOf(session: PokerSession): Settlement | null {
  try {
    return settleSession(session);
  } catch {
    return null;
  }
}

/** The tick for this payment, if it was ticked at this amount. */
export function paymentFor(
  transfer: SettlementTransfer,
  payments: readonly SettlementPayment[] | undefined,
) {
  return payments?.find(
    (payment) =>
      payment.from === transfer.fromKey &&
      payment.to === transfer.toKey &&
      payment.cents === transfer.cents,
  );
}

export type PaymentLine = {
  transfer: SettlementTransfer;
  paid?: SettlementPayment;
};

/** Settle up's payments with their ticks; empty when nobody owes anything. */
export function paymentLines(
  session: PokerSession,
  settlement: Settlement | null = settlementOf(session),
): PaymentLine[] {
  return (settlement?.transfers ?? []).map((transfer) => {
    const paid = paymentFor(transfer, session.payments);
    return paid ? { transfer, paid } : { transfer };
  });
}

/** "2 of 3 paid", "All paid", or null when nobody owes anything. */
export function paidSummary(session: PokerSession) {
  const lines = paymentLines(session);
  if (!lines.length) return null;
  const paid = lines.filter((line) => line.paid).length;
  return { paid, total: lines.length, done: paid === lines.length };
}

/** What a tick must match to stay: every payment Settle up shows now. */
export function keepList(session: PokerSession) {
  return (settlementOf(session)?.transfers ?? []).map((transfer) => ({
    from: transfer.fromKey,
    to: transfer.toKey,
    cents: transfer.cents,
  }));
}

/** How many of the game's ticks a new chip value would clear. */
export function ticksClearedBy(session: PokerSession, next: PokerSession) {
  const keep = keepList(next);
  return (session.payments ?? []).filter(
    (payment) =>
      !keep.some(
        (item) =>
          item.from === payment.from &&
          item.to === payment.to &&
          item.cents === payment.cents,
      ),
  ).length;
}

export type PaymentRequest = {
  /** The friend who hosted it; absent for your own game. */
  hostAccountId?: string;
  /** Your own game's ID. */
  sessionId?: string;
  /** A friend's game, found by its start time as the phone knows it. */
  date?: number;
  from: string;
  to: string;
  cents: number;
  paid: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION_ID = /^[A-Za-z0-9._:-]{1,100}$/;

/** Checks a tick or untick sent by the phone. Throws with a reason. */
export function parsePaymentRequest(input: unknown): PaymentRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid payment");
  }
  const body = input as Record<string, unknown>;
  if (!isPaymentKey(body.from) || !isPaymentKey(body.to) || body.from === body.to) {
    throw new Error("Invalid payment");
  }
  if (
    typeof body.cents !== "number" ||
    !Number.isSafeInteger(body.cents) ||
    body.cents < 1
  ) {
    throw new Error("Invalid payment amount");
  }
  if (typeof body.paid !== "boolean") throw new Error("Invalid payment");
  const base = { from: body.from, to: body.to, cents: body.cents, paid: body.paid };
  if (body.hostAccountId === undefined) {
    if (typeof body.sessionId !== "string" || !SESSION_ID.test(body.sessionId)) {
      throw new Error("Invalid session id");
    }
    return { ...base, sessionId: body.sessionId };
  }
  if (typeof body.hostAccountId !== "string" || !UUID.test(body.hostAccountId)) {
    throw new Error("Invalid host");
  }
  if (
    typeof body.date !== "number" ||
    !Number.isSafeInteger(body.date) ||
    body.date < 1
  ) {
    throw new Error("Invalid game");
  }
  return { ...base, hostAccountId: body.hostAccountId, date: body.date };
}

/** The most payments Mark all paid sends at once. */
export const MAX_PAYMENT_BATCH = 500;

/**
 * Checks a list of ticks and unticks (Mark all paid, Settle up's Save): at
 * most MAX_PAYMENT_BATCH, each payment once.
 */
export function parsePaymentBatch(input: unknown): PaymentRequest[] {
  if (
    !Array.isArray(input) ||
    input.length < 1 ||
    input.length > MAX_PAYMENT_BATCH
  ) {
    throw new Error(`Mark 1 to ${MAX_PAYMENT_BATCH} payments at a time`);
  }
  const requests = input.map(parsePaymentRequest);
  const seen = new Set<string>();
  for (const request of requests) {
    const key = [
      request.hostAccountId ?? "",
      request.sessionId ?? request.date,
      request.from,
      request.to,
    ].join(":");
    if (seen.has(key)) throw new Error("A payment is in the list twice");
    seen.add(key);
  }
  return requests;
}

/** Whether the request names a payment this game's Settle up shows now. */
export function requestMatches(session: PokerSession, request: PaymentRequest) {
  return keepList(session).some(
    (item) =>
      item.from === request.from &&
      item.to === request.to &&
      item.cents === request.cents,
  );
}

export { HOUSE_KEY };
