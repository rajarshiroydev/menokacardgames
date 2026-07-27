import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { buildLeaderboard } from "../lib/poker/game.ts";
import type { PokerSession } from "../lib/poker/types.ts";

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
