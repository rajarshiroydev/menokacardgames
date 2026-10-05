import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildGroupStandings,
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

  it("sends money only on the friend's own row", () => {
    const rows = buildGroupStandings(group).rows;
    const me = rows.find((row) => row.isMe);
    const other = rows.find((row) => !row.isMe);
    assert.equal(me?.net, 500);
    assert.equal(me?.invested, 2000);
    assert.ok(other);
    assert.equal("net" in other, false);
    assert.equal("invested" in other, false);
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
      [1, -50, -50],
      [2, 25, 100],
      [3, 25, 25],
    ]);
    // Rajarshi missed game 3, so the phone carries his average; it isn't sent.
    assert.deepEqual(line("Rajarshi"), [
      [1, 50, 50],
      [2, 0, -50],
    ]);
    assert.deepEqual(line("Newcomer"), [[3, -25, -25]]);
  });

  it("handles a host with no saved games", () => {
    const result = buildGroupStandings({ ...group, sessions: [] });
    assert.deepEqual(result.rows, []);
    assert.deepEqual(result.chart, []);
    assert.equal(result.lastPlayed, null);
  });
});
