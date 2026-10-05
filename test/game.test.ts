import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  applyRaiseRules,
  awardPots,
  hasSidePots,
  potLabel,
  potsFor,
  bigBlindAtLevel,
  blindStatus,
  betStops,
  buyInPlayer,
  cancelCurrentHand,
  completedHandRecord,
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
  sessionBlindHistory,
  totalBuyIns,
  undoLastHand,
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

  /** Takes a player's last chips back, as the table's Undo does. */
  function undoBet(
    game: GameState,
    playerIndex: number,
    chips: number,
    before: ReturnType<typeof betTo>,
  ) {
    const hand = dealtHand(game);
    game.players[playerIndex].stack += chips;
    hand.committed[playerIndex] -= chips;
    hand.pot -= chips;
    hand.acted[playerIndex] = false;
    hand.roundHigh = Math.max(0, ...hand.committed);
    undoRaiseRules(game, playerIndex, before);
  }

  test("undoing a raise doesn't make the callers before it act again", () => {
    const game = gameState();
    dealNewHand(game);
    const hand = dealtHand(game);

    betTo(game, 0, 100);
    betTo(game, 1, 100);
    const raise = betTo(game, 2, 400);
    assert.deepEqual(pendingIndexes(game), [0, 1]);

    undoBet(game, 2, 300, raise);
    assert.deepEqual(hand.acted, [true, true, false]);
    assert.deepEqual(pendingIndexes(game), [2]);

    betTo(game, 2, 100);
    assert.deepEqual(pendingIndexes(game), []);
  });

  test("undoing a raise out of turn keeps the players who acted after it", () => {
    const game = gameState();
    dealNewHand(game);
    const hand = dealtHand(game);

    const raise = betTo(game, 0, 400);
    betTo(game, 1, 400);

    undoBet(game, 0, 400, raise);
    assert.deepEqual(hand.acted, [false, true, false]);
    assert.deepEqual(pendingIndexes(game), [0, 2]);
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

/** Awards the pot the way the table does, leaving the between-hands state. */
function finishHand(game: GameState, winner: number) {
  const hand = dealtHand(game);
  game.players[winner].stack += hand.pot;
  game.lastHand = completedHandRecord(game);
  game.hand = null;
}

describe("undo last hand", () => {
  const MINUTE_MS = 60_000;

  function playTo(game: GameState, hands: number, start = 1_000) {
    // Stored games always carry buy-ins (see readStoredGame).
    game.players.forEach((player) => {
      player.buyIns ??= [game.startStack];
    });
    for (let index = 0; index < hands; index += 1) {
      dealNewHand(game, start + index * MINUTE_MS);
      betTo(game, dealtHand(game).currentPlayer!, 300);
      finishHand(game, index % game.players.length);
    }
  }

  function snapshot(game: GameState) {
    return { ...structuredClone(game), lastHand: null, winnerAnnouncement: null };
  }

  test("deals the undone hand again with the same dealer and blinds", () => {
    const game = gameState();
    playTo(game, 3);
    dealNewHand(game, 10 * MINUTE_MS);
    const before = snapshot(game);
    betTo(game, dealtHand(game).currentPlayer!, 400);
    finishHand(game, 1);

    assert.ok(undoLastHand(game, 99 * MINUTE_MS));
    assert.deepEqual(game, before);
  });

  test("also undoes a next hand that was already dealt", () => {
    const game = gameState();
    playTo(game, 2);
    dealNewHand(game, 10 * MINUTE_MS);
    const before = snapshot(game);
    finishHand(game, 2);
    dealNewHand(game, 11 * MINUTE_MS);
    betTo(game, dealtHand(game).currentPlayer!, 500);

    assert.ok(undoLastHand(game, 99 * MINUTE_MS));
    assert.deepEqual(game, before);
  });

  test("keeps the blind level of the undone hand, by hands or by time", () => {
    for (const schedule of [
      { unit: "hands", every: 1, raiseType: "multiply", raiseBy: 2 },
      { unit: "minutes", every: 2, raiseType: "add", raiseBy: 100 },
    ] satisfies BlindSchedule[]) {
      const game = gameState(schedule);
      game.blindPlans = [
        { effectiveHand: 1, effectiveAt: 0, baseBigBlind: 100, schedule },
      ];
      playTo(game, 3, 0);
      dealNewHand(game, 5 * MINUTE_MS);
      const before = snapshot(game);
      finishHand(game, 0);
      dealNewHand(game, 9 * MINUTE_MS);

      assert.ok(undoLastHand(game, 60 * MINUTE_MS));
      assert.deepEqual(game, before, schedule.unit);
    }
  });

  test("takes back a rebuy made after the undone hand", () => {
    const game = gameState();
    playTo(game, 1);
    dealNewHand(game, 10 * MINUTE_MS);
    const before = snapshot(game);
    const hand = dealtHand(game);
    const loser = hand.currentPlayer!;
    betTo(game, loser, game.players[loser].stack + hand.committed[loser]);
    finishHand(game, (loser + 1) % 3);
    buyInPlayer(game, loser);

    assert.ok(undoLastHand(game));
    assert.deepEqual(game, before);
  });

  test("finds the dealer for games saved before the fuller undo record", () => {
    const game = gameState();
    playTo(game, 2);
    dealNewHand(game, 10 * MINUTE_MS);
    const before = snapshot(game);
    finishHand(game, 0);
    const last = game.lastHand!;
    game.lastHand = {
      stacksBefore: last.stacksBefore,
      buyInsBefore: last.buyInsBefore,
    };

    assert.ok(undoLastHand(game, 10 * MINUTE_MS));
    assert.equal(game.dealerIndex, before.dealerIndex);
    assert.deepEqual(game.players, before.players);
    assert.equal(
      dealtHand(game).bigBlindIndex,
      before.hand!.bigBlindIndex,
    );
  });
});

describe("cancel hand", () => {
  const MINUTE_MS = 60_000;

  function playTo(game: GameState, hands: number, start = 1_000) {
    game.players.forEach((player) => {
      player.buyIns ??= [game.startStack];
    });
    for (let index = 0; index < hands; index += 1) {
      dealNewHand(game, start + index * MINUTE_MS);
      betTo(game, dealtHand(game).currentPlayer!, 300);
      finishHand(game, index % game.players.length);
    }
  }

  test("deals the cancelled hand again with the same dealer and blinds", () => {
    for (const hands of [0, 2]) {
      const game = gameState();
      game.players.push({ name: "D", stack: 100_000 });
      playTo(game, hands);
      dealNewHand(game, 10 * MINUTE_MS);
      const before = structuredClone(game);
      betTo(game, dealtHand(game).currentPlayer!, 400);
      betTo(game, dealtHand(game).currentPlayer!, 400);

      assert.ok(cancelCurrentHand(game, 99 * MINUTE_MS));
      assert.deepEqual(game, before, `after ${hands} hands`);
    }
  });

  test("keeps the blind level of the cancelled hand, by hands or by time", () => {
    for (const schedule of [
      { unit: "hands", every: 1, raiseType: "multiply", raiseBy: 2 },
      { unit: "minutes", every: 2, raiseType: "add", raiseBy: 100 },
    ] satisfies BlindSchedule[]) {
      const game = gameState(schedule);
      game.blindPlans = [
        { effectiveHand: 1, effectiveAt: 0, baseBigBlind: 100, schedule },
      ];
      playTo(game, 3, 0);
      dealNewHand(game, 5 * MINUTE_MS);
      const before = structuredClone(game);
      betTo(game, dealtHand(game).currentPlayer!, 900);

      assert.ok(cancelCurrentHand(game, 60 * MINUTE_MS));
      assert.deepEqual(game, before, schedule.unit);
    }
  });

  test("finds the dealer for hands dealt before the fuller record", () => {
    const game = gameState();
    playTo(game, 2);
    dealNewHand(game, 10 * MINUTE_MS);
    const before = structuredClone(game);
    const hand = dealtHand(game);
    delete hand.dealerIndexBefore;
    delete hand.anteBefore;

    assert.ok(cancelCurrentHand(game));
    assert.deepEqual(game.players, before.players);
    assert.equal(dealtHand(game).dealerIndex, before.hand!.dealerIndex);
    assert.equal(dealtHand(game).bigBlindIndex, before.hand!.bigBlindIndex);
  });

  test("does nothing between hands", () => {
    const game = gameState();
    assert.equal(cancelCurrentHand(game), false);
  });
});


describe("side pots", () => {
  /**
   * A hand at the showdown where each player started with `before` and put
   * in `put`; players in `folded` are out.
   */
  function showdown(before: number[], put: number[], folded: number[] = []) {
    const game = gameState();
    game.players = before.map((stack, index) => ({
      name: "ABCDEF"[index],
      stack,
    }));
    dealNewHand(game);
    const hand = dealtHand(game);
    hand.stacksBeforeHand = [...before];
    game.players.forEach((player, index) => {
      player.stack = before[index] - put[index];
    });
    hand.in = before.map((_, index) => !folded.includes(index));
    hand.pot = put.reduce((sum, chips) => sum + chips, 0);
    hand.stage = 3;
    return game;
  }

  const chips = (game: GameState) =>
    game.players.reduce((sum, player) => sum + player.stack, 0);

  test("a short all-in only wins what each player matched", () => {
    const game = showdown([1_000, 10_000, 10_000], [1_000, 5_000, 5_000]);
    assert.deepEqual(potsFor(game), {
      pots: [
        { amount: 3_000, eligible: [0, 1, 2] },
        { amount: 8_000, eligible: [1, 2] },
      ],
      refund: null,
    });
    assert.ok(hasSidePots(game));

    assert.ok(awardPots(game, [[0], [1]]));
    assert.deepEqual(
      game.players.map((player) => player.stack),
      [3_000, 13_000, 5_000],
    );
    assert.deepEqual(game.winnerAnnouncement?.pots, [
      { label: "Main pot", amount: 3_000, names: ["A"] },
      { label: "Side pot", amount: 8_000, names: ["B"] },
    ]);
    assert.equal(game.log[0], "Hand 1: B wins side pot ₹8,000");
    assert.equal(game.log[1], "Hand 1: A wins main pot ₹3,000");
    assert.equal(game.hand, null);
  });

  test("chips nobody called go back", () => {
    const game = showdown([1_000, 10_000], [1_000, 10_000]);
    assert.deepEqual(potsFor(game), {
      pots: [{ amount: 2_000, eligible: [0, 1] }],
      refund: { playerIndex: 1, amount: 9_000 },
    });
    assert.ok(hasSidePots(game));

    assert.ok(awardPots(game, [[0]]));
    assert.deepEqual(
      game.players.map((player) => player.stack),
      [2_000, 9_000],
    );
    assert.equal(game.log[1], "Hand 1: ₹9,000 returned to B (not called)");
    assert.equal(game.log[0], "Hand 1: A wins pot ₹2,000");
  });

  test("folded chips stay in the pots they reached", () => {
    const game = showdown(
      [1_000, 10_000, 10_000, 10_000],
      [1_000, 3_000, 3_000, 500],
      [3],
    );
    assert.deepEqual(potsFor(game).pots, [
      { amount: 3_500, eligible: [0, 1, 2] },
      { amount: 4_000, eligible: [1, 2] },
    ]);
  });

  test("each all-in amount closes a pot", () => {
    const game = showdown(
      [500, 1_500, 10_000, 10_000],
      [500, 1_500, 4_000, 4_000],
    );
    const { pots, refund } = potsFor(game);
    assert.equal(refund, null);
    assert.deepEqual(pots, [
      { amount: 2_000, eligible: [0, 1, 2, 3] },
      { amount: 3_000, eligible: [1, 2, 3] },
      { amount: 5_000, eligible: [2, 3] },
    ]);
    assert.deepEqual(
      pots.map((_, index) => potLabel(index, pots.length)),
      ["Main pot", "Side pot 1", "Side pot 2"],
    );
  });

  test("a split side pot gives odd chips in seat order", () => {
    // D folded after putting in 1,001, so the side pot is an odd ₹2,001.
    const game = showdown(
      [1_000, 10_000, 10_000, 10_000],
      [1_000, 2_000, 2_000, 1_001],
      [3],
    );
    const before = chips(game) + 1_000 + 2_000 + 2_000 + 1_001;
    assert.deepEqual(potsFor(game).pots, [
      { amount: 4_000, eligible: [0, 1, 2] },
      { amount: 2_001, eligible: [1, 2] },
    ]);
    assert.ok(awardPots(game, [[0], [2, 1]]));
    assert.deepEqual(
      game.players.map((player) => player.stack),
      [4_000, 8_000 + 1_001, 8_000 + 1_000, 8_999],
    );
    assert.equal(chips(game), before);
    assert.equal(
      game.log[0],
      "Hand 1: split side pot ₹2,001 between B, C",
    );
  });

  test("a pot only one player can win goes to them", () => {
    // B's extra was called by D, who then folded, so only B can win it.
    const game = showdown(
      [1_000, 10_000, 10_000],
      [1_000, 3_000, 3_000],
      [2],
    );
    assert.deepEqual(potsFor(game).pots, [
      { amount: 3_000, eligible: [0, 1] },
      { amount: 4_000, eligible: [1] },
    ]);
    assert.ok(awardPots(game, [[0]]));
    assert.deepEqual(
      game.players.map((player) => player.stack),
      [3_000, 11_000, 7_000],
    );
  });

  test("an ordinary hand has one pot", () => {
    const game = showdown([10_000, 10_000, 10_000], [800, 800, 800]);
    assert.deepEqual(potsFor(game), {
      pots: [{ amount: 2_400, eligible: [0, 1, 2] }],
      refund: null,
    });
    assert.equal(hasSidePots(game), false);
  });

  test("players still to call don't close a pot mid-street", () => {
    const game = gameState();
    dealNewHand(game);
    betTo(game, 0, 300);
    betTo(game, 1, 300);
    assert.deepEqual(potsFor(game).pots, [
      { amount: 700, eligible: [0, 1, 2] },
    ]);
    assert.equal(potsFor(game).refund, null);
  });

  test("refuses a winner who can't win that pot", () => {
    const game = showdown([1_000, 10_000, 10_000], [1_000, 5_000, 5_000]);
    const before = structuredClone(game);
    assert.equal(awardPots(game, [[0], [0]]), false);
    assert.equal(awardPots(game, [[0]]), false);
    assert.deepEqual(game, before);
  });

  test("undo last hand takes the pots back", () => {
    const game = showdown([1_000, 10_000, 10_000], [1_000, 5_000, 5_000]);
    assert.ok(awardPots(game, [[0], [1]]));
    assert.ok(undoLastHand(game));
    const hand = dealtHand(game);
    assert.deepEqual(hand.stacksBeforeHand, [1_000, 10_000, 10_000]);
    assert.deepEqual(
      game.players.map((player, index) => player.stack + hand.committed[index]),
      [1_000, 10_000, 10_000],
    );
  });
});

describe("sessionBlindHistory", () => {
  test("keeps a saved history", () => {
    const blindHistory = {
      plans: [{ effectiveHand: 1, effectiveAt: 5, baseBigBlind: 100, schedule: null }],
      levels: [
        { handNo: 1, dealtAt: 5, bigBlind: 100 },
        { handNo: 11, dealtAt: 9, bigBlind: 200 },
      ],
    };
    assert.equal(sessionBlindHistory({ ante: 100, date: 5, blindHistory }), blindHistory);
  });

  test("shows an older game as fixed at its starting big blind", () => {
    assert.deepEqual(sessionBlindHistory({ ante: 500, date: 7 }), {
      plans: [{ effectiveHand: 1, effectiveAt: 7, baseBigBlind: 500, schedule: null }],
      levels: [{ handNo: 1, dealtAt: 7, bigBlind: 500 }],
    });
  });
});

describe("first dealer", () => {
  test("a random first dealer deals hand 1, then the button moves on", () => {
    const game = gameState();
    // Setup stores the seat before the chosen dealer (C, seat 3).
    game.dealerIndex = 1;
    dealNewHand(game);
    const first = dealtHand(game);
    assert.equal(first.dealerIndex, 2);
    assert.equal(first.smallBlindIndex, 0);
    assert.equal(first.bigBlindIndex, 1);
    playHands(game, 1);
    assert.equal(dealtHand(game).dealerIndex, 0);
  });
});
