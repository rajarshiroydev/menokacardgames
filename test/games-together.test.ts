import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildGamesTogether } from "../lib/profile/together.ts";

type Result = { playerId: string; accountId?: string | null };

const game = (id: string, results: Result[]) => ({
  id,
  date: 0,
  startStack: 1000,
  hands: 1,
  results: results.map((result) => ({ ...result, name: result.playerId, net: 0, end: 1000 })),
});

// Rahul's view: his list has his own player, Rajarshi (linked) and Ashit (guest).
const linked = new Map([["acct-rajarshi", "r-raj"]]);

describe("games played together", () => {
  it("counts the person's own games only when they played", () => {
    const counts = buildGamesTogether(
      {
        myPlayerId: "r-me",
        sessions: [
          game("1", [{ playerId: "r-me" }, { playerId: "r-ashit" }]),
          game("2", [{ playerId: "r-ashit" }, { playerId: "r-raj" }]),
        ],
      },
      [],
      linked,
    );
    assert.deepEqual(counts, { "r-ashit": 1 });
  });

  it("counts a friend's games by account, including the host's own player", () => {
    const counts = buildGamesTogether(
      { myPlayerId: "r-me", sessions: [] },
      [
        {
          // Rajarshi's ledger, where Rajarshi's player for Rahul is "x-rahul".
          myPlayerId: "x-rahul",
          sessions: [
            game("a", [
              { playerId: "x-raj", accountId: "acct-rajarshi" },
              { playerId: "x-rahul", accountId: "acct-rahul" },
            ]),
            game("b", [
              { playerId: "x-raj", accountId: "acct-rajarshi" },
              { playerId: "x-debraj", accountId: null },
            ]),
          ],
        },
      ],
      linked,
    );
    assert.deepEqual(counts, { "r-raj": 1 });
  });

  it("counts a third host's game when both are linked there", () => {
    const counts = buildGamesTogether(
      { myPlayerId: "r-me", sessions: [] },
      [
        {
          myPlayerId: "e-rahul",
          sessions: [
            game("c", [
              { playerId: "e-emon", accountId: "acct-emon" },
              { playerId: "e-rahul", accountId: "acct-rahul" },
              { playerId: "e-raj", accountId: "acct-rajarshi" },
            ]),
            // Rajarshi only as Emon's unlinked guest: can't be told apart.
            game("d", [
              { playerId: "e-rahul", accountId: "acct-rahul" },
              { playerId: "e-raj-guest", accountId: null },
            ]),
          ],
        },
      ],
      linked,
    );
    assert.deepEqual(counts, { "r-raj": 1 });
  });

  it("adds games across hosts", () => {
    const counts = buildGamesTogether(
      {
        myPlayerId: "r-me",
        sessions: [game("1", [{ playerId: "r-me" }, { playerId: "r-raj" }])],
      },
      [
        {
          myPlayerId: "x-rahul",
          sessions: [
            game("a", [
              { playerId: "x-raj", accountId: "acct-rajarshi" },
              { playerId: "x-rahul", accountId: "acct-rahul" },
            ]),
          ],
        },
      ],
      linked,
    );
    assert.deepEqual(counts, { "r-raj": 2 });
  });

  it("counts nothing in own games without an own player", () => {
    const counts = buildGamesTogether(
      { myPlayerId: null, sessions: [game("1", [{ playerId: "r-raj" }])] },
      [],
      linked,
    );
    assert.deepEqual(counts, {});
  });
});
