import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildGroupStandings,
  findSharedGame,
  playedInGroup,
  type GroupSessions,
} from "../lib/friends/group-standings.ts";
import { buildStandings } from "../lib/poker/standings.ts";

const group: GroupSessions = {
  hostAccountId: "host-account",
  hostName: "Rajarshi",
  myPlayerId: "p-deb",
  myPlayerName: "Debraj",
  sessions: [
    {
      id: "secret-session-1",
      date: Date.UTC(2026, 8, 1),
      startStack: 1000,
      hands: 10,
      results: [
        { playerId: "p-raj", name: "Rajarshi", net: 500, end: 1500, buyIns: [1000] },
        { playerId: "p-deb", name: "Debraj", net: -500, end: 500, buyIns: [1000] },
      ],
    },
    {
      id: "secret-session-2",
      date: Date.UTC(2026, 8, 8),
      startStack: 1000,
      hands: 20,
      results: [
        { playerId: "p-raj", name: "Rajarshi", net: -1000, end: 1000, buyIns: [1000, 1000] },
        { playerId: "p-deb", name: "Debraj", net: 1000, end: 2000, buyIns: [] },
      ],
    },
  ],
};

describe("group standings for a linked friend", () => {
  it("keeps only hosts who have seated the friend in a game", () => {
    assert.equal(playedInGroup(group), true);
    assert.equal(playedInGroup({ ...group, sessions: [] }), false);
    assert.equal(playedInGroup({ ...group, myPlayerId: "p-unseated" }), false);
  });

  it("ranks the shared games with the same rules as the host's own standings", () => {
    const result = buildGroupStandings(group);
    const own = buildStandings(
      group.sessions.map((session) => ({
        ...session,
        chipValue: session.chipValue ?? undefined,
        blindHistory: session.blindHistory ?? undefined,
        rebuyRules: session.rebuyRules ?? undefined,
        rakeRules: session.rakeRules ?? undefined,
        kind: session.kind === "ledger" ? session.kind : undefined,
        ended: session.date,
        ante: 0,
        results: session.results.map(({ buyIns, ...rest }) =>
          buyIns?.length ? { ...rest, buyIns } : rest,
        ),
      })),
    );
    assert.deepEqual(
      result.rows.map((row) => [row.name, row.rank, row.averageReturn, row.hands]),
      own.entries.map((entry) => [entry.name, entry.rank, entry.averageReturn, entry.hands]),
    );
    assert.equal(result.games, 2);
    assert.equal(result.lastPlayed, Date.UTC(2026, 8, 8));
  });

  it("sends every player's invested and net", () => {
    const rows = buildGroupStandings(group).rows;
    const me = rows.find((row) => row.isMe);
    const other = rows.find((row) => !row.isMe);
    assert.equal(me?.net, 500);
    assert.equal(me?.invested, 2000);
    assert.ok(other);
    assert.equal(other.net, -500);
    assert.equal(other.invested, 3000);
  });

  it("marks the friend's own row", () => {
    const rows = buildGroupStandings(group).rows;
    assert.deepEqual(
      rows.map((row) => [row.name, row.isMe]),
      [
        ["Debraj", true],
        ["Rajarshi", false],
      ],
    );
  });

  it("an empty buy-in list means the starting stack", () => {
    const debraj = buildGroupStandings(group).rows.find((row) => row.isMe);
    assert.equal(debraj?.invested, 2000);
    assert.equal(debraj?.eligibleSessions, 2);
  });

  it("sends no player, game or session IDs to the phone", () => {
    const sent = JSON.stringify(buildGroupStandings(group));
    for (const hidden of ["p-raj", "p-deb", "secret-session"]) {
      assert.equal(sent.includes(hidden), false, hidden);
    }
  });

  it("uses only games the friend played in: no other players, games or totals", () => {
    const withOthers: GroupSessions = {
      ...group,
      sessions: [
        group.sessions[0],
        {
          id: "secret-session-x",
          date: Date.UTC(2026, 8, 4),
          startStack: 1000,
          hands: 30,
          results: [
            { playerId: "p-raj", name: "Rajarshi", net: 5000, end: 6000, buyIns: [1000] },
            { playerId: "p-stranger", name: "Stranger", net: 900, end: 1900, buyIns: [1000] },
            { playerId: "p-top", name: "Topper", net: -5900, end: 0, buyIns: [1000, 5000] },
          ],
        },
        group.sessions[1],
      ],
    };
    const result = buildGroupStandings(withOthers);
    assert.equal(result.games, 2);
    assert.deepEqual(
      result.rows.map((row) => [row.name, row.rank, row.totalSessions, row.hands]),
      [
        ["Debraj", 1, 2, 30],
        ["Rajarshi", 2, 2, 30],
      ],
    );
    const sent = JSON.stringify(result);
    for (const hidden of ["Stranger", "Topper", "secret-session-x"]) {
      assert.equal(sent.includes(hidden), false, hidden);
    }
    // The graph's games are numbered 1…2 among shared games only.
    assert.deepEqual(result.chart[0].map(([index]) => index), [1, 2]);
  });

  it("sends one graph line per row: the games that changed that player's score", () => {
    const withMiss: GroupSessions = {
      ...group,
      sessions: [
        ...group.sessions,
        {
          id: "secret-session-3",
          date: Date.UTC(2026, 8, 15),
          startStack: 1000,
          hands: 5,
          results: [
            { playerId: "p-deb", name: "Debraj", net: 250, end: 1250, buyIns: [1000] },
            { playerId: "p-new", name: "Newcomer", net: -250, end: 750, buyIns: [1000] },
          ],
        },
      ],
    };
    const result = buildGroupStandings(withMiss);
    assert.equal(result.chart.length, result.rows.length);
    const line = (name: string) => result.chart[result.rows.findIndex((row) => row.name === name)];
    assert.deepEqual(line("Debraj"), [
      [1, -50, -50, -500],
      [2, 25, 100, 500],
      [3, 25, 25, 750],
    ]);
    // Rajarshi missed game 3, so the phone carries his average; it isn't sent.
    // The last number is the money won or lost so far.
    assert.deepEqual(line("Rajarshi"), [
      [1, 50, 50, 500],
      [2, 0, -50, -500],
    ]);
    assert.deepEqual(line("Newcomer"), [[3, -25, -25, -250]]);
  });

  it("handles a host with no saved games", () => {
    const result = buildGroupStandings({ ...group, sessions: [] });
    assert.deepEqual(result.rows, []);
    assert.deepEqual(result.chart, []);
    assert.deepEqual(result.sharedGames, []);
    assert.equal(result.lastPlayed, null);
  });

  it("lists the shared games newest first with everyone's results", () => {
    const result = buildGroupStandings(group);
    assert.deepEqual(
      result.sharedGames.map((game) => [game.date, game.hands]),
      [
        [Date.UTC(2026, 8, 8), 20],
        [Date.UTC(2026, 8, 1), 10],
      ],
    );
    assert.deepEqual(
      result.sharedGames[0].results.map((row) => [row.name, row.net, row.isMe]),
      [
        ["Rajarshi", -1000, false],
        ["Debraj", 1000, true],
      ],
    );
    assert.deepEqual(result.sharedGames[0].results[0].buyIns, [1000, 1000]);
    // An empty buy-in list (the starting stack) isn't sent.
    assert.equal("buyIns" in result.sharedGames[0].results[1], false);
  });

  it("sends how each game was played for its Details (migration 0027)", () => {
    const blindHistory = {
      smallBlindRatio: 0.5,
      plans: [{ effectiveHand: 1, baseBigBlind: 100, schedule: null }],
      levels: [{ handNo: 1, bigBlind: 100 }],
    };
    const detailed: GroupSessions = {
      ...group,
      sessions: [
        {
          ...group.sessions[0],
          kind: "hands",
          ante: 100,
          blindHistory: blindHistory as never,
          rebuyRules: { maxRebuys: 1, closeAtBigBlind: null },
          bigBlindAnte: false,
          rakeRules: null,
        },
        { ...group.sessions[1], kind: "ledger", ante: 0, blindHistory: null },
      ],
    };
    const [ledger, hands] = buildGroupStandings(detailed).sharedGames;
    assert.equal(hands.kind, undefined);
    assert.equal(hands.ante, 100);
    assert.deepEqual(hands.blindHistory, blindHistory);
    assert.deepEqual(hands.rebuyRules, { maxRebuys: 1, closeAtBigBlind: null });
    assert.equal("bigBlindAnte" in hands, false);
    assert.equal("rakeRules" in hands, false);
    assert.equal(ledger.kind, "ledger");
    assert.equal("ante" in ledger, false);
    // Games from before 0027 simply have none of these.
    assert.equal("ante" in buildGroupStandings(group).sharedGames[0], false);
  });

  it("passes each player's late join, cash-out and hands played on (migration 0028)", () => {
    const tracked: GroupSessions = {
      ...group,
      sessions: [
        {
          ...group.sessions[1],
          results: [
            { ...group.sessions[1].results[0], handsPlayed: 12, leftHand: 12, leftAt: Date.UTC(2026, 8, 8, 2) },
            // As jsonb sends them: nulls for what isn't set.
            { ...group.sessions[1].results[1], handsPlayed: 20, joinedHand: null as never },
          ],
        },
      ],
    };
    const [game] = buildGroupStandings(tracked).sharedGames;
    assert.deepEqual(
      game.results.map(({ handsPlayed, leftHand, leftAt, joinedHand }) => ({ handsPlayed, leftHand, leftAt, joinedHand })),
      [
        { handsPlayed: 12, leftHand: 12, leftAt: Date.UTC(2026, 8, 8, 2), joinedHand: undefined },
        { handsPlayed: 20, leftHand: undefined, leftAt: undefined, joinedHand: undefined },
      ],
    );
    assert.equal("joinedHand" in game.results[1], false);
  });

  it("finds a shared game by start time for its results card", () => {
    const withEnd: GroupSessions = {
      ...group,
      sessions: [{ ...group.sessions[1], ended: Date.UTC(2026, 8, 8, 3), ante: 100 }],
    };
    const game = findSharedGame(withEnd, Date.UTC(2026, 8, 8))!;
    assert.equal(game.name, "Rajarshi's game");
    assert.equal(game.ended, Date.UTC(2026, 8, 8, 3));
    assert.equal(game.ante, 100);
    assert.deepEqual(
      game.results.map((result) => [result.name, result.net]),
      [
        ["Rajarshi", -1000],
        ["Debraj", 1000],
      ],
    );
    assert.equal(buildGroupStandings(withEnd).sharedGames[0].ended, Date.UTC(2026, 8, 8, 3));
    assert.equal(findSharedGame(withEnd, Date.UTC(2026, 8, 1)), null);
  });

  it("finds no card for a game the friend didn't play in", () => {
    const missed: GroupSessions = {
      ...group,
      sessions: [
        {
          id: "secret-session-z",
          date: Date.UTC(2026, 8, 22),
          startStack: 1000,
          hands: 4,
          results: [
            { playerId: "p-raj", name: "Rajarshi", net: 0, end: 1000, buyIns: [1000] },
          ],
        },
      ],
    };
    assert.equal(findSharedGame(missed, Date.UTC(2026, 8, 22)), null);
  });

  it("leaves games the friend missed out of the games list", () => {
    const missed: GroupSessions = {
      ...group,
      sessions: [
        ...group.sessions,
        {
          id: "secret-session-y",
          date: Date.UTC(2026, 8, 20),
          startStack: 1000,
          hands: 8,
          results: [
            { playerId: "p-raj", name: "Rajarshi", net: 300, end: 1300, buyIns: [1000] },
            { playerId: "p-other", name: "Elsewhere", net: -300, end: 700, buyIns: [1000] },
          ],
        },
      ],
    };
    const result = buildGroupStandings(missed);
    assert.equal(result.sharedGames.length, 2);
    assert.equal(JSON.stringify(result).includes("Elsewhere"), false);
  });
});
