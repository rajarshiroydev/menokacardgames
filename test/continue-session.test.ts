import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  continuationError,
  gameFromSession,
} from "../lib/poker/continue-session.ts";
import { blindStatus, dealNewHand, MINUTE } from "../lib/poker/game.ts";
import type { SavedSession } from "../lib/poker/session-conflict.ts";
import type { PokerSession } from "../lib/poker/types.ts";

const START = 1720000000000;
const NOW = START + 3 * 24 * 60 * MINUTE;

const saved: SavedSession = {
  id: `s${START}`,
  name: "Friday",
  sessionNumber: 7,
  date: START,
  ended: START + 90 * MINUTE,
  ante: 100,
  startStack: 10000,
  hands: 12,
  blindHistory: {
    plans: [
      {
        effectiveHand: 1,
        effectiveAt: START,
        baseBigBlind: 100,
        schedule: { unit: "hands", every: 5, raiseType: "multiply", raiseBy: 2 },
      },
    ],
    levels: [
      { handNo: 1, dealtAt: START, bigBlind: 100 },
      { handNo: 6, dealtAt: START + 40 * MINUTE, bigBlind: 200 },
      { handNo: 11, dealtAt: START + 80 * MINUTE, bigBlind: 400 },
    ],
    smallBlindRatio: { small: 40, big: 100 },
  },
  results: [
    { playerId: "p1", name: "Raj", net: 15000, end: 35000, buyIns: [10000, 10000] },
    { playerId: "p2", name: "Sam", net: -10000, end: 0 },
    { playerId: "p3", name: "Ana", net: -5000, end: 5000 },
  ],
};

function continued(overrides: Partial<PokerSession> = {}): PokerSession {
  const session: PokerSession = structuredClone({
    ...saved,
    ended: saved.ended + 60 * MINUTE,
    hands: 14,
    results: [
      { playerId: "p1", name: "Raj", net: 10000, end: 30000, buyIns: [10000, 10000] },
      { playerId: "p2", name: "Sam", net: -15000, end: 5000, buyIns: [10000, 10000] },
      { playerId: "p3", name: "Ana", net: 5000, end: 15000 },
    ],
    ...overrides,
  });
  delete session.sessionNumber;
  return session;
}

describe("gameFromSession", () => {
  const game = gameFromSession(
    saved,
    [{ id: "p3", name: "Ana Roy" }],
    "INR",
    NOW,
    () => 0.5,
  );

  it("opens between hands with final chips, buy-ins and seats", () => {
    assert.equal(game.hand, null);
    assert.equal(game.handNo, 12);
    assert.equal(game.startedAt, START);
    assert.deepEqual(
      game.players.map((player) => [player.id, player.name, player.stack, player.buyIns]),
      [
        ["p1", "Raj", 35000, [10000, 10000]],
        ["p2", "Sam", 0, [10000]],
        ["p3", "Ana Roy", 5000, [10000]],
      ],
    );
    assert.deepEqual(game.continues, {
      id: saved.id,
      sessionNumber: 7,
      ended: saved.ended,
      hands: 12,
    });
    assert.equal(game.lastHand, null);
    assert.equal(game.sessionLabel, "Friday");
    assert.match(game.log[0], /Continued from Friday after 12 hands/);
  });

  it("resumes at the last blind level with the odd small blind", () => {
    assert.equal(game.ante, 400);
    assert.equal(game.baseAnte, 100);
    assert.equal(game.blindLevel, 2);
    assert.deepEqual(game.smallBlindRatio, { small: 40, big: 100 });
    const status = blindStatus(game, NOW);
    assert.equal(status.bigBlind, 400);
    assert.equal(status.smallBlind, 160);
  });

  it("deals the next hand number and keeps counting hand-based levels", () => {
    const next = structuredClone(game);
    dealNewHand(next, NOW);
    assert.equal(next.hand?.no, 13);
    assert.equal(next.ante, 400);
    assert.equal(next.blindPlans?.length, 1);
    // Sam has no chips, so seats 1 and 3 play; the random draw picked seat 2.
    assert.equal(next.hand?.dealerIndex, 2);
  });

  it("restarts a timed schedule's clock at the current big blind", () => {
    const timed = structuredClone(saved);
    timed.blindHistory!.plans[0].schedule = {
      unit: "minutes",
      every: 20,
      raiseType: "add",
      raiseBy: 100,
    };
    timed.blindHistory!.levels = [
      { handNo: 1, dealtAt: START, bigBlind: 100 },
      { handNo: 5, dealtAt: START + 25 * MINUTE, bigBlind: 200 },
    ];
    const resumed = gameFromSession(timed, [], "INR", NOW);
    assert.equal(resumed.blindLevel, 1);
    assert.deepEqual(resumed.blindPlans?.at(-1), {
      effectiveHand: 13,
      effectiveAt: NOW,
      baseBigBlind: 200,
      schedule: { unit: "minutes", every: 20, raiseType: "add", raiseBy: 100 },
    });
    dealNewHand(resumed, NOW + 5 * MINUTE);
    assert.equal(resumed.ante, 200);
    dealNewHand(resumed, NOW + 21 * MINUTE);
    assert.equal(resumed.ante, 300);
  });

  it("treats games saved without blind history as fixed blinds", () => {
    const legacy = structuredClone(saved);
    delete legacy.blindHistory;
    const resumed = gameFromSession(legacy, [], "INR", NOW);
    assert.equal(resumed.ante, 100);
    assert.equal(resumed.blinds, null);
    assert.equal(resumed.blindLevels?.length, 1);
  });
});

describe("continuationError", () => {
  it("accepts the same game played on", () => {
    assert.equal(continuationError(saved, continued()), null);
  });

  it("accepts new blind levels after the saved ones", () => {
    const next = continued();
    next.blindHistory!.levels.push({
      handNo: 14,
      dealtAt: saved.ended + 50 * MINUTE,
      bigBlind: 800,
    });
    assert.equal(continuationError(saved, next), null);
  });

  it("refuses a different start, stack or big blind", () => {
    assert.ok(continuationError(saved, continued({ date: START + 1 })));
    assert.ok(continuationError(saved, continued({ startStack: 20000 })));
    assert.ok(continuationError(saved, continued({ ante: 200 })));
  });

  it("refuses when no hands were added", () => {
    assert.equal(
      continuationError(saved, continued({ hands: 12 })),
      "No new hands to save",
    );
  });

  it("refuses an earlier end time", () => {
    assert.ok(continuationError(saved, continued({ ended: saved.ended })));
  });

  it("refuses changed seats or players", () => {
    const swapped = continued();
    swapped.results.reverse();
    assert.ok(continuationError(saved, swapped));
    const fewer = continued();
    fewer.results.pop();
    assert.ok(continuationError(saved, fewer));
  });

  it("refuses dropped buy-ins", () => {
    const next = continued();
    next.results[0].buyIns = [10000];
    assert.ok(continuationError(saved, next));
  });

  it("refuses rewritten blinds", () => {
    const next = continued();
    next.blindHistory!.levels[1].bigBlind = 300;
    assert.ok(continuationError(saved, next));
    const dropped = continued();
    delete dropped.blindHistory;
    assert.ok(continuationError(saved, dropped));
  });
});
