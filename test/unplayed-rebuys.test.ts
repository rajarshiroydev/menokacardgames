import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  awardPots,
  buyInPlayer,
  dealNewHand,
  takeBackRebuys,
  undoLastHand,
  unplayedRebuys,
} from "../lib/poker/game.ts";
import type { GameState } from "../lib/poker/types.ts";

function game(): GameState {
  return {
    ante: 100,
    baseAnte: 100,
    blinds: null,
    blindLevel: 0,
    startStack: 10_000,
    startedAt: 1,
    players: ["Asha", "Bikram", "Chirag"].map((name) => ({
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

const money = (chips: number) => `₹${chips.toLocaleString("en-IN")}`;

/** Deals the next hand and gives its pot to Bikram. */
function playHand(state: GameState) {
  dealNewHand(state);
  assert.ok(awardPots(state, [[1]]));
}

describe("unplayed rebuys", () => {
  test("lists a rebuy made between hands until a hand they played finishes", () => {
    const state = game();
    playHand(state);
    state.players[0].stack = 0;
    assert.equal(buyInPlayer(state, 0), 10_000);
    assert.deepEqual(unplayedRebuys(state), [{ playerIndex: 0, amounts: [10_000] }]);
    // Dealt in but the hand isn't finished: still unplayed.
    dealNewHand(state);
    assert.equal(unplayedRebuys(state).length, 1);
    assert.ok(awardPots(state, [[1]]));
    assert.deepEqual(unplayedRebuys(state), []);
  });

  test("a rebuy during a hand they sit out stays unplayed when that hand ends", () => {
    const state = game();
    state.players[0].stack = 0;
    dealNewHand(state);
    assert.equal(buyInPlayer(state, 0), 10_000);
    assert.ok(awardPots(state, [[1]]));
    assert.deepEqual(unplayedRebuys(state), [{ playerIndex: 0, amounts: [10_000] }]);
  });

  test("never lists a first buy-in", () => {
    const state = game();
    dealNewHand(state);
    assert.deepEqual(unplayedRebuys(state), []);
  });

  test("undoing the hand that used a rebuy makes it unplayed again", () => {
    const state = game();
    playHand(state);
    state.players[0].stack = 0;
    buyInPlayer(state, 0);
    playHand(state);
    assert.deepEqual(unplayedRebuys(state), []);
    assert.ok(undoLastHand(state));
    assert.deepEqual(unplayedRebuys(state), [{ playerIndex: 0, amounts: [10_000] }]);
  });

  test("taking back removes the buy-in and its chips, mid-hand too", () => {
    const state = game();
    playHand(state);
    state.players[0].stack = 0;
    buyInPlayer(state, 0);
    dealNewHand(state);
    takeBackRebuys(state, [0], money);
    assert.deepEqual(state.players[0].buyIns, [10_000]);
    assert.equal(state.hand!.stacksBeforeHand[0], 0);
    assert.deepEqual(unplayedRebuys(state), []);
    assert.equal(
      state.log[0],
      "Asha takes back a buy-in of ₹10,000 when saving (no hand finished with it)",
    );
  });

  test("leaves players not chosen as they are", () => {
    const state = game();
    state.players[0].stack = 0;
    state.players[2].stack = 0;
    buyInPlayer(state, 0);
    buyInPlayer(state, 2);
    takeBackRebuys(state, [2], money);
    assert.deepEqual(state.players[0].buyIns, [10_000, 10_000]);
    assert.deepEqual(state.players[2].buyIns, [10_000]);
    assert.equal(state.players[2].stack, 0);
  });
});
