import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveSessionAccounting } from "../lib/poker/accounting.ts";

describe("session accounting", () => {
  it("derives the initial investment when there are no rebuys", () => {
    const accounting = deriveSessionAccounting({
      startStack: 10_000,
      results: [
        { playerId: "one", name: "One", net: 2_000, end: 12_000 },
        { playerId: "two", name: "Two", net: -2_000, end: 8_000 },
      ],
    });

    assert.equal(accounting.totalInvested, 20_000);
    assert.equal(accounting.totalEnding, 20_000);
    assert.deepEqual(accounting.results[0].buyIns, [10_000]);
  });

  it("derives investment from the complete rebuy sequence", () => {
    const accounting = deriveSessionAccounting({
      startStack: 10_000,
      results: [
        {
          playerId: "one",
          name: "One",
          net: -2_500,
          end: 15_000,
          buyIns: [10_000, 5_000, 2_500],
        },
        { playerId: "two", name: "Two", net: 2_500, end: 12_500 },
        { playerId: "three", name: "Three", net: 0, end: 10_000 },
      ],
    });

    assert.equal(accounting.results[0].invested, 17_500);
    assert.equal(accounting.totalInvested, 37_500);
  });

  it("rejects duplicate participants and unbalanced chips", () => {
    assert.throws(
      () => deriveSessionAccounting({
        startStack: 1_000,
        results: [
          { playerId: "same", name: "One", net: 0, end: 1_000 },
          { playerId: "same", name: "One", net: 0, end: 1_000 },
        ],
      }),
      /Duplicate player result/,
    );
    assert.throws(
      () => deriveSessionAccounting({
        startStack: 1_000,
        results: [
          { playerId: "one", name: "One", net: 100, end: 1_100 },
          { playerId: "two", name: "Two", net: -50, end: 950 },
        ],
      }),
      /balance/,
    );
  });

  it("rejects a result whose net does not match investment", () => {
    assert.throws(
      () => deriveSessionAccounting({
        startStack: 1_000,
        results: [
          { playerId: "one", name: "One", net: 0, end: 1_100 },
          { playerId: "two", name: "Two", net: 0, end: 900 },
        ],
      }),
      /Investment does not match/,
    );
  });

  it("rejects totals outside JavaScript's exact integer range", () => {
    const amount = Number.MAX_SAFE_INTEGER;
    assert.throws(
      () => deriveSessionAccounting({
        startStack: amount,
        results: [
          { playerId: "one", name: "One", net: 0, end: amount },
          { playerId: "two", name: "Two", net: 0, end: amount },
        ],
      }),
      /supported chip range/,
    );
  });
});
