import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  passwordMatches,
  validateSession,
} from "../lib/poker/session-validation.ts";

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

  test("rejects unsafe or incomplete session data", () => {
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

  test("compares deletion passwords exactly", () => {
    assert.equal(passwordMatches("correct horse", "correct horse"), true);
    assert.equal(passwordMatches("correct horse!", "correct horse"), false);
    assert.equal(passwordMatches("", "correct horse"), false);
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
});
