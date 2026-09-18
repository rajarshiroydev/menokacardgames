import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  bigBlindAtLevel,
  blindStatus,
  buildLeaderboard,
  dealNewHand,
  minimumRaise,
  nextPlayerToAct,
  pendingIndexes,
} from "../lib/poker/game.ts";
import type {
  BlindSchedule,
  GameState,
  PokerSession,
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

describe("leaderboard player identity", () => {
  test("groups renamed results by stable player id", () => {
    const sessions: PokerSession[] = [
      {
        id: "s1",
        date: 1,
        ended: 2,
        ante: 100,
        startStack: 1000,
        hands: 1,
        results: [
          { playerId: "player-a", name: "Raj", net: 100, end: 1100 },
          { playerId: "player-b", name: "Sam", net: -100, end: 900 },
        ],
      },
      {
        id: "s2",
        date: 3,
        ended: 4,
        ante: 100,
        startStack: 1000,
        hands: 1,
        results: [
          { playerId: "player-a", name: "Rajarshi", net: 200, end: 1200 },
          { playerId: "player-b", name: "Sam", net: -200, end: 800 },
        ],
      },
    ];

    const leaderboard = buildLeaderboard(sessions);

    assert.equal(leaderboard.length, 2);
    assert.equal(leaderboard[0].playerId, "player-a");
    assert.equal(leaderboard[0].name, "Rajarshi");
    assert.equal(leaderboard[0].net, 300);
    assert.equal(leaderboard[0].sessions, 2);
  });

  test("excludes discarded sessions from every total", () => {
    const sessions: PokerSession[] = [
      {
        id: "active",
        date: 1,
        ended: 2,
        ante: 100,
        startStack: 1000,
        hands: 1,
        results: [
          { playerId: "player-a", name: "Raj", net: 100, end: 1100 },
          { playerId: "player-b", name: "Sam", net: -100, end: 900 },
        ],
      },
      {
        id: "discarded",
        discardedAt: 5,
        date: 3,
        ended: 4,
        ante: 100,
        startStack: 1000,
        hands: 1,
        results: [
          { playerId: "player-a", name: "Raj", net: -500, end: 500 },
          { playerId: "player-b", name: "Sam", net: 500, end: 1500 },
        ],
      },
    ];

    const leaderboard = buildLeaderboard(sessions);

    assert.equal(leaderboard[0].playerId, "player-a");
    assert.equal(leaderboard[0].net, 100);
    assert.equal(leaderboard[0].sessions, 1);
  });
});

describe("rising blinds", () => {
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
    assert.equal(game.hand?.dealerIndex, 1);
    assert.equal(game.hand?.smallBlindIndex, 2);
    assert.equal(game.hand?.bigBlindIndex, 0);
    assert.equal(game.hand?.currentPlayer, 1);
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

  test("requires UTG to raise to twice the big blind, then allows any higher amount", () => {
    const game = gameState();
    dealNewHand(game);
    const hand = game.hand!;

    assert.equal(hand.currentPlayer, 0);
    assert.equal(minimumRaise(game, 0), 200);

    hand.committed[0] = 200;
    hand.roundHigh = 200;
    hand.acted[0] = true;
    assert.equal(minimumRaise(game, 1), 151);

    hand.stage = 1;
    hand.committed = [0, 0, 0];
    hand.roundHigh = 0;
    hand.acted = [false, false, false];
    assert.equal(minimumRaise(game, 1), 1);
  });
});
