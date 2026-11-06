import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  groupPaymentRows,
  keepList,
  MAX_PAYMENT_BATCH,
  paidSummary,
  parsePaymentBatch,
  parsePaymentRequest,
  paymentGameKey,
  paymentLines,
  requestMatches,
  ticksClearedBy,
  type SettlementPayment,
} from "../lib/poker/payments.ts";
import type { PokerSession } from "../lib/poker/types.ts";

/** Asha +12,000, Arjun +3,000, Bikram −10,000, Dev −5,000 chips. */
function game(payments?: SettlementPayment[], rake = 0): PokerSession {
  const nets = [12_000, 3_000, -10_000, -5_000 - rake];
  return {
    id: "s1",
    name: "Game 7",
    date: 1_760_000_000_000,
    ended: 1_760_000_600_000,
    ante: 100,
    startStack: 10_000,
    hands: 10,
    ...(rake ? { rake } : {}),
    results: ["Asha", "Arjun", "Bikram", "Dev"].map((name, index) => ({
      playerId: `p${index}`,
      name,
      net: nets[index],
      end: 10_000 + nets[index],
    })),
    ...(payments ? { payments } : {}),
  };
}

function tick(from: string, to: string, cents: number): SettlementPayment {
  return { from, to, cents, paidAt: 1, markedBy: "Asha" };
}

describe("paid marks", () => {
  it("keys each payment by places in the results", () => {
    assert.deepEqual(keepList(game()), [
      { from: "2", to: "0", cents: 1_000_000 },
      { from: "3", to: "1", cents: 300_000 },
      { from: "3", to: "0", cents: 200_000 },
    ]);
  });

  it("keys the house's rake as house", () => {
    const keys = keepList(game(undefined, 500)).map((item) => item.to);
    assert.ok(keys.includes("house"));
  });

  it("counts the ticked payments, only at their amount", () => {
    assert.deepEqual(paidSummary(game()), { paid: 0, total: 3, done: false });
    const one = game([tick("2", "0", 1_000_000), tick("3", "0", 999)]);
    assert.deepEqual(paidSummary(one), { paid: 1, total: 3, done: false });
    assert.equal(paymentLines(one)[0].paid?.markedBy, "Asha");
    const all = game([
      tick("2", "0", 1_000_000),
      tick("3", "0", 200_000),
      tick("3", "1", 300_000),
    ]);
    assert.deepEqual(paidSummary(all), { paid: 3, total: 3, done: true });
  });

  it("shows nothing for a game where nobody owes anything", () => {
    const even = game();
    even.results = even.results.map((result) => ({ ...result, net: 0, end: 10_000 }));
    assert.equal(paidSummary(even), null);
  });

  it("says how many ticks a new chip value clears", () => {
    const ticked = game([tick("2", "0", 1_000_000), tick("3", "1", 300_000)]);
    assert.equal(ticksClearedBy(ticked, ticked), 0);
    assert.equal(
      ticksClearedBy(ticked, { ...ticked, chipValue: { chips: 10_000, cents: 50_000 } }),
      2,
    );
  });

  it("accepts only payments Settle up shows now", () => {
    const own = parsePaymentRequest({
      sessionId: "s1",
      from: "2",
      to: "0",
      cents: 1_000_000,
      paid: true,
    });
    assert.equal(requestMatches(game(), own), true);
    assert.equal(requestMatches(game(), { ...own, cents: 999 }), false);
    assert.equal(requestMatches(game(), { ...own, from: "1" }), false);
  });

  it("checks what the phone sends", () => {
    const friend = parsePaymentRequest({
      hostAccountId: "8c3f8a4e-1b2c-4d5e-8f90-123456789abc",
      date: 1_760_000_000_000,
      from: "house",
      to: "0",
      cents: 5,
      paid: false,
    });
    assert.equal(friend.sessionId, undefined);
    const bad: unknown[] = [
      null,
      { sessionId: "s1", from: "2", to: "2", cents: 5, paid: true },
      { sessionId: "s1", from: "10", to: "0", cents: 5, paid: true },
      { sessionId: "s1", from: "2", to: "0", cents: 0, paid: true },
      { sessionId: "s1", from: "2", to: "0", cents: 5, paid: "yes" },
      { sessionId: "bad id!", from: "2", to: "0", cents: 5, paid: true },
      { hostAccountId: "not-a-uuid", date: 1, from: "2", to: "0", cents: 5, paid: true },
      { hostAccountId: "8c3f8a4e-1b2c-4d5e-8f90-123456789abc", from: "2", to: "0", cents: 5, paid: true },
    ];
    for (const input of bad) {
      assert.throws(() => parsePaymentRequest(input), Error, JSON.stringify(input));
    }
  });

  it("takes a list of ticks and unticks, each payment once, within the limit", () => {
    const item = { sessionId: "s1", from: "2", to: "0", cents: 5, paid: true };
    const other = { ...item, from: "3", paid: false };
    assert.equal(parsePaymentBatch([item, other]).length, 2);
    assert.throws(() => parsePaymentBatch([]));
    assert.throws(() => parsePaymentBatch([item, { ...item, paid: false }]));
    assert.throws(() =>
      parsePaymentBatch(Array.from({ length: MAX_PAYMENT_BATCH + 1 }, () => item)),
    );
  });

  it("files the visible ticks by game, naming who marked them", () => {
    const games = groupPaymentRows([
      {
        hostAccountId: "h1",
        sessionId: "s1",
        from: "2",
        to: "0",
        cents: "1000000",
        paidAt: "5",
        markedBy: "Bikram",
        markedByGone: false,
        markedByMe: true,
      },
      {
        hostAccountId: "h1",
        sessionId: "s1",
        from: "3",
        to: "0",
        cents: 200_000,
        paidAt: 6,
        markedBy: null,
        markedByGone: true,
        markedByMe: false,
      },
    ]);
    assert.deepEqual(games.get(paymentGameKey("h1", "s1")), [
      { from: "2", to: "0", cents: 1_000_000, paidAt: 5, markedBy: "Bikram", markedByMe: true },
      { from: "3", to: "0", cents: 200_000, paidAt: 6, markedBy: null },
    ]);
  });
});
