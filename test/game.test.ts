import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  applyRaiseRules,
  bigBlindAtLevel,
  blindStatus,
  betStops,
  buyInPlayer,
  dealNewHand,
  editBlindSchedule,
  mayRaise,
  minimumRaise,
  nextBuyIn,
  nextPlayerToAct,
  pendingBlindPlan,
  pendingIndexes,
  raiseSize,
  resetRaiseRules,
  returnToBetweenHands,
  totalBuyIns,
  undoRaiseRules,
} from "../lib/poker/game.ts";
import type {
  BlindSchedule,
  GameState,
  Hand,
} from "../lib/poker/types.ts";

function gameState(blinds: BlindSchedule | null = null): GameState {
  return {
    ante: 100,
    baseAnte: 100,
    blinds,
    blindLevel: 0,
    startStack: 100_000,
    startedAt: 1,
    players: ["A", "B", "C"].map((name) => ({ name, stack: 100_000 })),
    hand: null,
    handNo: 0,
    dealerIndex: -1,
    log: [],
    _setupCount: 3,
  };
}

function playHands(game: GameState, count: number, now = Date.now()) {
  for (let index = 0; index < count; index += 1) {
    game.hand = null;
    dealNewHand(game, now);
  }
}

function dealtHand(game: GameState): Hand {
  assert.ok(game.hand);
  return game.hand;
}

/** Puts a player's chips in to reach `total` this street, as the table does. */
function betTo(game: GameState, playerIndex: number, total: number) {
  const hand = dealtHand(game);
  const chips = total - hand.committed[playerIndex];
  game.players[playerIndex].stack -= chips;
  hand.committed[playerIndex] += chips;
  hand.pot += chips;
  return applyRaiseRules(game, playerIndex);
}

function fold(game: GameState, playerIndex: number) {
  dealtHand(game).in[playerIndex] = false;
  return applyRaiseRules(game, playerIndex);
}

describe("rising blinds", () => {
  test("edits the plan after the current hand and restarts the hand interval", () => {
    const game = gameState();
    playHands(game, 3);
    const schedule: BlindSchedule = {
      unit: "hands",
      every: 5,
      raiseType: "add",
      raiseBy: 250,
    };

    editBlindSchedule(game, schedule, 5_000);
    assert.equal(game.ante, 100);
    assert.equal(game.blinds, null);
    assert.equal(pendingBlindPlan(game)?.effectiveHand, 4);

    playHands(game, 5);
    assert.equal(game.handNo, 8);
    assert.equal(game.ante, 100);
    assert.equal(game.blindPlans?.length, 2);
    assert.equal(game.blindLevels?.length, 1);

    playHands(game, 1);
    assert.equal(game.handNo, 9);
    assert.equal(game.ante, 350);
    assert.deepEqual(game.blindLevels?.map((entry) => entry.handNo), [1, 9]);
  });

  test("replaces a pending edit and can turn increases off", () => {
    const game = gameState({
      unit: "hands",
      every: 2,
      raiseType: "add",
      raiseBy: 100,
    });
    playHands(game, 3);
    assert.equal(game.ante, 200);

    editBlindSchedule(game, {
      unit: "hands",
      every: 5,
      raiseType: "add",
      raiseBy: 250,
    });
    editBlindSchedule(game, null);
    assert.equal(game.blindPlans?.length, 2);
    assert.equal(game.ante, 200);

    playHands(game, 8);
    assert.equal(game.ante, 200);
    assert.equal(game.blinds, null);
  });

  test("counts timed edits from when they are saved", () => {
    const game = gameState();
    game.startedAt = 1_000_000;
    dealNewHand(game, game.startedAt);
    const editedAt = game.startedAt + 10 * 60_000;
    editBlindSchedule(game, {
      unit: "minutes",
      every: 5,
      raiseType: "multiply",
      raiseBy: 2,
    }, editedAt);

    game.hand = null;
    dealNewHand(game, editedAt + 4 * 60_000);
    assert.equal(game.ante, 100);
    game.hand = null;
    dealNewHand(game, editedAt + 6 * 60_000);
    assert.equal(game.ante, 200);
  });

  test("keeps the earlier plan when a hand is replayed after an edit", () => {
    const game = gameState();
    playHands(game, 2);
    editBlindSchedule(game, {
      unit: "hands",
      every: 1,
      raiseType: "add",
      raiseBy: 50,
    });
    playHands(game, 2);
    assert.equal(game.ante, 150);

    game.handNo = 1;
    game.hand = null;
    dealNewHand(game);
    assert.equal(game.handNo, 2);
    assert.equal(game.ante, 100);
    assert.equal(game.blinds, null);
    assert.deepEqual(game.blindLevels?.map((entry) => entry.handNo), [1]);

    playHands(game, 2);
    assert.equal(game.ante, 150);
  });

  test("keeps the blinds fixed when no schedule is set", () => {
    const game = gameState();
    playHands(game, 12);

    assert.equal(game.ante, 100);
    assert.equal(game.blindLevel, 0);
    assert.deepEqual(game.hand?.committed, [50, 100, 0]);
  });

  test("doubles the blinds every few hands", () => {
    const game = gameState({
      unit: "hands",
      every: 3,
      raiseType: "multiply",
      raiseBy: 2,
    });

    playHands(game, 3);
    assert.equal(game.handNo, 3);
    assert.equal(game.ante, 100);
    assert.equal(game.blindLevel, 0);

    playHands(game, 1);
    assert.equal(game.handNo, 4);
    assert.equal(game.ante, 200);
    assert.equal(game.blindLevel, 1);
    assert.deepEqual(game.hand?.committed, [0, 100, 200]);
    assert.equal(game.log[0], "Hand 4: blinds up to ₹100/₹200 (level 2)");

    playHands(game, 3);
    assert.equal(game.ante, 400);
    assert.equal(game.blindLevel, 2);
  });

  test("adds a flat amount each level and reverts when a hand is undone", () => {
    const game = gameState({
      unit: "hands",
      every: 2,
      raiseType: "add",
      raiseBy: 50,
    });

    playHands(game, 5);
    assert.equal(game.ante, 200);

    // Undo hand 5 the way the ledger does, then re-deal it.
    game.hand = null;
    game.handNo = 3;
    dealNewHand(game);
    assert.equal(game.handNo, 4);
    assert.equal(game.ante, 150);
    assert.equal(game.blindLevel, 1);
  });

  test("raises timed levels on the next hand dealt, not mid-hand", () => {
    const start = 1_000_000;
    const game = gameState({
      unit: "minutes",
      every: 20,
      raiseType: "multiply",
      raiseBy: 1.5,
    });
    game.startedAt = start;

    playHands(game, 1, start + 19 * 60_000);
    assert.equal(game.ante, 100);

    const status = blindStatus(game, start + 19 * 60_000);
    assert.equal(status.nextBigBlind, 150);
    assert.equal(status.nextSmallBlind, 75);
    assert.equal(status.msLeft, 60_000);
    assert.equal(status.dueNow, false);

    // The clock passes the level break, but the running hand keeps its blinds.
    assert.equal(blindStatus(game, start + 21 * 60_000).bigBlind, 100);
    assert.equal(blindStatus(game, start + 21 * 60_000).dueNow, true);

    playHands(game, 1, start + 21 * 60_000);
    assert.equal(game.ante, 150);
    assert.equal(game.blindLevel, 1);
    assert.deepEqual(game.hand?.committed, [150, 0, 75]);

    playHands(game, 1, start + 61 * 60_000);
    assert.equal(game.ante, 338);
    assert.equal(game.blindLevel, 3);
  });

  test("rounds multiplied blinds and never drops below 1", () => {
    const schedule: BlindSchedule = {
      unit: "hands",
      every: 1,
      raiseType: "multiply",
      raiseBy: 1.5,
    };

    assert.equal(bigBlindAtLevel(100, schedule, 0), 100);
    assert.equal(bigBlindAtLevel(100, schedule, 2), 225);
    assert.equal(bigBlindAtLevel(100, schedule, 3), 338);
    assert.equal(bigBlindAtLevel(1, null, 4), 1);
  });

  test("counts down the hands left at the current level", () => {
    const game = gameState({
      unit: "hands",
      every: 4,
      raiseType: "add",
      raiseBy: 100,
    });

    playHands(game, 2);
    const status = blindStatus(game);
    assert.equal(status.level, 0);
    assert.equal(status.bigBlind, 100);
    assert.equal(status.nextBigBlind, 200);
    assert.equal(status.handsLeft, 2);
    assert.equal(status.dueNow, false);

    playHands(game, 2);
    assert.equal(blindStatus(game).handsLeft, 0);
    assert.equal(blindStatus(game).dueNow, true);
  });
});

describe("positional betting", () => {
  test("returns a dealt hand to the same between-hands state", () => {
    const game = gameState({
      unit: "hands",
      every: 1,
      raiseType: "add",
      raiseBy: 100,
    });
    dealNewHand(game);
    const firstHand = dealtHand(game);
    const dealer = firstHand.dealerIndex;
    const stacks = [...firstHand.stacksBeforeHand];
    game.players[dealer].stack -= 500;
    game.log.unshift(`Hand ${firstHand.no} PREFLOP: A Bets ₹500`);

    assert.equal(returnToBetweenHands(game), true);
    assert.equal(game.hand, null);
    assert.equal(game.handNo, 0);
    assert.deepEqual(game.players.map((player) => player.stack), stacks);
    assert.equal(game.log.some((line) => line.startsWith("Hand 1")), false);
    assert.equal(game.ante, 100);
    assert.equal(game.blindLevel, 0);
    assert.deepEqual(game.blindLevels, []);

    dealNewHand(game);
    assert.equal(dealtHand(game).dealerIndex, dealer);
    assert.equal(game.ante, 100);
  });

  test("rotates the dealer through the chosen seating order", () => {
    const game = gameState();
    game.players = [game.players[2], game.players[0], game.players[1]];

    for (const name of ["C", "A", "B", "C"]) {
      game.hand = null;
      dealNewHand(game);
      assert.equal(game.players[dealtHand(game).dealerIndex].name, name);
    }
  });

  test("posts rotating blinds and starts action left of the big blind", () => {
    const game = gameState();
    dealNewHand(game);

    assert.equal(game.hand?.dealerIndex, 0);
    assert.equal(game.hand?.smallBlindIndex, 1);
    assert.equal(game.hand?.bigBlindIndex, 2);
    assert.equal(game.hand?.currentPlayer, 0);
    assert.deepEqual(game.hand?.committed, [0, 50, 100]);

    game.hand = null;
    dealNewHand(game);
    const nextHand = dealtHand(game);
    assert.equal(nextHand.dealerIndex, 1);
    assert.equal(nextHand.smallBlindIndex, 2);
    assert.equal(nextHand.bigBlindIndex, 0);
    assert.equal(nextHand.currentPlayer, 1);
  });

  test("keeps a street open until each funded player matches the bet", () => {
    const game = gameState();
    dealNewHand(game);
    const hand = game.hand!;
    hand.acted = [true, true, true];
    assert.deepEqual(pendingIndexes(game), [0, 1]);

    hand.committed = [100, 100, 100];
    assert.deepEqual(pendingIndexes(game), []);
    assert.equal(nextPlayerToAct(game, 2), null);
  });

  test("runs out the board when only one funded player remains", () => {
    const game = gameState();
    dealNewHand(game);
    const hand = dealtHand(game);
    hand.in = [false, true, true];
    game.players[2].stack = 0;
    hand.roundHigh = 1_000;
    hand.committed = [0, 500, 1_000];
    hand.acted = [true, false, true];

    assert.deepEqual(pendingIndexes(game), [1]);
    assert.equal(nextPlayerToAct(game, 2), 1);

    hand.committed[1] = 1_000;
    assert.deepEqual(pendingIndexes(game), []);
    assert.equal(nextPlayerToAct(game, 2), null);

    hand.stage = 1;
    hand.committed = [0, 0, 0];
    hand.roundHigh = 0;
    hand.acted = [false, false, false];
    assert.deepEqual(pendingIndexes(game), []);
    assert.equal(nextPlayerToAct(game, hand.dealerIndex), null);
  });

  test("keeps betting open while two funded players can respond", () => {
    const game = gameState();
    dealNewHand(game);
    const hand = dealtHand(game);
    game.players[2].stack = 0;
    hand.roundHigh = 100;
    hand.committed = [100, 100, 100];
    hand.acted = [false, false, true];

    assert.deepEqual(pendingIndexes(game), [0, 1]);
    assert.equal(nextPlayerToAct(game, 2), 0);
  });

  test("requires a big blind opening bet after the flop", () => {
    const game = gameState();
    dealNewHand(game);
    const hand = game.hand!;

    assert.equal(hand.currentPlayer, 0);
    assert.equal(minimumRaise(game, 0), 200);

    betTo(game, 0, 200);
    assert.equal(minimumRaise(game, 1), 250);

    hand.stage = 1;
    hand.committed = [0, 0, 0];
    hand.roundHigh = 0;
    hand.acted = [false, false, false];
    resetRaiseRules(game);
    assert.equal(minimumRaise(game, 1), 100);

    game.ante = 250;
    resetRaiseRules(game);
    assert.equal(minimumRaise(game, 1), 250);

    game.players[1].stack = 80;
    assert.equal(minimumRaise(game, 1), 80);
  });
});

describe("raise sizes", () => {
  test("keeps the pre-flop minimum at twice the big blind after a fold or call", () => {
    const game = gameState();
    dealNewHand(game);

    fold(game, 0);
    // The small blind has 50 in, so a raise to 200 adds 150.
    assert.equal(minimumRaise(game, 1), 150);

    betTo(game, 1, 100);
    assert.equal(minimumRaise(game, 2), 100);
  });

  test("makes each re-raise at least as big as the last raise", () => {
    const game = gameState();
    dealNewHand(game);

    betTo(game, 0, 400);
    assert.equal(raiseSize(game), 300);
    assert.equal(minimumRaise(game, 1), 650);

    betTo(game, 1, 1_000);
    assert.equal(raiseSize(game), 600);
    assert.equal(minimumRaise(game, 2), 1_500);
  });

  test("starts each street again at the big blind", () => {
    const game = gameState();
    dealNewHand(game);
    const hand = dealtHand(game);
    betTo(game, 0, 1_000);

    hand.stage = 1;
    hand.committed = [0, 0, 0];
    hand.roundHigh = 0;
    hand.acted = [false, false, false];
    resetRaiseRules(game);
    assert.equal(minimumRaise(game, 1), 100);

    betTo(game, 1, 300);
    assert.equal(minimumRaise(game, 2), 600);
  });

  test("lets a short all-in be called but not re-raised by players who acted", () => {
    const game = gameState();
    dealNewHand(game);
    const hand = dealtHand(game);

    betTo(game, 0, 400);
    game.players[1].stack = 450;
    const before = betTo(game, 1, 500);
    assert.equal(before.full, false);
    assert.equal(hand.roundHigh, 500);
    assert.equal(raiseSize(game), 300);
    assert.equal(mayRaise(game, 0), false);
    assert.equal(mayRaise(game, 2), true);
    assert.equal(minimumRaise(game, 2), 700);

    betTo(game, 2, 500);
    assert.deepEqual(pendingIndexes(game), [0]);
    assert.equal(nextPlayerToAct(game, 2), 0);
    assert.equal(mayRaise(game, 0), false);
  });

  test("reopens raising after a full-sized all-in", () => {
    const game = gameState();
    dealNewHand(game);

    betTo(game, 0, 400);
    game.players[1].stack = 750;
    const before = betTo(game, 1, 800);
    assert.equal(before.full, true);
    assert.equal(raiseSize(game), 400);
    assert.equal(mayRaise(game, 0), true);
    assert.equal(minimumRaise(game, 0), 800);
  });

  test("a later full raise reopens raising after a short all-in", () => {
    const game = gameState();
    dealNewHand(game);

    betTo(game, 0, 400);
    game.players[1].stack = 450;
    betTo(game, 1, 500);
    assert.equal(mayRaise(game, 0), false);

    betTo(game, 2, 800);
    assert.equal(mayRaise(game, 0), true);
    assert.equal(minimumRaise(game, 0), 700);
  });

  test("undo puts the raise rules back", () => {
    const game = gameState();
    dealNewHand(game);
    const hand = dealtHand(game);

    betTo(game, 0, 400);
    const full = betTo(game, 1, 1_000);
    undoRaiseRules(game, 1, full);
    assert.equal(raiseSize(game), 300);
    assert.deepEqual(hand.raiseOpen, [false, true, true]);

    game.players[1].stack = 450;
    const short = betTo(game, 1, 500);
    undoRaiseRules(game, 1, short);
    assert.deepEqual(hand.raiseOpen, [false, true, true]);
  });

  test("treats hands saved before these rules as open at the big blind", () => {
    const game = gameState();
    dealNewHand(game);
    const hand = dealtHand(game);
    delete hand.raiseSize;
    delete hand.raiseOpen;

    assert.equal(raiseSize(game), 100);
    assert.equal(mayRaise(game, 1), true);
    assert.equal(minimumRaise(game, 0), 200);
  });
});

describe("buy-ins", () => {
  test("rebuys each busted player for the full starting stack", () => {
    const game = gameState();
    game.startStack = 10_000;
    game.players[0].stack = 0;

    assert.equal(nextBuyIn(game, 0), 10_000);
    assert.equal(buyInPlayer(game, 0), 10_000);
    assert.equal(game.players[0].stack, 10_000);
    assert.deepEqual(game.players[0].buyIns, [10_000, 10_000]);

    game.players[0].stack = 0;
    assert.equal(buyInPlayer(game, 0), 10_000);
    assert.equal(totalBuyIns(game, 0), 30_000);
    assert.equal(nextBuyIn(game, 0), null, "only busted players rebuy");
  });

  test("continues a game that already had a halved rebuy", () => {
    const game = gameState();
    game.startStack = 10_000;
    game.players[0].stack = 0;
    game.players[0].buyIns = [10_000, 5_000];

    assert.equal(buyInPlayer(game, 0), 10_000);
    assert.deepEqual(game.players[0].buyIns, [10_000, 5_000, 10_000]);
  });

  test("offers no buy-in during a hand or past the buy-in limit", () => {
    const game = gameState();
    game.startStack = 1;
    game.players[0].stack = 0;
    game.players[0].buyIns = Array(64).fill(1);
    assert.equal(nextBuyIn(game, 0), null);

    game.players[0].buyIns = Array(63).fill(1);
    assert.equal(nextBuyIn(game, 0), 1);

    game.startStack = 100_000;
    game.players[0].buyIns = [100_000];
    dealNewHand(game);
    assert.equal(nextBuyIn(game, 0), null);
    assert.equal(buyInPlayer(game, 0), null);
  });
});

describe("bet slider stops", () => {
  test("runs from the minimum through exact multiples to all in", () => {
    assert.deepEqual(betStops(100, 10_000), [100, 150, 200, 500, 1_000, 10_000]);
    assert.deepEqual(betStops(1_000, 6_000), [1_000, 1_500, 2_000, 5_000, 6_000]);
    assert.deepEqual(betStops(1, 100), [1, 2, 5, 10, 100]);
  });

  test("leaves only all in for a short stack", () => {
    assert.deepEqual(betStops(1_000, 1_500), [1_000, 1_500]);
    assert.deepEqual(betStops(1_000, 800), [800]);
    assert.deepEqual(betStops(100, 0), []);
  });
});
