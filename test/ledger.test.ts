import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { continuationError } from "../lib/poker/continue-session.ts";
import { summarizeGameBackup, validateGameBackupState } from "../lib/poker/game-backup.ts";
import {
  createLedgerGame,
  LEDGER_UNDO_LIMIT,
  ledgerBuyIn,
  ledgerCashOut,
  ledgerCountGap,
  ledgerJoin,
  ledgerReturn,
  ledgerSeated,
  ledgerSession,
  ledgerTotals,
  ledgerUndoLine,
  undoLedgerStep,
} from "../lib/poker/ledger.ts";
import { isSameSession, type SavedSession } from "../lib/poker/session-conflict.ts";
import { validateSession } from "../lib/poker/session-validation.ts";
import { buildStandings } from "../lib/poker/standings.ts";
import type { GameState } from "../lib/poker/types.ts";

const START = 1_760_000_000_000;

function newGame(buyIns: number[] | null = null) {
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
    buyIns,
    startedAt: START,
  });
  assert.ok(game);
  return game;
}

describe("quick ledger game", () => {
  it("starts with everyone bought in and no hands or blinds", () => {
    const game = newGame();
    assert.equal(game.kind, "ledger");
    assert.equal(game.sessionLabel, "Game 4");
    assert.equal(game.hand, null);
    assert.equal(game.handNo, 0);
    assert.equal(game.ante, 0);
    assert.deepEqual(game.blindPlans, []);
    assert.deepEqual(
      game.players.map((player) => [player.name, player.stack, player.buyIns]),
      [
        ["Asha", 0, [1000]],
        ["Arjun", 0, [1000]],
        ["Bikram", 0, [1000]],
      ],
    );
    assert.equal(game.customBuyIns, undefined);
    assert.deepEqual(ledgerTotals(game), { bought: 3000, cashedOut: 0, onTable: 3000 });
  });

  it("takes each player's own first buy-in", () => {
    const game = newGame([1000, 500, 2000]);
    assert.equal(game.customBuyIns, true);
    assert.equal(ledgerTotals(game).bought, 3500);
  });

  it("refuses too few players, repeated players or empty buy-ins", () => {
    const base = {
      gameName: "",
      sessionLabel: "Game 1",
      currency: "INR",
      chipUnit: "whole" as const,
      startStack: 1000,
      buyIns: null,
      startedAt: START,
    };
    assert.equal(createLedgerGame({ ...base, players: [{ name: "Asha" }] }), null);
    assert.equal(
      createLedgerGame({ ...base, players: [{ name: "Asha" }, { name: " asha " }] }),
      null,
    );
    assert.equal(
      createLedgerGame({
        ...base,
        players: [{ name: "Asha" }, { name: "Arjun" }],
        buyIns: [1000, 0],
      }),
      null,
    );
  });

  it("records rebuys at any time, busted or not", () => {
    const game = newGame();
    assert.equal(ledgerBuyIn(game, 1, 1000), true);
    assert.equal(ledgerBuyIn(game, 1, 500), true);
    assert.deepEqual(game.players[1].buyIns, [1000, 1000, 500]);
    assert.equal(game.customBuyIns, true);
    assert.equal(game.log[0], "Arjun buys in again for ₹500");
    assert.equal(ledgerTotals(game).bought, 4500);
    assert.equal(ledgerBuyIn(game, 1, 0), false);
    assert.equal(ledgerBuyIn(game, 9, 1000), false);
  });

  it("adds a late player at the end", () => {
    const game = newGame();
    assert.equal(ledgerJoin(game, { id: "p-chirag", name: "Chirag" }, 1500), true);
    assert.equal(game.players[3].name, "Chirag");
    assert.deepEqual(game.players[3].buyIns, [1500]);
    assert.equal(game.log[0], "Chirag joins for ₹1,500");
    // Already in the game.
    assert.equal(ledgerJoin(game, { id: "p-asha", name: "Asha" }, 1000), false);
  });

  it("cashes a player out with their chips and brings them back", () => {
    const game = newGame();
    assert.equal(ledgerCashOut(game, 0, 1800), true);
    assert.equal(game.players[0].left, true);
    assert.equal(game.players[0].stack, 1800);
    assert.deepEqual(ledgerSeated(game), [1, 2]);
    assert.deepEqual(ledgerTotals(game), { bought: 3000, cashedOut: 1800, onTable: 1200 });
    // A cashed-out player can't buy in or cash out again.
    assert.equal(ledgerBuyIn(game, 0, 1000), false);
    assert.equal(ledgerCashOut(game, 0, 100), false);

    assert.equal(ledgerReturn(game, 0), true);
    assert.equal(game.players[0].left, undefined);
    assert.equal(game.players[0].stack, 0);
    assert.equal(game.log[0], "Asha is back at the table with ₹1,800");
    assert.deepEqual(ledgerTotals(game), { bought: 3000, cashedOut: 0, onTable: 3000 });
  });

  it("refuses a negative or fractional cash-out", () => {
    const game = newGame();
    assert.equal(ledgerCashOut(game, 0, -1), false);
    assert.equal(ledgerCashOut(game, 0, 1.5), false);
    assert.equal(game.players[0].left, undefined);
  });

  it("undoes changes newest first, with their log lines", () => {
    const game = newGame();
    ledgerBuyIn(game, 1, 500);
    ledgerCashOut(game, 2, 0);
    assert.equal(ledgerUndoLine(game), "Bikram cashes out with ₹0");

    assert.equal(undoLedgerStep(game), "Bikram cashes out with ₹0");
    assert.equal(game.players[2].left, undefined);
    assert.equal(undoLedgerStep(game), "Arjun buys in again for ₹500");
    assert.deepEqual(game.players[1].buyIns, [1000]);
    // The own-amounts flag the rebuy turned on goes back too.
    assert.equal(game.customBuyIns, undefined);
    assert.deepEqual(game.log, []);
    assert.equal(undoLedgerStep(game), null);
  });

  it("keeps a limited number of undo steps", () => {
    const game = newGame();
    for (let step = 0; step < LEDGER_UNDO_LIMIT + 5; step += 1) {
      ledgerBuyIn(game, 0, 1);
    }
    assert.equal(game.ledgerUndo?.length, LEDGER_UNDO_LIMIT);
  });

  it("doesn't change games played hand by hand", () => {
    const game = { ...newGame(), kind: undefined } as GameState;
    assert.equal(ledgerBuyIn(game, 0, 1000), false);
    assert.equal(ledgerCashOut(game, 0, 1000), false);
  });
});

describe("quick ledger count and save", () => {
  function playedGame() {
    const game = newGame();
    ledgerBuyIn(game, 1, 1000); // Arjun: 2,000 in
    ledgerCashOut(game, 0, 1600, START + 1_800_000); // Asha leaves with 1,600 (+600)
    return game; // 4,000 bought, 2,400 on the table
  }

  it("measures the count against the chips on the table", () => {
    const game = playedGame();
    assert.equal(ledgerCountGap(game, []), 2400);
    assert.equal(ledgerCountGap(game, [undefined, 1000, 1000]), 400);
    assert.equal(ledgerCountGap(game, [undefined, 1500, 1000]), -100);
    // A cashed-out player's box doesn't count.
    assert.equal(ledgerCountGap(game, [5000, 1400, 1000]), 0);
  });

  it("saves a balanced count as a valid ledger game", () => {
    const game = playedGame();
    const session = ledgerSession(game, [null, 1400, 1000], START + 3_600_000);
    assert.deepEqual(session, {
      kind: "ledger",
      id: `s${START}`,
      date: START,
      ended: START + 3_600_000,
      ante: 0,
      startStack: 1000,
      hands: 0,
      results: [
        // Cashed out half an hour in (games tracking players, 2026-10-26).
        { playerId: "p-asha", name: "Asha", net: 600, end: 1600, leftAt: START + 1_800_000 },
        { playerId: "p-arjun", name: "Arjun", net: -600, end: 1400, buyIns: [1000, 1000] },
        { playerId: "p-bikram", name: "Bikram", net: 0, end: 1000 },
      ],
      // The log is saved with the game, naming players in seat order.
      actionLog: {
        players: [
          { id: "p-asha", name: "Asha" },
          { id: "p-arjun", name: "Arjun" },
          { id: "p-bikram", name: "Bikram" },
        ],
        lines: game.log,
      },
    });
    assert.deepEqual(validateSession(session), session);
  });

  it("refuses a count that is short or over", () => {
    const game = playedGame();
    assert.throws(
      () => ledgerSession(game, [null, 1400, 900], START),
      /₹100 short/,
    );
    assert.throws(
      () => ledgerSession(game, [null, 1400, 1100], START),
      /₹100 over/,
    );
  });

  it("ranks a ledger game like any other", () => {
    const session = ledgerSession(playedGame(), [null, 1400, 1000], START + 1);
    const standings = buildStandings([{ ...session, sessionNumber: 1 }]);
    const asha = standings.entries.find((entry) => entry.name === "Asha");
    assert.ok(asha);
    assert.equal(asha.rank, 1);
    assert.equal(asha.averageReturn, 60);
    assert.equal(asha.hands, 0);
  });
});

describe("saved quick ledger games", () => {
  const ledgerGame = {
    kind: "ledger",
    id: "s1",
    date: START,
    ended: START + 1,
    ante: 0,
    startStack: 1000,
    hands: 0,
    results: [
      { name: "Asha", net: 200, end: 1200 },
      { name: "Arjun", net: -200, end: 800 },
    ],
  };

  it("needs no hands or blinds", () => {
    assert.equal(validateSession(ledgerGame).kind, "ledger");
  });

  it("refuses hands, blinds or per-hand rules", () => {
    for (const extra of [
      { hands: 3 },
      { ante: 100 },
      { bigBlindAnte: true },
      { rebuyRules: { maxRebuys: 1, closeAtBigBlind: null } },
      { rakeRules: { percent: 5, cap: 100 } },
      {
        blindHistory: {
          plans: [{ effectiveHand: 1, effectiveAt: START, baseBigBlind: 100, schedule: null }],
          levels: [{ handNo: 1, dealtAt: START, bigBlind: 100 }],
        },
      },
    ]) {
      assert.throws(
        () => validateSession({ ...ledgerGame, ...extra }),
        /quick ledger/i,
        JSON.stringify(extra),
      );
    }
  });

  it("still needs hands and a big blind in a game played hand by hand", () => {
    const { kind: _kind, ...handByHand } = ledgerGame;
    void _kind;
    assert.throws(() => validateSession(handByHand), /whole number/);
    assert.throws(() => validateSession({ ...ledgerGame, kind: "tournament" }), /game kind/);
  });

  it("must still balance", () => {
    assert.throws(
      () =>
        validateSession({
          ...ledgerGame,
          results: [
            { name: "Asha", net: 300, end: 1300 },
            { name: "Arjun", net: -200, end: 800 },
          ],
        }),
      /balance/,
    );
  });

  it("can't be continued", () => {
    const saved = { ...validateSession(ledgerGame), sessionNumber: 1 } as SavedSession;
    assert.match(continuationError(saved, saved) ?? "", /can't be continued/);
  });

  it("isn't the same game as one played hand by hand with the same results", () => {
    const saved = { ...validateSession(ledgerGame), sessionNumber: 1 } as SavedSession;
    assert.equal(isSameSession(saved, validateSession(ledgerGame)), true);
    const { kind: _kind, ...rest } = saved;
    void _kind;
    assert.equal(isSameSession({ ...rest, sessionNumber: 1 }, validateSession(ledgerGame)), false);
  });
});

describe("quick ledger backups", () => {
  it("back up and summarize without hands", () => {
    const game = newGame();
    const state = validateGameBackupState(structuredClone(game), `s${START}`);
    assert.deepEqual(summarizeGameBackup(`s${START}`, state, START, true), {
      gameId: `s${START}`,
      thisDevice: true,
      name: "Game 4",
      ledger: true,
      handNo: 0,
      handInProgress: false,
      players: 3,
      updatedAt: START,
    });
  });
});
