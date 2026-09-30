import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildProfileStats, type ProfileLedger } from "../lib/profile/stats.ts";

const DAY = 86_400_000;

/** A two-player game where "me" ends with `end` chips from a 100 buy-in. */
function game(id: string, day: number, end: number, me = "me") {
  return {
    id,
    date: day * DAY,
    startStack: 100,
    hands: 10,
    results: [
      { playerId: me, name: "Me", net: end - 100, end, buyIns: [100] },
      { playerId: "other", name: "Other", net: 100 - end, end: 200 - end, buyIns: [100] },
    ],
  };
}

describe("profile stats", () => {
  it("counts the person's games across ledgers, in date order", () => {
    const ledgers: ProfileLedger[] = [
      { currency: "INR", myPlayerId: "me", sessions: [game("a", 3, 150), game("b", 1, 80)] },
      { currency: "INR", myPlayerId: "friend-me", sessions: [game("c", 2, 120, "friend-me")] },
    ];
    const stats = buildProfileStats(ledgers, "INR");
    assert.equal(stats.games, 3);
    assert.equal(stats.profitableGames, 2);
    assert.equal(stats.net, 50);
    assert.equal(stats.otherCurrencyGames, 0);
    assert.deepEqual(stats.recent.map((entry) => entry.net), [-20, 20, 50]);
    assert.equal(stats.firstPlayed, DAY);
    // Returns 50%, -20% and 20%: the mean is 16.67%.
    assert.ok(Math.abs((stats.averageReturn ?? 0) - 50 / 3) < 1e-9);
  });

  it("leaves games in another currency out of the net and the bars only", () => {
    const stats = buildProfileStats(
      [
        { currency: "INR", myPlayerId: "me", sessions: [game("a", 1, 150)] },
        { currency: "USD", myPlayerId: "me", sessions: [game("b", 2, 50)] },
      ],
      "INR",
    );
    assert.equal(stats.games, 2);
    assert.equal(stats.net, 50);
    assert.equal(stats.otherCurrencyGames, 1);
    assert.deepEqual(stats.recent.map((entry) => entry.net), [50]);
    assert.equal(stats.averageReturn, 0);
  });

  it("skips games the person missed and games whose chips don't balance", () => {
    const broken = game("b", 2, 150);
    broken.results[1].end = 10;
    const stats = buildProfileStats(
      [{ currency: "INR", myPlayerId: "me", sessions: [game("a", 1, 150, "someone"), broken] }],
      "INR",
    );
    assert.equal(stats.games, 0);
    assert.equal(stats.averageReturn, null);
    assert.equal(stats.firstPlayed, null);
    assert.deepEqual(stats.recent, []);
  });

  it("keeps only the latest ten games as bars", () => {
    const sessions = Array.from({ length: 12 }, (_, day) => game(`g${day}`, day, 100 + day));
    const stats = buildProfileStats([{ currency: "INR", myPlayerId: "me", sessions }], "INR");
    assert.equal(stats.recent.length, 10);
    assert.equal(stats.recent[0].net, 2);
    assert.equal(stats.recent.at(-1)?.net, 11);
  });
});
