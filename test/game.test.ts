import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  buildLeaderboard,
  dealNewHand,
  minimumRaise,
  nextPlayerToAct,
  pendingIndexes,
} from "../lib/poker/game.ts";
import type { GameState, PokerSession } from "../lib/poker/types.ts";

function gameState(): GameState {
  return {
    ante: 100,
    startStack: 1000,
    startedAt: 1,
    players: ["A", "B", "C"].map((name) => ({ name, stack: 1000 })),
    hand: null,
    handNo: 0,
    dealerIndex: -1,
    log: [],
    _setupCount: 3,
  };
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
