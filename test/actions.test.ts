import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  awardPot,
  playerAction,
  splitPotBetween,
  undoPlayerAction,
} from "../lib/poker/actions.ts";
import { dealNewHand, dealNextStreet } from "../lib/poker/game.ts";
import type { GameState, Hand } from "../lib/poker/types.ts";

// The table's actions as the app plays them (lib/poker/actions.ts). Three
// players with 100,000 each and a 50/100 blind: A deals the first hand, B
// posts 50, C posts 100, and A acts first.

const money = (value: number) => `$${value}`;

function newHand(stacks = [100_000, 100_000, 100_000]): GameState {
  const game: GameState = {
    ante: 100,
    baseAnte: 100,
    blinds: null,
    blindLevel: 0,
    startStack: 100_000,
    startedAt: 1,
    players: stacks.map((stack, index) => ({ name: "ABC"[index], stack })),
    hand: null,
    handNo: 0,
    dealerIndex: -1,
    log: [],
    _setupCount: stacks.length,
  };
  dealNewHand(game);
  return game;
}

function dealtHand(game: GameState): Hand {
  assert.ok(game.hand);
  return game.hand;
}

const play = (
  game: GameState,
  playerIndex: number,
  type: "fold" | "check" | "call" | "bet" | "all-in",
  amount?: number,
) => playerAction(game, playerIndex, type, amount, money);

/** Asserts the action was refused with this message and changed nothing. */
function assertRefused(
  game: GameState,
  playerIndex: number,
  type: "check" | "bet" | "all-in",
  amount: number | undefined,
  message: string,
) {
  const before = structuredClone(game);
  assert.deepEqual(play(game, playerIndex, type, amount), { error: message });
  assert.deepEqual(game, before);
}

describe("a player's action", () => {
  test("is ignored when it isn't their turn, or they folded", () => {
    const game = newHand();
    const before = structuredClone(game);
    assert.equal(play(game, 1, "call"), null);
    assert.deepEqual(game, before);

    play(game, 0, "fold");
    dealtHand(game).currentPlayer = 0;
    assert.equal(play(game, 0, "call"), null);
  });

  test("folds, logs it and passes the turn on", () => {
    const game = newHand();
    assert.deepEqual(play(game, 0, "fold"), { type: "fold", handNo: 1, stage: 0 });
    const hand = dealtHand(game);
    assert.equal(hand.in[0], false);
    assert.equal(hand.currentPlayer, 1);
    assert.equal(game.log[0], "Hand 1 PREFLOP: A folds");
    assert.equal(hand.last[0]?.type, "fold");
    assert.equal(hand.last[0]?.chips, 0);
  });

  test("calls what's owed, and a call with nothing owed is a check", () => {
    const game = newHand();
    play(game, 0, "call");
    const hand = dealtHand(game);
    assert.equal(game.players[0].stack, 99_900);
    assert.deepEqual(hand.committed, [100, 50, 100]);
    assert.equal(hand.pot, 250);
    assert.equal(game.log[0], "Hand 1 PREFLOP: A calls $100");

    play(game, 1, "call");
    assert.equal(game.log[0], "Hand 1 PREFLOP: B calls $50");
    assert.deepEqual(play(game, 2, "call"), { type: "check", handNo: 1, stage: 0 });
    assert.equal(game.log[0], "Hand 1 PREFLOP: C checks");
    assert.equal(hand.pot, 300);
  });

  test("won't check facing a bet", () => {
    const game = newHand();
    assertRefused(game, 0, "check", undefined, "Cannot check — must call $100");
  });

  test("bets and raises, naming the street's total", () => {
    const game = newHand();
    // An amount left out is the minimum raise: to 200 before the flop.
    play(game, 0, "bet");
    assert.equal(game.log[0], "Hand 1 PREFLOP: A raises to $200");
    play(game, 1, "bet", 950);
    assert.equal(game.log[0], "Hand 1 PREFLOP: B raises to $1000");
    play(game, 2, "call");
    assert.equal(game.log[0], "Hand 1 PREFLOP: C calls $900");
    play(game, 0, "call");
    assert.equal(dealtHand(game).pot, 3_000);

    assert.equal(dealNextStreet(game), true);
    // The first bet on a street is a bet, not a raise.
    assert.deepEqual(play(game, 1, "bet", 500), { type: "bet", handNo: 1, stage: 1 });
    assert.equal(game.log[0], "Hand 1 FLOP: B bets $500");
  });

  test("refuses a bet that is empty, more than the stack or under the minimum", () => {
    const game = newHand();
    for (const amount of [0, -5, 1.5, Number.NaN]) {
      assertRefused(game, 0, "bet", amount, "Enter an amount");
    }
    assertRefused(game, 0, "bet", 100_001, "The most is $100000 (all in)");
    assertRefused(game, 0, "bet", 150, "Minimum is $200");
  });

  test("allows a short stack's whole stack under the minimum, as a call", () => {
    const game = newHand([100_000, 100_000, 100_000]);
    play(game, 0, "bet", 1_000);
    game.players[1].stack = 600;
    play(game, 1, "bet", 600);
    assert.equal(game.log[0], "Hand 1 PREFLOP: B calls $600");
    assert.equal(game.players[1].stack, 0);
  });

  test("goes all in, and a short all-in reopens nothing for those who acted", () => {
    const game = newHand([100_000, 500, 100_000]);
    play(game, 0, "bet", 400);
    play(game, 1, "all-in");
    assert.equal(
      game.log[0],
      "Hand 1 PREFLOP: B goes all-in for $450 (to $500), short of a full raise",
    );
    play(game, 2, "call");
    assertRefused(
      game,
      0,
      "bet",
      1_000,
      "Only call or fold: the all-in was less than a full raise",
    );
    play(game, 0, "call");
    assert.equal(dealtHand(game).pot, 1_500);

    const full = newHand();
    play(full, 0, "all-in");
    assert.equal(full.log[0], "Hand 1 PREFLOP: A goes all-in for $100000 (to $100000)");
  });

  test("gives the pot to the last player in when the others fold", () => {
    const game = newHand();
    play(game, 0, "fold");
    assert.deepEqual(play(game, 1, "fold"), { type: "fold", handNo: 1, stage: 0 });
    assert.equal(game.hand, null);
    assert.equal(game.players[2].stack, 100_050);
    assert.deepEqual(game.winnerAnnouncement, {
      names: ["C"],
      pot: 150,
      handNo: 1,
      split: false,
    });
    assert.match(game.log[0], /^Hand 1: C wins .*150 \(others folded\)$/);
    assert.equal(game.lastHand?.handNo, 1);
  });
});

describe("taking an action back", () => {
  test("puts the hand back as it was before the action", () => {
    const game = newHand();
    play(game, 0, "bet", 400);
    const beforeCall = structuredClone(game);
    play(game, 1, "call");
    assert.equal(undoPlayerAction(game, 1), true);
    assert.deepEqual(game, beforeCall);
  });

  test("puts a folded player back in", () => {
    const game = newHand();
    const before = structuredClone(game);
    play(game, 0, "fold");
    assert.equal(undoPlayerAction(game, 0), true);
    assert.deepEqual(game, before);
  });

  test("does nothing for a player who hasn't acted", () => {
    const game = newHand();
    const before = structuredClone(game);
    assert.equal(undoPlayerAction(game, 1), false);
    assert.deepEqual(game, before);
  });
});

describe("paying the pot", () => {
  test("splits it between the players picked, in seat order", () => {
    const game = newHand();
    play(game, 0, "call");
    play(game, 1, "fold");
    play(game, 2, "call");
    const hand = dealtHand(game);
    hand.splitSel = [2, 0];
    assert.equal(splitPotBetween(game, money), null);
    assert.equal(game.hand, null);
    assert.equal(game.players[0].stack, 100_025);
    assert.equal(game.players[2].stack, 100_025);
    assert.equal(game.log[0], "Hand 1: split $250 between A, C");
    assert.deepEqual(game.winnerAnnouncement, {
      names: ["A", "C"],
      pot: 250,
      handNo: 1,
      split: true,
    });
  });

  test("won't split between fewer than two", () => {
    for (const picked of [null, [1]]) {
      const game = newHand();
      dealtHand(game).splitSel = picked;
      const before = structuredClone(game);
      assert.equal(splitPotBetween(game, money), "Select at least 2 players");
      assert.deepEqual(game, before);
    }
  });

  test("gives a picked winner the whole pot", () => {
    const game = newHand();
    play(game, 0, "call");
    awardPot(game, 1);
    assert.equal(game.players[1].stack, 100_200);
    assert.match(game.log[0], /^Hand 1: B wins .*250$/);
    assert.equal(game.hand, null);
  });
});
