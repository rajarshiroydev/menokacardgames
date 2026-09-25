import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isSameSession,
  type SavedSession,
} from "../lib/poker/session-conflict.ts";
import type { PokerSession } from "../lib/poker/types.ts";

const saved: SavedSession = {
  id: "s1720000000000",
  name: "Game 7",
  sessionNumber: 7,
  date: 1720000000000,
  ended: 1720000300000,
  ante: 100,
  startStack: 10000,
  hands: 4,
  blindHistory: {
    plans: [
      {
        effectiveHand: 1,
        effectiveAt: 1720000000000,
        baseBigBlind: 100,
        schedule: { unit: "hands", every: 2, raiseType: "multiply", raiseBy: 1.5 },
      },
    ],
    levels: [{ handNo: 1, dealtAt: 1720000000000, bigBlind: 100 }],
  },
  results: [
    { playerId: "p1", name: "Raj", net: 5500, end: 20500, buyIns: [10000, 5000] },
    { playerId: "p2", name: "Sam", net: -5500, end: 4500 },
  ],
};

function retry(overrides: Partial<PokerSession> = {}): PokerSession {
  const session: PokerSession = structuredClone({ ...saved, ...overrides });
  delete session.sessionNumber;
  if (!("name" in overrides)) delete session.name;
  return session;
}

describe("idempotent session retries", () => {
  it("matches an identical retry of an unnamed game", () => {
    assert.equal(isSameSession(saved, retry()), true);
  });

  it("matches a re-imported export that carries the default name", () => {
    assert.equal(isSameSession(saved, retry({ name: "Game 7" })), true);
  });

  it("treats an explicit single buy-in as the default buy-in", () => {
    const session = retry();
    session.results[1] = { ...session.results[1], buyIns: [10000] };
    assert.equal(isSameSession(saved, session), true);
  });

  it("ignores player display names and blind-history key order", () => {
    const session = retry();
    session.results[0] = { ...session.results[0], name: "RAJ" };
    session.blindHistory = {
      levels: [{ bigBlind: 100, dealtAt: 1720000000000, handNo: 1 }],
      plans: saved.blindHistory!.plans,
    };
    assert.equal(isSameSession(saved, session), true);
  });

  it("detects a changed result, player, timing or name", () => {
    const changedEnd = retry();
    changedEnd.results[0] = { ...changedEnd.results[0], end: 20600, net: 5600 };
    const changedPlayer = retry();
    changedPlayer.results[1] = { ...changedPlayer.results[1], playerId: "p3" };
    const changedBuyIns = retry();
    changedBuyIns.results[0] = {
      ...changedBuyIns.results[0],
      buyIns: [10000],
      net: 10500,
    };

    assert.equal(isSameSession(saved, changedEnd), false);
    assert.equal(isSameSession(saved, changedPlayer), false);
    assert.equal(isSameSession(saved, changedBuyIns), false);
    assert.equal(isSameSession(saved, retry({ hands: 5 })), false);
    assert.equal(isSameSession(saved, retry({ ended: saved.ended + 1 })), false);
    assert.equal(isSameSession(saved, retry({ name: "Sunday" })), false);
    assert.equal(isSameSession(saved, retry({ blindHistory: undefined })), false);
  });

  it("detects a reordered seating", () => {
    const session = retry();
    session.results.reverse();
    assert.equal(isSameSession(saved, session), false);
  });
});
