import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buyInTimeNote,
  clockTime,
  latestBuyInTime,
  noteBuyInTime,
  splitLogTime,
  withLogTime,
} from "../lib/poker/buy-in-times.ts";
import {
  createLedgerGame,
  ledgerBuyIn,
  ledgerJoin,
  ledgerUndoLine,
  undoLedgerStep,
} from "../lib/poker/ledger.ts";
import type { Player } from "../lib/poker/types.ts";

const START = new Date(2026, 10, 11, 20, 0).getTime();
const REBUY = new Date(2026, 10, 11, 22, 42).getTime();

function game() {
  const created = createLedgerGame({
    players: [
      { id: "a", name: "Asha" },
      { id: "d", name: "Dev" },
    ],
    gameName: "",
    sessionLabel: "",
    currency: "INR",
    chipUnit: "whole",
    startStack: 1000,
    buyIns: null,
    startedAt: START,
  });
  assert.ok(created);
  return created;
}

describe("buy-in times", () => {
  it("records the start, rebuys and late joins, and writes them on the log line", () => {
    const ledger = game();
    assert.deepEqual(ledger.players[1].buyInTimes, [START]);
    assert.equal(buyInTimeNote(ledger.players[1], START), null);

    assert.ok(ledgerBuyIn(ledger, 1, 1000, true, REBUY));
    assert.deepEqual(ledger.players[1].buyInTimes, [START, REBUY]);
    assert.equal(latestBuyInTime(ledger.players[1]), REBUY);
    assert.equal(buyInTimeNote(ledger.players[1], START), `last ${clockTime(REBUY)}`);
    assert.deepEqual(splitLogTime(ledger.log[0]), {
      text: "Dev buys in again for ₹1,000",
      time: clockTime(REBUY),
    });

    assert.ok(ledgerJoin(ledger, { id: "m", name: "Meera" }, 1000, REBUY));
    assert.equal(buyInTimeNote(ledger.players[2], START), `joined ${clockTime(REBUY)}`);
  });

  it("goes back with Undo", () => {
    const ledger = game();
    ledgerBuyIn(ledger, 1, 1000, true, REBUY);
    // The Undo button names the change without its time.
    assert.equal(ledgerUndoLine(ledger), "Dev buys in again for ₹1,000");
    undoLedgerStep(ledger);
    assert.deepEqual(ledger.players[1].buyInTimes, [START]);
  });

  it("shows nothing for older games and handles a taken-back buy-in", () => {
    const older: Player = { name: "Old", stack: 0, buyIns: [1000, 500] };
    noteBuyInTime(older, REBUY);
    assert.equal(older.buyInTimes, undefined);
    assert.equal(latestBuyInTime(older), null);

    // A rebuy taken back leaves its time behind; the next one replaces it.
    const player: Player = { name: "Dev", stack: 0, buyIns: [1000], buyInTimes: [START, REBUY] };
    assert.equal(latestBuyInTime(player), START);
    player.buyIns = [1000, 700];
    noteBuyInTime(player, REBUY + 60_000);
    assert.deepEqual(player.buyInTimes, [START, REBUY + 60_000]);
  });

  it("splits a time off a log line and leaves other lines alone", () => {
    const line = withLogTime("Before hand 4: Dev joins and buys in for ₹20,000", REBUY);
    assert.equal(splitLogTime(line).text, "Before hand 4: Dev joins and buys in for ₹20,000");
    assert.equal(splitLogTime("Asha cashes out with ₹1,800").time, null);
    assert.deepEqual(splitLogTime("Dev buys in again for ₹500 at 10:42 pm"), {
      text: "Dev buys in again for ₹500",
      time: "10:42 pm",
    });
    assert.equal(splitLogTime("Meet at 9:05 PM").time, "9:05 PM");
  });
});
