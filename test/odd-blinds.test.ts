import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  blindStatus,
  dealNewHand,
  isValidSmallBlind,
  smallBlindFor,
} from "../lib/poker/game.ts";
import {
  buildLiveSnapshot,
  deriveLiveView,
  validateLiveSnapshot,
} from "../lib/poker/live-view.ts";
import { validateSession } from "../lib/poker/session-validation.ts";
import type { GameState } from "../lib/poker/types.ts";

function oddGame(): GameState {
  return {
    ante: 100,
    baseAnte: 100,
    smallBlindRatio: { small: 40, big: 100 },
    blinds: { unit: "hands", every: 1, raiseType: "multiply", raiseBy: 2 },
    blindLevel: 0,
    blindPlans: [
      {
        effectiveHand: 1,
        effectiveAt: 1,
        baseBigBlind: 100,
        schedule: { unit: "hands", every: 1, raiseType: "multiply", raiseBy: 2 },
      },
    ],
    blindLevels: [],
    startStack: 10_000,
    startedAt: 1,
    players: ["A", "B", "C"].map((name) => ({
      name,
      stack: 10_000,
      buyIns: [10_000],
    })),
    hand: null,
    handNo: 0,
    dealerIndex: -1,
    log: [],
    _setupCount: 3,
  };
}

/** Reads the hand afresh; TypeScript keeps `null` after `game.hand = null`. */
const handOf = (game: GameState) => game.hand;

describe("odd blinds", () => {
  test("without odd blinds the small blind is still half, rounded down", () => {
    assert.equal(smallBlindFor(100), 50);
    assert.equal(smallBlindFor(125), 62);
    assert.equal(smallBlindFor(1), 0);
  });

  test("an odd small blind keeps its share as the big blind rises", () => {
    const ratio = { small: 40, big: 100 };
    assert.equal(smallBlindFor(100, ratio), 40);
    assert.equal(smallBlindFor(200, ratio), 80);
    assert.equal(smallBlindFor(400, ratio), 160);
    assert.equal(smallBlindFor(150, ratio), 60);
  });

  test("it rounds to whole rupees and stays from ₹1 up to the big blind", () => {
    assert.equal(smallBlindFor(3, { small: 1, big: 10 }), 1);
    assert.equal(smallBlindFor(7, { small: 1, big: 3 }), 2);
    assert.equal(smallBlindFor(100, { small: 100, big: 100 }), 100);
  });

  test("valid small blinds are ₹1 up to and including the big blind", () => {
    assert.equal(isValidSmallBlind(1, 100), true);
    assert.equal(isValidSmallBlind(100, 100), true);
    assert.equal(isValidSmallBlind(0, 100), false);
    assert.equal(isValidSmallBlind(101, 100), false);
    assert.equal(isValidSmallBlind(40.5, 100), false);
  });

  test("the odd small blind is posted, and the next level keeps the share", () => {
    const game = oddGame();
    dealNewHand(game, 1);
    assert.ok(game.hand);
    assert.equal(game.hand.pot, 140);
    const status = blindStatus(game, 1);
    assert.equal(status.smallBlind, 40);
    assert.equal(status.nextBigBlind, 200);
    assert.equal(status.nextSmallBlind, 80);

    game.hand = null;
    dealNewHand(game, 2);
    assert.equal(game.ante, 200);
    assert.equal(handOf(game)?.pot, 280);
    assert.match(game.log[0] ?? "", /₹80\/₹200/);
  });

  test("a saved game keeps its small blind share", () => {
    const blindHistory = {
      plans: [
        { effectiveHand: 1, effectiveAt: 1_000, baseBigBlind: 100, schedule: null },
      ],
      levels: [{ handNo: 1, dealtAt: 1_000, bigBlind: 100 }],
      smallBlindRatio: { small: 40, big: 100 },
    };
    const session = {
      id: "s1000",
      date: 1_000,
      ended: 2_000,
      ante: 100,
      startStack: 10_000,
      hands: 1,
      blindHistory,
      results: [
        { name: "A", net: 140, end: 10_140, buyIns: [10_000] },
        { name: "B", net: -140, end: 9_860, buyIns: [10_000] },
      ],
    };
    assert.deepEqual(validateSession(session).blindHistory, blindHistory);
    assert.throws(
      () =>
        validateSession({
          ...session,
          blindHistory: { ...blindHistory, smallBlindRatio: { small: 150, big: 100 } },
        }),
      /can't be bigger than the big blind/,
    );
    assert.throws(
      () =>
        validateSession({
          ...session,
          blindHistory: { ...blindHistory, smallBlindRatio: { small: 0, big: 100 } },
        }),
      /small blind/,
    );
  });

  test("the live link carries the real small blind", () => {
    const game = oddGame();
    const snapshot = buildLiveSnapshot(game);
    assert.equal(snapshot.smallBlind, 40);
    const view = deriveLiveView(validateLiveSnapshot(snapshot));
    assert.equal(view.smallBlind, 40);
    assert.throws(
      () => validateLiveSnapshot({ ...snapshot, smallBlind: 101 }),
      /can't be bigger than the big blind/,
    );
    const older = { ...snapshot };
    delete older.smallBlind;
    assert.equal(deriveLiveView(validateLiveSnapshot(older)).smallBlind, undefined);
  });
});
