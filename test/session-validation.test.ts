import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { validateSession } from "../lib/poker/session-validation.ts";

const validSession = {
  id: "s1720000000000",
  date: 1720000000000,
  ended: 1720000300000,
  ante: 100,
  startStack: 10000,
  hands: 4,
  results: [
    { name: "Raj", net: 500, end: 10500 },
    { name: "Sam", net: -500, end: 9500 },
  ],
};

describe("session validation", () => {
  test("validates and normalizes a finished session", () => {
    assert.deepEqual(validateSession(validSession), validSession);
  });

  test("keeps an optional trimmed game name", () => {
    assert.deepEqual(
      validateSession({ ...validSession, name: "  Sunday Night  " }),
      { ...validSession, name: "Sunday Night" },
    );
    assert.deepEqual(
      validateSession({ ...validSession, name: "   " }),
      validSession,
    );
    assert.throws(
      () => validateSession({ ...validSession, name: "x".repeat(81) }),
      /80 characters or fewer/,
    );
  });

  test("rejects unsafe or incomplete session data", () => {
    assert.throws(
      () =>
        validateSession({
          ...validSession,
          startStack: 0,
          results: [
            { name: "Raj", net: 0, end: 0 },
            { name: "Sam", net: 0, end: 0 },
          ],
        }),
      /starting stack must be a valid whole number/,
    );
    assert.throws(
      () => validateSession({ ...validSession, hands: 0 }),
      /hands must be a valid whole number/,
    );
    assert.throws(
      () =>
        validateSession({
          ...validSession,
          results: validSession.results.slice(0, 1),
        }),
      /2 to 10/,
    );
    assert.throws(
      () =>
        validateSession({
          ...validSession,
          id: "../bad",
        }),
      /Invalid session id/,
    );
  });

  test("keeps a valid stable player id", () => {
    const session = validateSession({
      ...validSession,
      results: validSession.results.map((result, index) => ({
        ...result,
        playerId: `player-${index + 1}`,
      })),
    });

    assert.equal(session.results[0].playerId, "player-1");
  });

  test("accepts full-stack rebuys, alone or after older halved rebuys", () => {
    const full = [
      { name: "Raj", net: -15000, end: 15000, buyIns: [10000, 10000, 10000] },
      { name: "Sam", net: 15000, end: 25000 },
    ];
    assert.deepEqual(
      validateSession({ ...validSession, results: full }).results,
      full,
    );

    const crossover = [
      { name: "Raj", net: -15000, end: 10000, buyIns: [10000, 5000, 10000] },
      { name: "Sam", net: 15000, end: 25000 },
    ];
    assert.deepEqual(
      validateSession({ ...validSession, results: crossover }).results,
      crossover,
    );

    assert.throws(
      () => validateSession({
        ...validSession,
        results: [
          { name: "Raj", net: -12000, end: 5000, buyIns: [10000, 7000] },
          { name: "Sam", net: 12000, end: 22000 },
        ],
      }),
      /Invalid buy-in sequence/,
    );
  });

  test("keeps halved buy-ins and checks net against total invested", () => {
    const results = [
      { name: "Raj", net: -2500, end: 15000, buyIns: [10000, 5000, 2500] },
      { name: "Sam", net: 2500, end: 12500 },
    ];
    assert.deepEqual(
      validateSession({ ...validSession, results }).results,
      results,
    );
    assert.throws(
      () => validateSession({
        ...validSession,
        results: [{ ...results[0], buyIns: [10000, 6000] }, results[1]],
      }),
      /Invalid buy-in sequence/,
    );
    assert.throws(
      () => validateSession({
        ...validSession,
        results: [{ ...results[0], net: 0 }, results[1]],
      }),
      /Buy-ins do not match the net result/,
    );
  });

  test("keeps the blind plan and levels used in a finished session", () => {
    const blindHistory = {
      plans: [
        {
          effectiveHand: 1,
          effectiveAt: validSession.date,
          baseBigBlind: 100,
          schedule: { unit: "hands", every: 2, raiseType: "add", raiseBy: 50 },
        },
        {
          effectiveHand: 4,
          effectiveAt: validSession.date + 1000,
          baseBigBlind: 150,
          schedule: null,
        },
      ],
      levels: [
        { handNo: 1, dealtAt: validSession.date, bigBlind: 100 },
        { handNo: 3, dealtAt: validSession.date + 500, bigBlind: 150 },
      ],
    };
    assert.deepEqual(
      validateSession({ ...validSession, blindHistory }).blindHistory,
      blindHistory,
    );
    assert.throws(
      () => validateSession({
        ...validSession,
        blindHistory: { ...blindHistory, levels: [
          { handNo: 1, dealtAt: validSession.date, bigBlind: 999 },
        ] },
      }),
      /Invalid blind history order/,
    );
  });
});
