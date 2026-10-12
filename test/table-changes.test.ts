import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  canJoinGame,
  cashOutPlayer,
  dealablePlayerCount,
  dealNewHand,
  joinGame,
  MAX_GAME_PLAYERS,
  nextBuyIn,
  returnToTable,
} from "../lib/poker/game.ts";
import type { GameState } from "../lib/poker/types.ts";

/** A game between hands after hand 3, with B on the button. */
function betweenHands(): GameState {
  return {
    currency: "INR",
    ante: 100,
    baseAnte: 100,
    blinds: null,
    blindLevel: 0,
    startStack: 10_000,
    startedAt: 1,
    players: [
      { id: "a", name: "Asha", stack: 12_000, buyIns: [10_000] },
      { id: "b", name: "Bikram", stack: 8_000, buyIns: [10_000] },
      { id: "c", name: "Chitra", stack: 10_000, buyIns: [10_000] },
    ],
    hand: null,
    handNo: 3,
    dealerIndex: 1,
    log: [],
    lastHand: { stacksBefore: [10_000, 10_000, 10_000] },
    _setupCount: 3,
  };
}

describe("late join", () => {
  it("seats the player for the starting stack and deals them in next", () => {
    const game = betweenHands();
    assert.equal(joinGame(game, { id: "d", name: "Dev" }, 3), true);
    assert.deepEqual(game.players[3], {
      id: "d",
      name: "Dev",
      stack: 10_000,
      buyIns: [10_000],
    });
    assert.equal(game.log[0], "Before hand 4: Dev joins and buys in for ₹10,000");
    assert.equal(game.lastHand, null);
    dealNewHand(game, 2);
    assert.equal(game.hand?.in[3], true);
    // The button moves on from Bikram as it would have.
    assert.equal(game.hand?.dealerIndex, 2);
  });

  it("keeps the button with the same player when seated before it", () => {
    const game = betweenHands();
    joinGame(game, { id: "d", name: "Dev" }, 0);
    assert.equal(game.players[2].name, "Bikram");
    assert.equal(game.dealerIndex, 2);
    dealNewHand(game, 2);
    assert.equal(game.players[game.hand!.dealerIndex].name, "Chitra");
  });

  it("deals the button next when seated right after it", () => {
    const game = betweenHands();
    joinGame(game, { id: "d", name: "Dev" }, 2);
    dealNewHand(game, 2);
    assert.equal(game.players[game.hand!.dealerIndex].name, "Dev");
  });

  it("refuses during a hand, twice, by name, a bad seat or a full game", () => {
    const game = betweenHands();
    assert.equal(canJoinGame(game, { id: "a", name: "Someone" }), false);
    assert.equal(canJoinGame(game, { name: " asha " }), false);
    assert.equal(joinGame(game, { id: "d", name: "Dev" }, 5), false);
    assert.equal(joinGame(game, { id: "d", name: "Dev" }, -1), false);
    assert.equal(game.players.length, 3);

    const full = betweenHands();
    for (let index = full.players.length; index < MAX_GAME_PLAYERS; index += 1) {
      assert.equal(joinGame(full, { id: `p${index}`, name: `P${index}` }, index), true);
    }
    assert.equal(canJoinGame(full, { id: "x", name: "X" }), false);

    const playing = betweenHands();
    dealNewHand(playing, 2);
    assert.equal(joinGame(playing, { id: "d", name: "Dev" }, 3), false);
  });

  it("counts players who left towards the limit", () => {
    const game = betweenHands();
    for (let index = 3; index < MAX_GAME_PLAYERS; index += 1) {
      joinGame(game, { id: `p${index}`, name: `P${index}` }, index);
    }
    cashOutPlayer(game, 0);
    assert.equal(canJoinGame(game, { id: "x", name: "X" }), false);
  });
});

describe("cash out", () => {
  it("keeps the player's chips as their result and stops dealing them in", () => {
    const game = betweenHands();
    assert.equal(cashOutPlayer(game, 0), true);
    assert.equal(game.players[0].left, true);
    assert.equal(game.players[0].stack, 12_000);
    assert.equal(game.log[0], "Before hand 4: Asha cashes out with ₹12,000");
    assert.equal(game.lastHand, null);
    assert.equal(dealablePlayerCount(game), 2);
    dealNewHand(game, 2);
    assert.equal(game.hand?.in[0], false);
    assert.equal(game.hand?.smallBlindIndex, 2);
  });

  it("leaves too few to deal when only one player is still seated", () => {
    const game = betweenHands();
    cashOutPlayer(game, 0);
    cashOutPlayer(game, 1);
    assert.equal(dealablePlayerCount(game), 1);
    dealNewHand(game, 2);
    assert.equal(game.hand, null);
  });

  it("offers no buy-in to a busted player who left", () => {
    const game = betweenHands();
    game.players[1].stack = 0;
    assert.equal(nextBuyIn(game, 1), 10_000);
    cashOutPlayer(game, 1);
    assert.equal(nextBuyIn(game, 1), null);
  });

  it("refuses during a hand or for a player already gone", () => {
    const game = betweenHands();
    cashOutPlayer(game, 0);
    assert.equal(cashOutPlayer(game, 0), false);
    assert.equal(cashOutPlayer(game, 9), false);
    const playing = betweenHands();
    dealNewHand(playing, 2);
    assert.equal(cashOutPlayer(playing, 0), false);
  });

  it("lets the player return with the chips they left with", () => {
    const game = betweenHands();
    cashOutPlayer(game, 0);
    assert.equal(returnToTable(game, 0), true);
    assert.equal(game.players[0].left, undefined);
    assert.equal(game.players[0].stack, 12_000);
    assert.equal(
      game.log[0],
      "Before hand 4: Asha returns to the table with ₹12,000",
    );
    assert.equal(returnToTable(game, 0), false);
    dealNewHand(game, 2);
    assert.equal(game.hand?.in[0], true);
  });
});
