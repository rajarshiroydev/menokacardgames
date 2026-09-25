import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildStandings, sessionReturn } from "../lib/poker/standings.ts";
import type { PokerSession, SessionResult } from "../lib/poker/types.ts";

let nextDate = 1;

function session(
  id: string,
  startStack: number,
  results: SessionResult[],
  extra: Partial<PokerSession> = {},
): PokerSession {
  const date = nextDate++;
  return {
    id,
    date,
    ended: date,
    ante: 100,
    startStack,
    hands: 10,
    results,
    ...extra,
  };
}

function result(
  playerId: string,
  end: number,
  buyIns: number[],
  name = playerId.toUpperCase(),
): SessionResult {
  const invested = buyIns.reduce((sum, amount) => sum + amount, 0);
  return { playerId, name, end, net: end - invested, buyIns };
}

function entry(standings: ReturnType<typeof buildStandings>, playerId: string) {
  const found = standings.entries.find((item) => item.playerId === playerId);
  assert.ok(found, `missing ${playerId}`);
  return found;
}

describe("session return", () => {
  it("matches the documented examples", () => {
    assert.equal(sessionReturn(5_000, 10_000), 50);
    assert.equal(sessionReturn(500_000, 1_000_000), 50);
    assert.equal(sessionReturn(3_000, 15_000), 20);
    assert.equal(sessionReturn(-15_000, 15_000), -100);
  });

  it("gives no return without a positive investment", () => {
    assert.equal(sessionReturn(0, 0), null);
    assert.equal(sessionReturn(100, -1), null);
  });
});

describe("average session return standings", () => {
  it("weights each session equally regardless of chip scale", () => {
    const standings = buildStandings([
      session("small", 10_000, [
        result("a", 15_000, [10_000]),
        result("b", 5_000, [10_000]),
      ]),
      session("large", 1_000_000, [
        result("a", 800_000, [1_000_000]),
        result("b", 1_200_000, [1_000_000]),
      ]),
    ]);

    const a = entry(standings, "a");
    const b = entry(standings, "b");
    assert.equal(a.averageReturn, 15);
    assert.equal(b.averageReturn, -15);
    assert.equal(a.rank, 1);
    assert.equal(a.invested, 1_010_000);
    assert.equal(a.net, -195_000);
    assert.equal(a.profitableSessions, 1);
    assert.equal(a.eligibleSessions, 2);
    assert.equal(a.hands, 20);
  });

  it("scores scaled copies of a session identically", () => {
    const small = buildStandings([
      session("s", 10_000, [
        result("a", 13_000, [10_000, 5_000]),
        result("b", 12_000, [10_000]),
      ]),
    ]);
    const large = buildStandings([
      session("l", 1_000_000, [
        result("a", 1_300_000, [1_000_000, 500_000]),
        result("b", 1_200_000, [1_000_000]),
      ]),
    ]);

    assert.equal(entry(small, "a").averageReturn, entry(large, "a").averageReturn);
    assert.equal(entry(small, "b").averageReturn, entry(large, "b").averageReturn);
  });

  it("includes every rebuy and counts a bust as minus one hundred percent", () => {
    const standings = buildStandings([
      session("bust", 10_000, [
        result("a", 0, [10_000, 5_000]),
        result("b", 25_000, [10_000]),
      ]),
    ]);

    assert.equal(entry(standings, "a").averageReturn, -100);
    assert.equal(entry(standings, "b").averageReturn, 150);
    assert.equal(entry(standings, "a").invested, 15_000);
  });

  it("ranks a player from a single eligible session", () => {
    const standings = buildStandings([
      session("only", 10_000, [
        result("a", 11_000, [10_000]),
        result("b", 9_000, [10_000]),
      ]),
    ]);

    assert.deepEqual(
      standings.entries.map((item) => [item.playerId, item.rank, item.eligibleSessions]),
      [
        ["a", 1, 1],
        ["b", 2, 1],
      ],
    );
  });

  it("shares ranks for identical scores and orders ties by stable id", () => {
    const standings = buildStandings([
      session("one", 10_000, [
        result("c", 15_000, [10_000]),
        result("b", 8_000, [10_000]),
        result("a", 7_000, [10_000]),
      ]),
      session("two", 10_000, [
        result("c", 8_000, [10_000]),
        result("b", 15_000, [10_000]),
        result("a", 7_000, [10_000]),
      ]),
    ]);

    assert.deepEqual(
      standings.entries.map((item) => [item.playerId, item.rank]),
      [
        ["b", 1],
        ["c", 1],
        ["a", 3],
      ],
    );
    assert.equal(entry(standings, "b").averageReturn, entry(standings, "c").averageReturn);
  });

  it("groups renamed results by stable player id", () => {
    const standings = buildStandings([
      session("one", 1_000, [
        result("a", 1_100, [1_000], "Raj"),
        result("b", 900, [1_000], "Sam"),
      ]),
      session("two", 1_000, [
        result("a", 1_200, [1_000], "Rajarshi"),
        result("b", 800, [1_000], "Sam"),
      ]),
    ]);

    assert.equal(standings.entries.length, 2);
    assert.equal(entry(standings, "a").name, "Rajarshi");
    assert.equal(entry(standings, "a").totalSessions, 2);
  });

  it("excludes discarded sessions and recalculates when they are restored", () => {
    const active = session("active", 1_000, [
      result("a", 1_100, [1_000]),
      result("b", 900, [1_000]),
    ]);
    const discarded = session(
      "discarded",
      1_000,
      [result("a", 500, [1_000]), result("b", 1_500, [1_000])],
      { discardedAt: 99 },
    );

    const withoutDiscarded = buildStandings([active, discarded]);
    assert.equal(entry(withoutDiscarded, "a").averageReturn, 10);
    assert.equal(entry(withoutDiscarded, "a").totalSessions, 1);
    assert.equal(withoutDiscarded.timeline.length, 1);

    const restored = buildStandings([
      active,
      { ...discarded, discardedAt: undefined },
    ]);
    assert.equal(entry(restored, "a").averageReturn, -20);
    assert.equal(entry(restored, "b").rank, 1);
  });

  it("uses the starting stack when a legacy result has no buy-in history", () => {
    const standings = buildStandings([
      session("legacy", 10_000, [
        { playerId: "a", name: "A", end: 12_000, net: 2_000 },
        { playerId: "b", name: "B", end: 8_000, net: -2_000 },
      ]),
    ]);

    assert.equal(entry(standings, "a").averageReturn, 20);
  });

  it("leaves inconsistent legacy records unranked with a reason", () => {
    const standings = buildStandings([
      session("inconsistent", 10_000, [
        { playerId: "a", name: "A", end: 12_000, net: 5_000 },
        { playerId: "b", name: "B", end: 8_000, net: -5_000 },
      ]),
    ]);

    const a = entry(standings, "a");
    assert.equal(a.averageReturn, null);
    assert.equal(a.rank, null);
    assert.equal(a.eligibleSessions, 0);
    assert.equal(a.totalSessions, 1);
    assert.equal(a.net, 0);
    assert.equal(a.hands, 0);
    assert.equal(a.invested, 0);
    assert.equal(a.profitableSessions, 0);
    assert.deepEqual(a.ineligible, [
      { sessionId: "inconsistent", reason: "unverified-accounting" },
    ]);
    assert.deepEqual(standings.series.get("id:a")?.cumulativeNet, [0, 0]);
  });

  it("never divides by a zero investment", () => {
    const standings = buildStandings([
      session("zero", 0, [
        { playerId: "a", name: "A", end: 0, net: 0 },
        { playerId: "b", name: "B", end: 0, net: 0 },
      ]),
    ]);

    assert.equal(entry(standings, "a").averageReturn, null);
    assert.deepEqual(entry(standings, "a").ineligible, [
      { sessionId: "zero", reason: "no-investment" },
    ]);
  });

  it("rejects sessions with duplicate participants", () => {
    const standings = buildStandings([
      session("duplicate", 1_000, [
        result("a", 1_500, [1_000]),
        result("a", 500, [1_000]),
      ]),
    ]);

    const a = entry(standings, "a");
    assert.equal(a.averageReturn, null);
    assert.equal(a.totalSessions, 1);
    assert.equal(a.hands, 0);
    assert.equal(a.ineligible[0].reason, "unverified-accounting");
  });

  it("does not rank sessions whose totals exceed the safe chip range", () => {
    const huge = Number.MAX_SAFE_INTEGER;
    const standings = buildStandings([
      session("overflow", huge, [
        result("a", huge, [huge]),
        result("b", huge, [huge]),
      ]),
    ]);

    assert.equal(entry(standings, "a").averageReturn, null);
    assert.equal(entry(standings, "a").ineligible[0].reason, "unverified-accounting");
  });

  it("places players without an eligible session after ranked players", () => {
    const standings = buildStandings([
      session("bad", 1_000, [
        { playerId: "z", name: "Zed", end: 1_000, net: 7 },
        { playerId: "y", name: "Yan", end: 1_000, net: -7 },
      ]),
      session("good", 1_000, [
        result("a", 400, [1_000]),
        result("b", 1_600, [1_000]),
      ]),
    ]);

    assert.deepEqual(
      standings.entries.map((item) => [item.playerId, item.rank]),
      [
        ["b", 1],
        ["a", 2],
        ["y", null],
        ["z", null],
      ],
    );
  });
});

describe("running average return graph", () => {
  it("starts at the first eligible session and carries the mean through absences", () => {
    const standings = buildStandings([
      session("one", 1_000, [
        result("a", 1_500, [1_000]),
        result("b", 500, [1_000]),
      ]),
      session("two", 1_000, [
        result("b", 1_200, [1_000]),
        result("c", 800, [1_000]),
      ]),
      session("three", 1_000, [
        result("a", 800, [1_000]),
        result("c", 1_200, [1_000]),
      ]),
    ]);

    const a = standings.series.get("id:a");
    const c = standings.series.get("id:c");
    assert.ok(a && c);

    assert.deepEqual(
      a.returns.map((point) => point && [point.sessionReturn, point.runningAverage, point.sampleCount]),
      [
        [50, 50, 1],
        [null, 50, 1],
        [-20, 15, 2],
      ],
    );
    assert.deepEqual(
      c.returns.map((point) => point && point.runningAverage),
      [null, -20, 0],
    );
    assert.deepEqual(a.cumulativeNet, [0, 500, 500, 300]);
    assert.deepEqual(c.cumulativeNet, [0, 0, -200, 0]);
  });

  it("orders the timeline chronologically and ignores discarded sessions", () => {
    const later = session("later", 1_000, [
      result("a", 1_000, [1_000]),
      result("b", 1_000, [1_000]),
    ]);
    const earlier = session(
      "earlier",
      1_000,
      [result("a", 1_000, [1_000]), result("b", 1_000, [1_000])],
      { date: 0 },
    );
    const discarded = session(
      "discarded",
      1_000,
      [result("a", 1_000, [1_000]), result("b", 1_000, [1_000])],
      { discardedAt: 1 },
    );

    const standings = buildStandings([later, discarded, earlier]);

    assert.deepEqual(
      standings.timeline.map((item) => item.id),
      ["earlier", "later"],
    );
  });
});
