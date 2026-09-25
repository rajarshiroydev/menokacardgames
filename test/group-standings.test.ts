import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildGroupStandings,
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
  it("ranks the host's games exactly as the host's own standings do", () => {
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
      result.rows.map((row) => [row.name, row.rank, row.averageReturn, row.net, row.hands]),
      own.entries.map((entry) => [entry.name, entry.rank, entry.averageReturn, entry.net, entry.hands]),
    );
    assert.equal(result.games, 2);
    assert.equal(result.lastPlayed, Date.UTC(2026, 8, 8));
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

  it("handles a host with no saved games", () => {
    const result = buildGroupStandings({ ...group, sessions: [] });
    assert.deepEqual(result.rows, []);
    assert.equal(result.lastPlayed, null);
  });
});
