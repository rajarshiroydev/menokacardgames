import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planImport, sessionsInBackup } from "../lib/poker/import-plan.ts";
import type { PlayerProfile, PokerSession } from "../lib/poker/types.ts";

const raj: PlayerProfile = { id: "p-raj", name: "Raj", createdAt: 1 };
const sam: PlayerProfile = { id: "p-sam", name: "Sam", createdAt: 1 };
const old: PlayerProfile = { id: "p-old", name: "Old", createdAt: 1, discardedAt: 2 };
const ledgerPlayers = [raj, sam, old];

function game(id: string, results: PokerSession["results"]): PokerSession {
  return {
    id,
    name: `Game ${id}`,
    sessionNumber: 1,
    date: 1720000000000,
    ended: 1720000300000,
    ante: 100,
    startStack: 10000,
    hands: 4,
    results,
  };
}

const ledger = [
  game("s1", [
    { playerId: "p-raj", name: "Raj", net: 500, end: 10500 },
    { playerId: "p-sam", name: "Sam", net: -500, end: 9500 },
  ]),
  game("s2", [
    { playerId: "p-raj", name: "Raj", net: -100, end: 9900 },
    { playerId: "p-sam", name: "Sam", net: 100, end: 10100 },
  ]),
];

describe("import preview", () => {
  it("adds nothing when the ledger's own export is imported again", () => {
    // Exactly what Export Backup writes.
    const file = JSON.parse(
      JSON.stringify({ exported: Date.now(), sessions: ledger }, null, 2),
    );
    const plan = planImport(
      sessionsInBackup(file)!,
      ledger.map((session) => session.id),
      ledgerPlayers,
    );
    assert.equal(plan.additions.length, 0);
    assert.equal(plan.alreadySaved, 2);
    assert.deepEqual(plan.players, []);
    assert.equal(plan.blocked, false);
  });

  it("treats discarded games as already saved", () => {
    const plan = planImport([ledger[0]], ["s1"], ledgerPlayers);
    assert.equal(plan.additions.length, 0);
    assert.equal(plan.alreadySaved, 1);
  });

  it("maps each player the way the server will save them", () => {
    const plan = planImport(
      [
        game("n1", [
          { playerId: "p-raj", name: "Raj (old spelling)", net: 0, end: 10000 },
          { name: "  sam ", net: 0, end: 10000 },
          { name: "OLD", net: 0, end: 10000 },
          { name: "Neha", net: 0, end: 10000 },
        ]),
        game("n2", [
          { name: "neha", net: 0, end: 10000 },
          { playerId: "p-raj", name: "Raj", net: 0, end: 10000 },
        ]),
      ],
      ["s1", "s2"],
      ledgerPlayers,
    );

    assert.equal(plan.additions.length, 2);
    assert.equal(plan.blocked, false);
    assert.deepEqual(
      plan.players.map((mapping) => [
        mapping.kind,
        mapping.fileName,
        "player" in mapping ? mapping.player.id : null,
        mapping.games,
      ]),
      [
        ["existing", "Raj (old spelling)", "p-raj", 2],
        ["existing", "sam", "p-sam", 1],
        ["discarded", "OLD", "p-old", 1],
        ["new", "Neha", null, 2],
      ],
    );
  });

  it("blocks player records from another ledger", () => {
    const plan = planImport(
      [
        game("n1", [
          { playerId: "someone-elses-id", name: "Raj", net: 0, end: 10000 },
          { name: "Sam", net: 0, end: 10000 },
        ]),
      ],
      [],
      ledgerPlayers,
    );
    assert.equal(plan.blocked, true);
    assert.equal(plan.players[0].kind, "unknown-record");
  });

  it("skips unreadable entries and repeated IDs in the file", () => {
    const valid = game("n1", [
      { name: "Raj", net: 0, end: 10000 },
      { name: "Sam", net: 0, end: 10000 },
    ]);
    const plan = planImport(
      [
        valid,
        { ...valid, hands: 9 },
        { id: "n2" },
        { id: "", results: valid.results },
        { id: "n3", results: [{ name: "   ", net: 0, end: 0 }] },
        null,
        "text",
      ],
      [],
      ledgerPlayers,
    );
    assert.deepEqual(
      plan.additions.map((session) => session.id),
      ["n1"],
    );
    assert.equal(plan.additions[0].hands, 4);
    assert.equal(plan.duplicatesInFile, 1);
    assert.equal(plan.unreadable, 5);
  });

  it("reads both backup shapes", () => {
    assert.deepEqual(sessionsInBackup([1]), [1]);
    assert.deepEqual(sessionsInBackup({ sessions: [1] }), [1]);
    assert.equal(sessionsInBackup({ games: [] }), null);
    assert.equal(sessionsInBackup("x"), null);
  });
});
