import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bankResult,
  noteBuyInPaid,
  owedByBank,
  owedToBank,
  restoreBankPlayer,
  setBuyInPaid,
  unpaidBuyIns,
} from "../lib/poker/bank.ts";
import {
  createLedgerGame,
  ledgerBuyIn,
  ledgerCashOut,
  ledgerJoin,
  ledgerReturn,
  ledgerSession,
  ledgerSetBuyInPaid,
  ledgerSetPaidOut,
  undoLedgerStep,
} from "../lib/poker/ledger.ts";
import { isSameSession } from "../lib/poker/session-conflict.ts";
import { validateSession } from "../lib/poker/session-validation.ts";
import { settleSession } from "../lib/poker/settle-up.ts";

function bankLedger(hostIsBank = true) {
  const game = createLedgerGame({
    gameName: "",
    sessionLabel: "Game 1",
    currency: "INR",
    chipUnit: "whole",
    startStack: 10_000,
    players: [
      { id: "asha", name: "Asha" },
      { id: "bikram", name: "Bikram" },
      { id: "lakshmi", name: "Lakshmi" },
    ],
    buyIns: null,
    startedAt: 1_000,
    hostIsBank,
    bankPlayerId: "asha",
  });
  assert.ok(game);
  return game;
}

describe("host is the bank: quick ledger", () => {
  it("starts with everyone paid, and marks a rebuy owed", () => {
    const game = bankLedger();
    assert.equal(game.hostIsBank, true);
    assert.equal(owedToBank(game, 1), 0);
    assert.ok(ledgerBuyIn(game, 1, 10_000, false));
    assert.deepEqual(unpaidBuyIns(game, 1), [1]);
    assert.equal(owedToBank(game, 1), 10_000);
    assert.equal(undoLedgerStep(game), "Bikram buys in again for ₹10,000");
    assert.equal(owedToBank(game, 1), 0);
  });

  it("never asks the host to pay themselves", () => {
    const game = bankLedger();
    assert.ok(ledgerBuyIn(game, 0, 10_000, false));
    assert.equal(owedToBank(game, 0), 0);
    assert.equal(setBuyInPaid(game, 0, 1, false), false);
  });

  it("marks buy-ins paid as the money comes in, with Undo", () => {
    const game = bankLedger();
    assert.ok(ledgerSetBuyInPaid(game, 2, 0, false));
    assert.equal(game.log[0], "Lakshmi owes the bank ₹10,000");
    assert.equal(owedToBank(game, 2), 10_000);
    assert.equal(ledgerSetBuyInPaid(game, 2, 0, false), false, "no change");
    assert.ok(ledgerSetBuyInPaid(game, 2, 0, true));
    assert.equal(game.log[0], "Lakshmi pays the bank ₹10,000");
    assert.equal(owedToBank(game, 2), 0);
    undoLedgerStep(game);
    assert.equal(owedToBank(game, 2), 10_000);
  });

  it("records cash-outs paid at the table, and clears it on return", () => {
    const game = bankLedger();
    assert.ok(ledgerCashOut(game, 1, 20_000, 5_000, true));
    assert.equal(game.players[1].paidOut, true);
    assert.equal(owedByBank(game, 1), 0);
    assert.ok(ledgerSetPaidOut(game, 1, false));
    assert.equal(game.log[0], "The bank owes Bikram ₹20,000");
    assert.equal(owedByBank(game, 1), 20_000);
    assert.ok(ledgerReturn(game, 1));
    assert.equal(game.players[1].paidOut, undefined);
  });

  it("asks a late joiner whether they paid", () => {
    const game = bankLedger();
    assert.ok(ledgerJoin(game, { id: "dev", name: "Dev" }, 5_000, 2_000, false));
    assert.equal(owedToBank(game, 3), 5_000);
  });

  it("saves what was paid, and the server accepts it", () => {
    const game = bankLedger();
    ledgerBuyIn(game, 2, 10_000, false);
    ledgerCashOut(game, 1, 20_000, 5_000, true);
    const session = ledgerSession(game, [20_000, null, 0], 9_000);
    assert.deepEqual(
      session.results.map((result) => [
        result.bankPaidIn,
        result.bankPaidOut,
        result.bank ?? false,
      ]),
      [
        [10_000, 0, true],
        [10_000, 20_000, false],
        [10_000, 0, false],
      ],
    );
    const checked = validateSession(session);
    assert.ok(isSameSession({ ...checked, sessionNumber: 1 }, checked));
    // Bikram was paid at the table; Lakshmi owes her unpaid rebuy.
    assert.deepEqual(
      settleSession(checked).transfers.map((t) => [t.from, t.to, t.cents / 100]),
      [["Lakshmi", "Asha", 10_000]],
    );
  });

  it("saves nothing extra when the host isn't the bank", () => {
    const game = bankLedger(false);
    ledgerBuyIn(game, 1, 10_000, false);
    const session = ledgerSession(game, [10_000, 30_000, 0], 9_000);
    assert.equal(game.players[1].unpaidBuyIns, undefined);
    assert.ok(session.results.every((result) => result.bankPaidIn === undefined));
  });
});

describe("host is the bank: checks and continuing", () => {
  it("refuses paid amounts that can't be right", () => {
    const session = ledgerSession(bankLedger(), [10_000, 10_000, 10_000], 9_000);
    const broken = (change: (result: (typeof session.results)[number]) => void) => {
      const copy = structuredClone(session);
      change(copy.results[1]);
      return copy;
    };
    assert.throws(() => validateSession(broken((r) => (r.bankPaidIn = 10_001))));
    assert.throws(() => validateSession(broken((r) => (r.bankPaidOut = 10_001))));
    assert.throws(() => validateSession(broken((r) => delete r.bankPaidOut)));
    assert.throws(() => validateSession(broken((r) => (r.bank = true))));
  });

  it("drops owed marks an undo left behind", () => {
    const game = bankLedger();
    game.players[1].buyIns = [10_000, 10_000];
    game.players[1].unpaidBuyIns = [1];
    // A hand-by-hand undo took the rebuy back, leaving its mark.
    game.players[1].buyIns = [10_000];
    assert.equal(owedToBank(game, 1), 0);
    game.players[1].buyIns = [10_000, 5_000];
    noteBuyInPaid(game, 1, true);
    assert.equal(owedToBank(game, 1), 0, "the new rebuy is paid");
  });

  it("puts what was owed back on the latest buy-ins", () => {
    assert.deepEqual(
      restoreBankPlayer(
        { startStack: 10_000 },
        {
          name: "Bikram",
          net: 0,
          end: 25_000,
          buyIns: [10_000, 10_000, 5_000],
          bankPaidIn: 10_000,
          bankPaidOut: 0,
        },
      ),
      { unpaidBuyIns: [1, 2] },
    );
    assert.deepEqual(
      restoreBankPlayer(
        { startStack: 10_000 },
        { name: "Asha", net: 0, end: 10_000, bankPaidIn: 10_000, bankPaidOut: 10_000 },
      ),
      { paidOut: true },
    );
  });

  it("gives the bank's part of a result", () => {
    const game = bankLedger();
    ledgerBuyIn(game, 1, 10_000, false);
    assert.deepEqual(bankResult(game, 1, 0), { bankPaidIn: 10_000, bankPaidOut: 0 });
    assert.deepEqual(bankResult(game, 0, 0), {
      bankPaidIn: 10_000,
      bankPaidOut: 0,
      bank: true,
    });
  });
});

describe("host is the bank: live link", () => {
  it("shows what's owed either way, and the server checks it", async () => {
    const { buildLiveLedgerSnapshot, deriveLiveLedgerView, validateLiveLedgerSnapshot } =
      await import("../lib/poker/live-ledger.ts");
    const game = bankLedger();
    ledgerBuyIn(game, 2, 10_000, false);
    ledgerCashOut(game, 1, 20_000, 5_000, false);
    const snapshot = validateLiveLedgerSnapshot(
      JSON.parse(JSON.stringify(buildLiveLedgerSnapshot(game))),
    );
    const view = deriveLiveLedgerView(snapshot);
    const row = (name: string) => view.players.find((player) => player.name === name)!;
    assert.equal(row("Lakshmi").owed, 10_000);
    assert.equal(row("Bikram").bankOwes, 20_000);
    assert.equal(row("Asha").owed, undefined);
    const tooMuch = structuredClone(snapshot);
    tooMuch.players[2].owed = 20_001;
    assert.throws(() => validateLiveLedgerSnapshot(tooMuch));
  });
});
