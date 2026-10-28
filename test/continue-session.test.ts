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
    assert.equal(game.log.length, 1);
  });

  it("carries the saved action log on under the continued line", () => {
    const lines = ["Hand 12: Raj wins ₹400", "Hand 12 RIVER: Sam folds"];
    const continued = gameFromSession(
      { ...saved, actionLog: { players: [{ id: "p1", name: "Raj" }], lines } },
      [],
      "INR",
      NOW,
      () => 0.5,
    );
    assert.match(continued.log[0], /Continued from Friday/);
    assert.deepEqual(continued.log.slice(1), lines);
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

describe("chosen buy-in amounts", () => {
  it("stay allowed when the saved game has amounts other than the stack", () => {
    const fixed = gameFromSession(saved, [], "INR", NOW, () => 0);
    assert.equal(fixed.customBuyIns, undefined);
    const mixed: SavedSession = structuredClone(saved);
    mixed.results[2] = { playerId: "p3", name: "Ana", net: 0, end: 5000, buyIns: [5000] };
    mixed.results[0] = { ...mixed.results[0], net: 10000, end: 30000 };
    assert.equal(gameFromSession(mixed, [], "INR", NOW, () => 0).customBuyIns, true);
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

  it("refuses a game that drops a saved player", () => {
    const fewer = continued();
    fewer.results.pop();
    assert.equal(
      continuationError(saved, fewer),
      "The continued game must keep every saved player",
    );
    const replaced = continued();
    replaced.results[2] = { ...replaced.results[2], playerId: "p9" };
    assert.ok(continuationError(saved, replaced));
    const unknown = continued();
    delete unknown.results[2].playerId;
    assert.ok(continuationError(saved, unknown));
  });

  it("accepts players who joined late, wherever they sit", () => {
    const joined = continued();
    // Joined in seat 2 for the starting stack and is up 2,000; Raj paid it.
    joined.results.splice(1, 0, {
      playerId: "p4",
      name: "Dev",
      net: 2000,
      end: 12000,
    });
    joined.results[0] = { ...joined.results[0], net: 8000, end: 28000 };
    assert.equal(continuationError(saved, joined), null);
    const swapped = continued();
    swapped.results.reverse();
    assert.equal(continuationError(saved, swapped), null);
  });

  it("refuses a player listed twice", () => {
    const twice = continued();
    twice.results.push({ ...twice.results[2] });
    assert.ok(continuationError(saved, twice));
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

  it("keeps the ante and rake rules, and never less rake", () => {
    const rakedSaved: SavedSession = {
      ...structuredClone(saved),
      bigBlindAnte: true,
      rakeRules: { percent: 5, cap: 500 },
      rake: 400,
    };
    const next = (overrides: Partial<PokerSession> = {}) =>
      continued({
        bigBlindAnte: true,
        rakeRules: { percent: 5, cap: 500 },
        rake: 600,
        ...overrides,
      });
    assert.equal(continuationError(rakedSaved, next()), null);
    assert.ok(continuationError(rakedSaved, next({ bigBlindAnte: undefined })));
    assert.ok(continuationError(rakedSaved, next({ rakeRules: { percent: 3, cap: 500 } })));
    assert.equal(
      continuationError(rakedSaved, next({ rake: 300 })),
      "The continued game must keep the rake already taken",
    );
    const game = gameFromSession(rakedSaved, [], "INR", NOW, () => 0);
    assert.equal(game.bigBlindAnte, true);
    assert.deepEqual(game.rakeRules, { percent: 5, cap: 500 });
    assert.equal(game.rake, 400);
  });

  it("matches rules that come back from the database in another key order", () => {
    // jsonb returns {"big","small"} and {"cap","percent"}; the phone sends
    // {small, big} and {percent, cap}.
    const fromDatabase: SavedSession = {
      ...structuredClone(saved),
      blindHistory: {
        ...structuredClone(saved.blindHistory!),
        smallBlindRatio: { big: 100, small: 40 },
      },
      rakeRules: { cap: 500, percent: 5 },
      rake: 400,
    };
    assert.equal(
      continuationError(
        fromDatabase,
        continued({ rakeRules: { percent: 5, cap: 500 }, rake: 400 }),
      ),
      null,
    );
  });
});
