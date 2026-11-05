import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createLedgerGame, ledgerBuyIn, ledgerCashOut } from "../lib/poker/ledger.ts";
import {
  buildLiveLedgerSnapshot,
  deriveLiveLedgerView,
  isLiveLedgerView,
  LIVE_LEDGER_ACTIVITY,
  validateLiveLedgerSnapshot,
  type LiveLedgerSnapshot,
} from "../lib/poker/live-ledger.ts";

const START = 1_760_000_000_000;

function newGame() {
  const game = createLedgerGame({
    gameName: "",
    sessionLabel: "Game 4",
    currency: "INR",
    chipUnit: "whole",
    startStack: 1000,
    players: [
      { id: "p-asha", name: "Asha" },
      { id: "p-arjun", name: "Arjun" },
      { id: "p-bikram", name: "Bikram" },
    ],
    buyIns: null,
    startedAt: START,
  });
  assert.ok(game);
  return game;
}

/** A snapshot as sent, through JSON like the real request. */
function sent(snapshot: LiveLedgerSnapshot) {
  return JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
}

describe("quick ledger live link", () => {
  it("sends buy-ins, cash-outs and the latest changes", () => {
    const game = newGame();
    ledgerBuyIn(game, 1, 1000);
    ledgerCashOut(game, 0, 1800);
    const snapshot = buildLiveLedgerSnapshot(game, (player) =>
      player.name === "Asha" ? "p01" : undefined,
    );
    assert.equal(snapshot.kind, "ledger");
    assert.equal(snapshot.gameName, "Game 4");
    assert.equal(snapshot.startedAt, START);
    assert.deepEqual(snapshot.players, [
      { name: "Asha", avatar: "p01", buyIns: [1000], cashedOut: 1800 },
      { name: "Arjun", buyIns: [1000, 1000] },
      { name: "Bikram", buyIns: [1000] },
    ]);
    assert.equal(snapshot.activity[0], "Asha cashes out with ₹1,800");
    assert.equal(snapshot.activity.length, 2);
  });

  it("keeps only the latest changes", () => {
    const game = newGame();
    for (let index = 0; index < LIVE_LEDGER_ACTIVITY + 5; index += 1) {
      ledgerBuyIn(game, 2, 500);
    }
    assert.equal(buildLiveLedgerSnapshot(game).activity.length, LIVE_LEDGER_ACTIVITY);
  });

  it("derives the totals, seated players first in the host's order", () => {
    const game = newGame();
    ledgerBuyIn(game, 1, 1000);
    ledgerCashOut(game, 0, 1800);
    const view = deriveLiveLedgerView(
      validateLiveLedgerSnapshot(sent(buildLiveLedgerSnapshot(game))),
    );
    assert.equal(view.kind, "ledger");
    assert.equal(view.bought, 4000);
    assert.equal(view.cashedOut, 1800);
    assert.equal(view.onTable, 2200);
    assert.deepEqual(
      view.players.map((player) => [
        player.name,
        player.buyIns,
        player.invested,
        player.cashedOut,
        player.net,
      ]),
      [
        ["Arjun", 2, 2000, undefined, undefined],
        ["Bikram", 1, 1000, undefined, undefined],
        ["Asha", 1, 1000, 1800, 800],
      ],
    );
    assert.ok(isLiveLedgerView(view));
  });

  it("shows a cash-out larger than the table as it is", () => {
    const game = newGame();
    ledgerCashOut(game, 0, 5000);
    const view = deriveLiveLedgerView(
      validateLiveLedgerSnapshot(sent(buildLiveLedgerSnapshot(game))),
    );
    assert.equal(view.onTable, -2000);
  });

  it("refuses snapshots it can't trust", () => {
    const good = sent(buildLiveLedgerSnapshot(newGame()));
    const players = good.players as Record<string, unknown>[];
    const cases: [string, Record<string, unknown>][] = [
      ["no kind", { ...good, kind: undefined }],
      ["one player", { ...good, players: players.slice(0, 1) }],
      ["a zero buy-in", { ...good, players: [{ ...players[0], buyIns: [0] }, ...players.slice(1)] }],
      ["a negative cash-out", { ...good, players: [{ ...players[0], cashedOut: -1 }, ...players.slice(1)] }],
      ["the same name twice", { ...good, players: [players[0], { ...players[1], name: "asha" }, players[2]] }],
      ["activity that isn't text", { ...good, activity: [42] }],
      ["an overlong line", { ...good, activity: ["x".repeat(201)] }],
      ["no game name", { ...good, gameName: " " }],
    ];
    for (const [label, snapshot] of cases) {
      assert.throws(() => validateLiveLedgerSnapshot(snapshot), Error, label);
    }
  });

  it("drops unknown avatars and flattens line breaks", () => {
    const good = sent(buildLiveLedgerSnapshot(newGame()));
    const players = good.players as Record<string, unknown>[];
    const snapshot = validateLiveLedgerSnapshot({
      ...good,
      players: [{ ...players[0], avatar: "not-an-avatar" }, ...players.slice(1)],
      activity: ["Asha buys in\nagain"],
    });
    assert.equal(snapshot.players[0].avatar, undefined);
    assert.deepEqual(snapshot.activity, ["Asha buys in again"]);
  });

  it("leaves hand-by-hand views to the standings page", () => {
    assert.equal(isLiveLedgerView({ gameName: "Game 26", standings: [] }), false);
  });
});
